---
title: Build an EC2 instance API
description: From nothing to a tenant creating EC2 instances through your own API - a Go project from its contract with infrapi-cli, the AWS SDK for Go v2 behind it, Kayra authorizing every call. Runs against a local AWS emulator and a local InfraPI, no AWS account needed.
products: [lib, kayra]
level: Intermediate
duration: 45 min
weight: 20
---

[tofu-api](generate-an-api-contract.md) gets you an API from a Terraform
provider without code. When you need your own logic, write the service
yourself: `infrapi-cli app` gives it a contract, its Go code and its CI,
[infrapi/lib](../products/lib/docs/_index.md) the same URL layout, errors,
health checks and metrics as every other InfraPI API, and you call AWS
with the [AWS SDK for Go v2](https://github.com/aws/aws-sdk-go-v2).

In this tutorial you build `compute`, an API that lets each tenant
(namespace) create, list and terminate its own EC2 instances, in three
sizes the platform chooses. You run it against
[moto](https://github.com/getmoto/moto), a local emulator of the AWS APIs,
behind a local InfraPI: a tenant's user calls it, authorized by Kayra.

**You will need:** Go 1.27.3 or later, podman or docker,
[infrapi-cli](../products/cli/docs/getting-started.md#1-install), `make`,
`curl`, and Python 3 (`pip`) or podman/docker for moto.

Each step does the least it needs, and links where it is explained in
full: [Develop an API](../products/cli/docs/develop/develop-an-api.md) for the
project, [The dev stack](../products/cli/docs/develop/dev-stack.md) for the
local InfraPI.

## 1. Create the project

```bash
infrapi-cli app init compute --no-prompt --module example.com/compute --ci none
cd compute
go get github.com/aws/aws-sdk-go-v2/config \
  github.com/aws/aws-sdk-go-v2/service/ec2 \
  github.com/aws/aws-sdk-go-v2/service/ssm \
  github.com/aws/smithy-go
```

`app init` writes a Go module on infrapi/lib: its contract,
`api/compute-v1.yaml`, the server, `cmd/compute/main.go`, its settings,
`internal/config`, and its dev stack's settings, `dev.yaml`. Without
`--no-prompt` it asks for the module, the API group, the CI and what a
release builds. See [app init](../products/cli/docs/app.md#app-init).

## 2. Start a local InfraPI

```bash
infrapi-cli dev init
infrapi-cli dev up
infrapi-cli dev contexts
```

Kayra, its reconciler, etcd and APISIX run in containers, configured by
`dev.yaml`. `dev contexts` saves three `infrapi-cli` contexts on the
gateway, `http://localhost:9080`: `dev-admin`, the platform's admin and the
current one, `dev-jdoe`, a user of the tenant you create below, and
`dev-nobody`. The `curl` examples read their tokens:

```bash
ADMIN=$(infrapi-cli auth context token dev-admin)
JDOE=$(infrapi-cli auth context token dev-jdoe)
NOBODY=$(infrapi-cli auth context token dev-nobody)
GW=http://localhost:9080
META='"metadata": {"namespace": "acme", "region": "eu-west-1", "platform": "sandbox"}'
```

## 3. Describe the API

```bash
infrapi-cli app add instance
```

It adds `instances` to the contract, five operations under
`/apis/compute.infrapi.io/v1/namespaces/{namespace}/instances`, and an
`Instance` schema. Make it this API's, in `api/compute-v1.yaml`:

- under `components.schemas.Instance`, `size` required, and what EC2 says
  of an instance, read only:

  ```yaml
      Instance:
        type: object
        description: An EC2 instance of a namespace.
        required: [name, size]
        properties:
          name: …          # as app add wrote them
          created_at: …
          size:
            type: string
            enum: [small, medium, large]
            description: The platform's sizes, t3.micro, t3.small and t3.medium.
          id: {type: string, readOnly: true, description: EC2's instance id.}
          state: {type: string, readOnly: true, description: pending, running, stopping or stopped.}
          private_ip: {type: string, readOnly: true}
          zone: {type: string, readOnly: true}
  ```

- an instance is not resized: remove the `put` operation,
  `replaceInstance`, of `.../instances/{name}`;
- terminating takes EC2 a minute: the `delete` answers `'202'`,
  `description: The instance terminating.`, instead of `'204'`.

Then generate the Go code from it:

```bash
infrapi-cli app generate
```

`api/zz_generated.go` has the `Instance` type, and
`internal/compute/zz_generated.go` the `Handlers` your service implements:

```go
type Handlers interface {
	ListInstances(ctx context.Context, namespace string) ([]api.Instance, error)
	CreateInstance(ctx context.Context, namespace string, body api.Instance) (api.Instance, error)
	GetInstance(ctx context.Context, namespace, name string) (api.Instance, error)
	DeleteInstance(ctx context.Context, namespace, name string) error
}
```

The contract is enforced before your code runs: a `size` of `huge`, a
missing `name`, is a `400` EC2 never sees.

## 4. Configure it

The service needs one setting of its own: the SSM parameter naming the AMI
instances boot. In `internal/config/config.go`, add it to `Config`:

```go
	// AMIParameter is the SSM parameter naming the AMI instances boot:
	// COMPUTE_AMI_PARAMETER, the latest Amazon Linux 2023 by default.
	AMIParameter string
```

and read it in `Load`, before its `return`:

```go
	ami, err := vars.GetString(&libconfig.VariableOpts{
		Key:     "COMPUTE_AMI_PARAMETER",
		Default: "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64",
	})
	if err != nil {
		return nil, err
	}

	return &Config{App: app, AuthURL: authURL, AMIParameter: ami}, nil
```

AWS's own settings, the credentials and the region, the SDK reads its usual
way. In `cmd/compute/main.go`, build the service with them: replace
`compute.Register(…, compute.New())` with

```go
	// AWS credentials and region the SDK's usual way: the environment,
	// ~/.aws, or an instance role
	aws, err := awsconfig.LoadDefaultConfig(ctx)
	if err != nil {
		return err
	}
	compute.Register(engine.Group("", kayra.RequireAccess()), compute.New(aws, cfg.AMIParameter))
```

with `awsconfig "github.com/aws/aws-sdk-go-v2/config"` imported.

## 5. Write the service

`internal/compute/compute.go`: the service, its AWS clients, the platform's
sizes, and how an AWS error becomes the caller's.

```go
// Package compute is the compute API's implementation: Service implements
// Handlers, the operations of its contracts (zz_generated.go), on EC2.
package compute

import (
	"errors"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	"github.com/aws/smithy-go"
	infraerrors "github.com/infrapi/lib/pkg/errors"
)

// namespaceTag tags each instance with the namespace that owns it.
const namespaceTag = "infrapi:namespace"

// sizes are the platform's sizes, the only instance types it offers.
var sizes = map[string]types.InstanceType{
	"small":  types.InstanceTypeT3Micro,
	"medium": types.InstanceTypeT3Small,
	"large":  types.InstanceTypeT3Medium,
}

// Service is the API, on EC2.
type Service struct {
	ec2          *ec2.Client
	ssm          *ssm.Client
	amiParameter string
}

// New is the Service, ready to Register: AWS's configuration, and the SSM
// parameter naming the AMI instances boot.
func New(cfg aws.Config, amiParameter string) *Service {
	return &Service{ec2: ec2.NewFromConfig(cfg), ssm: ssm.NewFromConfig(cfg), amiParameter: amiParameter}
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
	case "AuthFailure", "UnauthorizedOperation", "InvalidClientTokenId", "ExpiredToken", "AccessDeniedException":
		return infraerrors.UpstreamAuth("%s: AWS refused this service's credentials (%s)", origin, code)
	case "RequestLimitExceeded", "InsufficientInstanceCapacity", "ThrottlingException":
		return infraerrors.Upstream(true, "%s: %s", origin, apiErr.ErrorMessage())
	default:
		return infraerrors.Upstream(false, "%s: %s: %s", origin, code, apiErr.ErrorMessage())
	}
}
```

Errors are [`infraerrors`](../products/lib/docs/packages/errors.md) values:
the generated code answers them as RFC 9457 problem documents. `awsError`
decides whose fault an AWS error is: refused credentials are a 502
`upstream_auth` for your operators, throttling a retryable 502. Callers
branch on `code` and `retryable` the same way for every InfraPI API.

`internal/compute/instances.go`, written by `app add` with each operation
answering 501: replace it with the operations on EC2.

```go
package compute

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	"github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/aws/aws-sdk-go-v2/service/ssm"
	infraerrors "github.com/infrapi/lib/pkg/errors"

	"example.com/compute/api"
)

// ListInstances: List the instances of a namespace.
func (s *Service) ListInstances(ctx context.Context, namespace string) ([]api.Instance, error) {
	found, err := s.describe(ctx, namespace, nil)
	if err != nil {
		return nil, err
	}
	out := make([]api.Instance, 0, len(found))
	for _, i := range found {
		out = append(out, view(i))
	}
	return out, nil
}

// CreateInstance: Create an instance.
func (s *Service) CreateInstance(ctx context.Context, namespace string, body api.Instance) (api.Instance, error) {
	if _, err := s.find(ctx, namespace, body.Name); err == nil {
		return api.Instance{}, infraerrors.AlreadyExists(nil, "instance %q already exists in namespace %q", body.Name, namespace)
	}
	ami, err := s.ssm.GetParameter(ctx, &ssm.GetParameterInput{Name: aws.String(s.amiParameter)})
	if err != nil {
		return api.Instance{}, awsError("ssm.GetParameter", err)
	}
	out, err := s.ec2.RunInstances(ctx, &ec2.RunInstancesInput{
		ImageId:      ami.Parameter.Value,
		InstanceType: sizes[body.Size], // the contract allows small, medium and large only
		MinCount:     aws.Int32(1),
		MaxCount:     aws.Int32(1),
		TagSpecifications: []types.TagSpecification{{
			ResourceType: types.ResourceTypeInstance,
			Tags: []types.Tag{
				{Key: aws.String("Name"), Value: aws.String(body.Name)},
				{Key: aws.String(namespaceTag), Value: aws.String(namespace)},
			},
		}},
	})
	if err != nil {
		return api.Instance{}, awsError("ec2.RunInstances", err)
	}
	return view(out.Instances[0]), nil
}

// GetInstance: Get an instance.
func (s *Service) GetInstance(ctx context.Context, namespace, name string) (api.Instance, error) {
	i, err := s.find(ctx, namespace, name)
	if err != nil {
		return api.Instance{}, err
	}
	return view(i), nil
}

// DeleteInstance: Delete an instance.
func (s *Service) DeleteInstance(ctx context.Context, namespace, name string) error {
	i, err := s.find(ctx, namespace, name)
	if err != nil {
		return err
	}
	_, err = s.ec2.TerminateInstances(ctx, &ec2.TerminateInstancesInput{InstanceIds: []string{aws.ToString(i.InstanceId)}})
	if err != nil {
		return awsError("ec2.TerminateInstances", err)
	}
	return nil // 202: terminating takes EC2 a minute or two
}

// find is the namespace's instance of that name. Another namespace's is a
// 404, as if it did not exist.
func (s *Service) find(ctx context.Context, namespace, name string) (types.Instance, error) {
	found, err := s.describe(ctx, namespace, []types.Filter{{Name: aws.String("tag:Name"), Values: []string{name}}})
	if err != nil {
		return types.Instance{}, err
	}
	if len(found) == 0 {
		return types.Instance{}, infraerrors.NotFound("no instance %q in namespace %q", name, namespace)
	}
	return found[0], nil
}

// describe lists the namespace's instances, terminated ones left out, with
// any extra filters.
func (s *Service) describe(ctx context.Context, namespace string, filters []types.Filter) ([]types.Instance, error) {
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

// view is what callers see of an instance: the platform's names, not EC2's.
func view(i types.Instance) api.Instance {
	out := api.Instance{
		ID:        aws.ToString(i.InstanceId),
		PrivateIP: aws.ToString(i.PrivateIpAddress),
		CreatedAt: aws.ToTime(i.LaunchTime),
	}
	if i.Placement != nil {
		out.Zone = aws.ToString(i.Placement.AvailabilityZone)
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
```

The caller sends a name and a size. Everything else is the platform's
decision: the AMI is the latest Amazon Linux 2023, read from the public SSM
parameter AWS keeps up to date, and the instance is tagged with the
namespace from the URL, never from the body: a tenant cannot create an
instance for another one. Who may call which operation in which namespace,
Kayra decides before your code runs.

`instances_test.go`, also written by `app add`, checks the 501s: remove it,
or make it yours, against moto say. Then check it builds:

```bash
make lint test build
```

## 6. Run it against moto

Start moto in another terminal, with pip or with a container:

```bash
pip install 'moto[server]' && moto_server -p 5000
# or: podman run --rm -p 5000:5000 docker.io/motoserver/moto
```

Then run the API in a third one, the SDK pointed at moto:
`AWS_ENDPOINT_URL` is read by every AWS SDK.

```bash
export AWS_ENDPOINT_URL=http://localhost:5000 AWS_REGION=eu-west-1
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test
infrapi-cli app run
```

`infrapi-cli app run` reads the settings `dev init` rendered from `dev.yaml`,
`.infrapi-dev/app.env`: infrapi/lib's, and `COMPUTE_AUTH_URL`, Kayra
through the gateway.

## 7. Register it, onboard a tenant

As `dev-admin`, register the API: the gateway routes
`/apis/compute.infrapi.io/*` to it, and Kayra reads its contract and learns
its resources.

```bash
infrapi-cli app register
infrapi-cli apis --api-group compute
# NAME       SHORTNAME  APIGROUP            NAMESPACED  VERBS
# instances  compute    compute.infrapi.io  true        create,delete,get,list
```

Then a tenant, `acme`: its namespace, its subscription to the API, and the
RBAC that lets its users, the group `sandbox-thetenant-admins` that `jdoe`
is in, manage its instances.
[Develop an API](../products/cli/docs/develop/develop-an-api.md#5-onboard-a-tenant)
explains each object.

**infrapi-cli**

```bash
infrapi-cli create namespaces -d '{"name": "acme"}'
infrapi-cli create clustergroups \
  -d "{\"name\": \"acme-admins\", $META, \"groups\": [\"sandbox-core-sysadmin\"]}"
infrapi-cli create clusterroles \
  -d "{\"name\": \"acme-admin-role\", $META, \"rules\": [{\"apis\": [\"catalog.infrapi.io\", \"authorization.infrapi.io\"], \"resources\": [\"*\"], \"verbs\": [\"*\"]}]}"
infrapi-cli create clusterrolebindings \
  -d "{\"name\": \"acme-admin-binding\", $META, \"role\": \"acme-admin-role\", \"groups\": [\"acme-admins\"]}"

infrapi-cli create subscriptions -n acme -d '{"api": "compute.infrapi.io"}'

infrapi-cli create groups -n acme \
  -d "{\"name\": \"devs\", $META, \"groups\": [\"sandbox-thetenant-admins\"]}"
infrapi-cli create roles -n acme \
  -d "{\"name\": \"instances-admin\", $META, \"rules\": [{\"apis\": [\"compute.infrapi.io\"], \"resources\": [\"instances\"], \"verbs\": [\"*\"]}]}"
infrapi-cli create rolebindings -n acme \
  -d "{\"name\": \"devs-instances-admin\", $META, \"role\": \"instances-admin\", \"groups\": [\"devs\"]}"
```

**curl**

```bash
H=(-H "Authorization: Bearer $ADMIN" -H "Content-Type: application/json")
AUTHZ=$GW/apis/authorization.infrapi.io/v1

curl -s -X POST $GW/apis/system.infrapi.io/v1/namespaces "${H[@]}" -d '{"name": "acme"}'
curl -s -X POST $AUTHZ/clustergroups "${H[@]}" \
  -d "{\"name\": \"acme-admins\", $META, \"groups\": [\"sandbox-core-sysadmin\"]}"
curl -s -X POST $AUTHZ/clusterroles "${H[@]}" \
  -d "{\"name\": \"acme-admin-role\", $META, \"rules\": [{\"apis\": [\"catalog.infrapi.io\", \"authorization.infrapi.io\"], \"resources\": [\"*\"], \"verbs\": [\"*\"]}]}"
curl -s -X POST $AUTHZ/clusterrolebindings "${H[@]}" \
  -d "{\"name\": \"acme-admin-binding\", $META, \"role\": \"acme-admin-role\", \"groups\": [\"acme-admins\"]}"

curl -s -X POST $GW/apis/catalog.infrapi.io/v1/namespaces/acme/subscriptions "${H[@]}" -d '{"api": "compute.infrapi.io"}'

curl -s -X POST $AUTHZ/namespaces/acme/groups "${H[@]}" \
  -d "{\"name\": \"devs\", $META, \"groups\": [\"sandbox-thetenant-admins\"]}"
curl -s -X POST $AUTHZ/namespaces/acme/roles "${H[@]}" \
  -d "{\"name\": \"instances-admin\", $META, \"rules\": [{\"apis\": [\"compute.infrapi.io\"], \"resources\": [\"instances\"], \"verbs\": [\"*\"]}]}"
curl -s -X POST $AUTHZ/namespaces/acme/rolebindings "${H[@]}" \
  -d "{\"name\": \"devs-instances-admin\", $META, \"role\": \"instances-admin\", \"groups\": [\"devs\"]}"
```

## 8. Call it

As `jdoe`, a user of `acme`, through the gateway:

**infrapi-cli**

```bash
infrapi-cli create instances -n acme -d '{"name": "web-1", "size": "small"}' --context dev-jdoe
infrapi-cli get instances -n acme web-1 -o json --context dev-jdoe
# {"name": "web-1", "created_at": "…", "size": "small", "id": "i-e91f1fd9eca53182d", "state": "running", "private_ip": "10.141.238.21", "zone": "eu-west-1a"}
infrapi-cli get instances -n acme --context dev-jdoe
infrapi-cli delete instances -n acme web-1 --context dev-jdoe
```

**curl**

```bash
API=$GW/apis/compute.infrapi.io/v1/namespaces/acme/instances

curl -s -X POST $API -H "Authorization: Bearer $JDOE" -H 'Content-Type: application/json' \
  -d '{"name": "web-1", "size": "small"}'
curl -s $API/web-1 -H "Authorization: Bearer $JDOE"
curl -s $API -H "Authorization: Bearer $JDOE"
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $API/web-1 -H "Authorization: Bearer $JDOE"   # 202
```

Now try what the platform refuses:

**infrapi-cli**

```bash
# a size the platform does not offer: 400, from the contract; EC2 is never called
infrapi-cli create instances -n acme -d '{"name": "web-2", "size": "huge"}' --context dev-jdoe
# Error: Invalid request (400): request body has an error: doesn't match schema #/components/schemas/Instance: Error at "/size": value is not one of the allowed values ["small","medium","large"]

# someone acme does not know: 403, from Kayra; your code is never called
infrapi-cli get instances -n acme --context dev-nobody
# Error: Forbidden (403): you are not a member of namespace "acme": …
```

**curl**

```bash
curl -s -X POST $API -H "Authorization: Bearer $JDOE" -H 'Content-Type: application/json' \
  -d '{"name": "web-2", "size": "huge"}'
# {"title":"Invalid request","status":400,"detail":"request body has an error: … value is not one of the allowed values [\"small\",\"medium\",\"large\"]",…}

curl -s $API -H "Authorization: Bearer $NOBODY"
# {"title":"Forbidden","status":403,"detail":"you are not a member of namespace \"acme\": …",…}
```

`/apis/compute.infrapi.io/v1/-/docs` shows the contract in Swagger UI, and
`-/metrics` beside it already counts every request by route and status.

## 9. Run it against AWS

> [!WARNING]
> This creates real, billed instances. Terminate them when you are done.

Stop `infrapi-cli app run`, unset `AWS_ENDPOINT_URL` and the test keys, then use your
usual AWS credentials. The region needs a default VPC, since `RunInstances`
gets no subnet here. The credentials need `ec2:RunInstances`,
`ec2:CreateTags`, `ec2:DescribeInstances`, `ec2:TerminateInstances` and
`ssm:GetParameter`.

```bash
unset AWS_ENDPOINT_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
export AWS_PROFILE=my-sandbox AWS_REGION=eu-west-1
infrapi-cli app run
```

The calls above work unchanged.

## Next steps

- Ship it: `make snapshot` builds what a release would, archives, deb and
  rpm packages and the image; the CI, `app init --ci github` or `gitlab`,
  releases on a tag. See [Ship it](../products/cli/docs/develop/develop-an-api.md#11-ship-it).
- Give each tenant its own AWS account or role from Vault:
  [vault](../products/lib/docs/packages/vault.md).
- Call this API from another service:
  [client](../products/lib/docs/packages/client.md).
- Provision something per tenant when it subscribes: Kayra's
  [subscriptions](../products/kayra/docs/architecture/subscriptions.md).
