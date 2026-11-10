---
title: Turn the AWS provider into an EC2 instance API
description: Generate an OpenAPI contract for EC2 instances from the AWS provider's schemas with tofu-api gen, then restrict instance types with a rule. No AWS account needed.
products: [tofu-api]
level: Beginner
duration: 15 min
weight: 10
---

tofu-api builds its whole API from a provider's schemas. In this tutorial
you write the file that exposes EC2 instances from the `hashicorp/aws`
provider, generate the API's contract, and shape it with a rule — without an
AWS account: `tofu-api gen` only needs the provider binary, no credentials.

**You will need:** Go 1.26 or later, `git`, `jq`, network access, and
[OpenTofu](https://opentofu.org) or Terraform in your `PATH` (the
repository's script uses it to download and verify the provider).

> [!NOTE]
> tofu-api is early stage, and the AWS provider is not yet among the
> providers it has been tested live with. Generating the contract, as here,
> calls nothing in AWS; see [Testing](../tofu-api/docs/testing.md) for what
> has been tested.

## Get tofu-api

```bash
git clone https://github.com/infrapi/tofu-api.git
cd tofu-api
go run . -h
```

`-h` lists the commands; `gen` writes a contract, `serve` runs the API.

## Download the provider

tofu-api runs the same provider binary Terraform does. The repository's
script fetches it into `./providers` and prints where it put it:

```bash
scripts/fetch-provider.sh hashicorp/aws 6.0.0
```

Keep the printed path: it goes into `provider.binary_path` below.

## Describe the API

Create `aws.yaml`, with the path the script printed:

```yaml
provider:
  binary_path: providers/registry.opentofu.org/hashicorp/aws/6.0.0/linux_amd64/terraform-provider-aws_v6.0.0_x5
  config:                        # the provider block, as in Terraform
    region: ${AWS_REGION}        # read from the environment when serving, not by gen
resources:
  aws_instance: {}               # exposed as the provider has it
```

`resources` names every resource type to expose; anything not listed stays
out of the API.

## Generate the contract

```bash
go run . gen -config aws.yaml -o aws-v1.json
```

`gen` reads the schema of `aws_instance` from the provider, applies the
file's rules, and writes an OpenAPI 3 contract. It does not read the
environment and needs no credentials. It fails exactly as the service
would on a wrong file, which makes it a good check before a deployment.

## Read it

```bash
jq '.paths | keys' aws-v1.json
jq '.components.schemas | keys' aws-v1.json
```

The instances are under `/aws/v1/namespaces/{namespace}/instance` — the
provider's name, then the resource type without its `aws_` prefix. Their
request schema is built from the provider's schema:

- required attributes are `required`;
- computed-only ones, such as `id`, `arn` or `private_ip`, are absent from
  the request: sending one is a 400, and they come back in the response;
- sensitive ones are `format: password`.

The full mapping is in [Mapping](../tofu-api/docs/mapping.md).

## Shape it with rules

As is, a caller may ask for any instance type. Rules lay over the provider's
schemas what a Terraform module adds around a bare resource — here, the sizes
your platform allows, and an attribute callers should not set:

```yaml
resources:
  aws_instance:
    attributes:
      instance_type:
        enum: [t3.micro, t3.small, t3.medium]
      user_data:
        hidden: true             # not the caller's choice: sending it is a 400
```

Generate again and compare:

```bash
go run . gen -config aws.yaml -o aws-v1-rules.json
diff <(jq -S . aws-v1.json) <(jq -S . aws-v1-rules.json)
```

The `enum` is now in the contract, and `user_data` is gone from it. Once
served, a request for a `m5.24xlarge` is a 400 and the provider is never
called. A misspelt key, such as `Enum`, stops `gen` with an error.

## Next steps

- Serve it for real — it creates real, billed instances: [Getting started](../tofu-api/docs/getting-started.md) and [Configuration](../tofu-api/docs/configuration.md).
- Give each tenant its own AWS credentials from Vault: [Namespaces](../tofu-api/docs/namespaces.md).
- Require a token and RBAC through Kayra: [Authentication](../tofu-api/docs/authentication.md).
- Defaults, values set by the service, error mapping and CEL expressions: [Rules](../tofu-api/docs/rules.md).
