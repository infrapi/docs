---
title: Build an EC2 instance API with lib
description: Write your own platform service in Go with infrapi/lib and the AWS SDK for Go v2 — tenant-scoped EC2 instances, the platform's sizes, RFC 9457 errors. Runs against a local AWS emulator, no AWS account needed.
products: [lib]
level: Intermediate
duration: 30 min
weight: 20
---

[tofu-api](generate-an-api-contract.md) gets you an API from a Terraform
provider without code. When you need your own logic, write the service
yourself: lib gives it the same URL layout, errors, health checks, metrics and
tracing as every other InfraPI API, and you call AWS with the
[AWS SDK for Go v2](https://github.com/aws/aws-sdk-go-v2).

In this tutorial you build `compute`, a service that lets each tenant
(namespace) create, list and terminate its own EC2 instances, in three sizes
the platform chooses. You run it against [moto](https://github.com/getmoto/moto),
a local emulator of the AWS APIs, and only then, if you want, against AWS.

**You will need:** Go 1.26.7 or later, `curl`, and either Python 3 (`pip`)
or Docker for moto.

## Create the module

```bash
mkdir compute && cd compute
go mod init example.com/compute
go get github.com/infrapi/lib@v0.12.1 \
  github.com/aws/aws-sdk-go-v2/config \
  github.com/aws/aws-sdk-go-v2/service/ec2 \
  github.com/aws/aws-sdk-go-v2/service/ssm \
  github.com/aws/smithy-go
```

> [!IMPORTANT]
> Pin `@v0.12.1`. Without a version, `go get` picks older `v1.x` tags, which
> lack `pkg/api` and `server.APIGroup`.

lib reads its configuration from a dotenv file, never from the environment.
Create `.env` next to `go.mod`:

```bash
INFRAPI_APP_NAME="compute"
INFRAPI_APP_PLATFORM="sandbox"
INFRAPI_APP_REGION="eu-west-1"
INFRAPI_APP_LOCATION="dc1"
INFRAPI_APP_URL="http://localhost:8080"
INFRAPI_APP_LISTEN_ADDRESS="127.0.0.1:8080"
```

What each key means is in the [config reference](../products/lib/docs/packages/config.md).

## Declare the API

Create `main.go`. The sections below are that file, top to bottom: paste
each one after the previous.

```go
// Command compute is an EC2 instance API built on infrapi/lib: one API group,
// three routes, each tenant's instances kept apart by a tag.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/smithy-go"
	"github.com/gin-gonic/gin"

	"github.com/infrapi/lib/pkg/api"
	"github.com/infrapi/lib/pkg/config"
	infraerrors "github.com/infrapi/lib/pkg/errors"
	"github.com/infrapi/lib/pkg/listener"
	"github.com/infrapi/lib/pkg/server"
)

// compute is served under /apis/compute.example.com/v1/namespaces/:namespace.
var compute = api.Group{Name: "compute", Domain: "example.com", Version: "v1"}

// sizes are the only instance types a caller can get: the platform's
// choice, not the caller's.
var sizes = map[string]types.InstanceType{
	"small":  types.InstanceTypeT3Micro,
	"medium": types.InstanceTypeT3Small,
	"large":  types.InstanceTypeT3Medium,
}

// amiParameter is the public SSM parameter AWS keeps pointing at the latest
// Amazon Linux 2023 AMI, in every region.
const amiParameter = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"

// namespaceTag records which namespace (tenant) an instance belongs to.
const namespaceTag = "infrapi:namespace"

type service struct {
	ec2 *ec2.Client
	ssm *ssm.Client
}

type instanceRequest struct {
	Name string `json:"name" binding:"required"`
	Size string `json:"size" binding:"required"`
}

type instance struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Size      string `json:"size"`
	State     string `json:"state"`
	PrivateIP string `json:"private_ip,omitempty"`
	Zone      string `json:"zone"`
}
```

- `compute` is the API group. lib's [api](../products/lib/docs/packages/api.md)
  package turns it into the layout every InfraPI service shares:
  `/apis/compute.example.com/v1/namespaces/<namespace>/instance`.
- `sizes` is the platform's choice of instance types. Callers ask for
  `small`, never for `t3.micro`, so you can change the mapping later
  without breaking them.
- The `infrapi:namespace` tag records which tenant an instance belongs to.
  Every read filters on it.

## Wire the service

```go
func main() {
	// INFRAPI_APP_* from .env (or INFRAPI_CONFIG_DOTENV_FILE).
	vars, err := config.NewConfig()
	if err != nil {
		log.Fatal(err)
	}
	cfg, err := vars.GetAppConfig()
	if err != nil {
		log.Fatal(err)
	}

	// AWS credentials and region the SDK's usual way: environment, shared
	// config, or an instance role.
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background())
	if err != nil {
		log.Fatal(err)
	}
	s := &service{ec2: ec2.NewFromConfig(awsCfg), ssm: ssm.NewFromConfig(awsCfg)}

	engine, err := server.NewServerGin(cfg, server.WithReadiness(s.ready))
	if err != nil {
		log.Fatal(err)
	}
	v1, err := server.APIGroup(engine, compute)
	if err != nil {
		log.Fatal(err)
	}
	v1.GET("/instance", s.list)
	v1.POST("/instance", s.create)
	v1.GET("/instance/:id", s.get)
	v1.DELETE("/instance/:id", s.delete)

	ln, err := listener.Listen(cfg)
	if err != nil {
		log.Fatal(err)
	}
	srv := &http.Server{Handler: engine, ReadHeaderTimeout: 5 * time.Second}
	go func() {
		stop := make(chan os.Signal, 1)
		signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}()
	log.Printf("compute API on http://%s%s", ln.Addr(), compute.Root())
	if err := srv.Serve(ln); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

// ready is /-/readyz: the service is ready when EC2 answers.
func (s *service) ready(ctx context.Context) error {
	_, err := s.ec2.DescribeAvailabilityZones(ctx, &ec2.DescribeAvailabilityZonesInput{})
	return err
}
```

- `config.NewConfig` and `GetAppConfig` load `.env`.
- `awsconfig.LoadDefaultConfig` finds AWS credentials and the region the
  usual way: environment variables, `~/.aws`, or an instance role.
- `server.NewServerGin` returns a gin engine that already serves
  `/-/healthz`, `/-/readyz`, `/-/metrics`, `/-/openapi.json` and `/-/docs`.
  `WithReadiness` makes `/-/readyz` fail while EC2 does not answer, so a load
  balancer stops sending traffic.
- `server.APIGroup` mounts the routes under the group's path, and answers 404
  for a namespace that is not a lower-case DNS label, before your handler
  runs.
- `listener.Listen` opens the socket from `INFRAPI_APP_LISTEN_*`: TCP here,
  or systemd socket activation in production.

## Create an instance

```go
func (s *service) create(c *gin.Context) {
	var req instanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		server.AbortError(c, infraerrors.Invalid("%s", err))
		return
	}
	instanceType, ok := sizes[req.Size]
	if !ok {
		server.AbortError(c, infraerrors.Invalid("unknown size %q: use small, medium or large", req.Size))
		return
	}

	ctx := c.Request.Context()
	ami, err := s.ssm.GetParameter(ctx, &ssm.GetParameterInput{Name: aws.String(amiParameter)})
	if err != nil {
		server.AbortError(c, awsError("ssm.GetParameter", err))
		return
	}

	out, err := s.ec2.RunInstances(ctx, &ec2.RunInstancesInput{
		ImageId:      ami.Parameter.Value,
		InstanceType: instanceType,
		MinCount:     aws.Int32(1),
		MaxCount:     aws.Int32(1),
		TagSpecifications: []types.TagSpecification{{
			ResourceType: types.ResourceTypeInstance,
			Tags: []types.Tag{
				{Key: aws.String("Name"), Value: aws.String(req.Name)},
				{Key: aws.String(namespaceTag), Value: aws.String(server.Namespace(c))},
			},
		}},
	})
	if err != nil {
		server.AbortError(c, awsError("ec2.RunInstances", err))
		return
	}
	c.JSON(http.StatusCreated, view(out.Instances[0]))
}
```

The caller sends a name and a size. Everything else is the platform's
decision: the AMI is the latest Amazon Linux 2023, read from the public SSM
parameter AWS keeps up to date, and the instance is tagged with the
namespace from the URL, not from the body. A tenant cannot create an
instance for another one.

Errors are [`infraerrors`](../products/lib/docs/packages/errors.md) values.
`server.AbortError` writes them as an RFC 9457 problem document, with the
request's correlation id.

## Read and terminate, per tenant

```go
func (s *service) list(c *gin.Context) {
	found, err := s.describe(c.Request.Context(), server.Namespace(c), nil)
	if err != nil {
		server.AbortError(c, err)
		return
	}
	items := []instance{}
	for _, i := range found {
		items = append(items, view(i))
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (s *service) get(c *gin.Context) {
	i, err := s.find(c)
	if err != nil {
		server.AbortError(c, err)
		return
	}
	c.JSON(http.StatusOK, view(i))
}

func (s *service) delete(c *gin.Context) {
	i, err := s.find(c)
	if err != nil {
		server.AbortError(c, err)
		return
	}
	_, err = s.ec2.TerminateInstances(c.Request.Context(), &ec2.TerminateInstancesInput{InstanceIds: []string{*i.InstanceId}})
	if err != nil {
		server.AbortError(c, awsError("ec2.TerminateInstances", err))
		return
	}
	c.Status(http.StatusAccepted) // terminating: it takes EC2 a minute or two
}

// find is the instance named in the path, if it belongs to the namespace in
// the path. An instance of another namespace is a 404, as if it did not
// exist: a tenant does not learn what other tenants have.
func (s *service) find(c *gin.Context) (types.Instance, error) {
	id := c.Param("id")
	found, err := s.describe(c.Request.Context(), server.Namespace(c), []types.Filter{
		{Name: aws.String("instance-id"), Values: []string{id}},
	})
	if err != nil {
		return types.Instance{}, err
	}
	if len(found) == 0 {
		return types.Instance{}, infraerrors.NotFound("no instance %q in namespace %q", id, server.Namespace(c))
	}
	return found[0], nil
}

// describe lists the namespace's instances, terminated ones excluded, with
// any extra filters.
func (s *service) describe(ctx context.Context, namespace string, filters []types.Filter) ([]types.Instance, error) {
	filters = append(filters,
		types.Filter{Name: aws.String("tag:" + namespaceTag), Values: []string{namespace}},
		types.Filter{Name: aws.String("instance-state-name"), Values: []string{"pending", "running", "stopping", "stopped"}},
	)
	var found []types.Instance
	pages := ec2.NewDescribeInstancesPaginator(s.ec2, &ec2.DescribeInstancesInput{Filters: filters})
	for pages.HasMorePages() {
		page, err := pages.NextPage(ctx)
		if err != nil {
			return nil, awsError("ec2.DescribeInstances", err)
		}
		for _, r := range page.Reservations {
			found = append(found, r.Instances...)
		}
	}
	return found, nil
}
```

`find` asks EC2 for the instance *and* the namespace tag together. An
instance of another namespace comes back as a 404, exactly like one that
does not exist, so a tenant cannot probe what others have.

## Map AWS errors

```go
// view is what callers see of an instance: the platform's names, not EC2's.
func view(i types.Instance) instance {
	out := instance{
		ID:        aws.ToString(i.InstanceId),
		PrivateIP: aws.ToString(i.PrivateIpAddress),
		Zone:      aws.ToString(i.Placement.AvailabilityZone),
	}
	if i.State != nil {
		out.State = string(i.State.Name)
	}
	for size, t := range sizes {
		if t == i.InstanceType {
			out.Size = size
		}
	}
	for _, t := range i.Tags {
		if aws.ToString(t.Key) == "Name" {
			out.Name = aws.ToString(t.Value)
		}
	}
	return out
}

// awsError turns an AWS SDK error into the problem document the caller
// gets: whose fault it is, and whether retrying can help.
func awsError(origin string, err error) error {
	var apiErr smithy.APIError
	if !errors.As(err, &apiErr) {
		// no answer from AWS at all: network, DNS, timeout
		return infraerrors.Unavailable("%s: %v", origin, err)
	}
	switch code := apiErr.ErrorCode(); code {
	case "InvalidInstanceID.Malformed", "InvalidInstanceID.NotFound":
		return infraerrors.NotFound("%s", apiErr.ErrorMessage())
	case "AuthFailure", "UnauthorizedOperation", "InvalidClientTokenId", "ExpiredToken", "AccessDeniedException":
		return infraerrors.UpstreamAuth("%s: AWS refused this service's credentials (%s)", origin, code)
	case "RequestLimitExceeded", "InsufficientInstanceCapacity", "ThrottlingException":
		return infraerrors.Upstream(true, "%s: %s", origin, apiErr.ErrorMessage())
	default:
		return infraerrors.Upstream(false, "%s: %s: %s", origin, code, apiErr.ErrorMessage())
	}
}
```

`view` shows callers the platform's vocabulary (`size: small`), not EC2's.
`awsError` decides whose fault an AWS error is: a missing instance is a
404, refused credentials a 502 `upstream_auth` for your operators, throttling
a retryable 502. Callers branch on `code` and `retryable` the same way for
every InfraPI API.

Check that it builds:

```bash
go vet . && go build -o compute .
```

## Run it against moto

Start moto in another terminal, with pip or with Docker:

```bash
pip install 'moto[server]' && moto_server -p 5000
# or: docker run --rm -p 5000:5000 motoserver/moto
```

Point the SDK at it — `AWS_ENDPOINT_URL` is read by every AWS SDK — and
start the service:

```bash
export AWS_ENDPOINT_URL=http://localhost:5000 AWS_REGION=eu-west-1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
./compute
```

## Call it

```bash
API=http://127.0.0.1:8080/apis/compute.example.com/v1/namespaces

curl -s localhost:8080/-/readyz
curl -s -X POST $API/acme/instance -H 'Content-Type: application/json' \
  -d '{"name": "web-1", "size": "small"}'
```

```json
{"id":"i-e91f1fd9eca53182d","name":"web-1","size":"small","state":"pending","private_ip":"10.141.238.21","zone":"eu-west-1a"}
```

Keep the `id`, then list, read and terminate:

```bash
ID=i-e91f1fd9eca53182d                 # yours
curl -s $API/acme/instance
curl -s $API/acme/instance/$ID
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/acme/instance/$ID   # 202
```

Now try what the platform refuses:

```bash
# a size the platform does not offer: 400, EC2 is never called
curl -s -X POST $API/acme/instance -H 'Content-Type: application/json' \
  -d '{"name": "web-2", "size": "huge"}'

# another tenant's instance: 404, as if it did not exist
curl -s $API/globex/instance/$ID
```

```json
{"title":"Invalid request","status":400,"detail":"unknown size \"huge\": use small, medium or large","code":"invalid_request","retryable":false}
{"title":"Not found","status":404,"detail":"no instance \"i-e91f1fd9eca53182d\" in namespace \"globex\"","code":"not_found","retryable":false}
```

`/-/docs` shows the routes in Swagger UI, and `/-/metrics` already counts
every request by route and status.

## Run it against AWS

> [!WARNING]
> This creates real, billed instances. Terminate them when you are done.

Unset `AWS_ENDPOINT_URL` and the test keys, then use your usual AWS
credentials. The region needs a default VPC, since `RunInstances` gets no
subnet here. The credentials need `ec2:RunInstances`, `ec2:CreateTags`,
`ec2:DescribeInstances`, `ec2:DescribeAvailabilityZones`,
`ec2:TerminateInstances` and `ssm:GetParameter`.

```bash
unset AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export AWS_PROFILE=my-sandbox AWS_REGION=eu-west-1
./compute
```

The calls above work unchanged.

## Next steps

- Require a token and RBAC: pass `server.WithAuth` an authentication
  middleware, see [auth](../products/lib/docs/packages/auth.md) and
  [Kayra](../products/kayra/docs/getting-started.md).
- Give each tenant its own AWS account or role from Vault:
  [vault](../products/lib/docs/packages/vault.md).
- Call this API from another service with the same `api.Group`:
  [client](../products/lib/docs/packages/client.md).
- Publish and enforce an OpenAPI contract with `server.WithOpenAPI`:
  [server](../products/lib/docs/packages/server.md).
