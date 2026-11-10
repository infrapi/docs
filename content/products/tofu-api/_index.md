---
title: tofu-api
layout: product
product: tofu-api
description: tofu-api runs an OpenTofu or Terraform provider over the plugin protocol — without HCL, plan or state file — and generates the OpenAPI contract from its schemas. What is left to write is what is specific to your platform, in one YAML file per provider.
headline: Any OpenTofu or Terraform provider, as a REST API.
start: getting-started

problems:
  - An internal API in front of a product is mostly a client of that product's API — and writing, then maintaining, that client is most of the work.
  - "A Terraform provider *is* that client, already written: **maintained** by the vendor or its community, **tested** daily by everyone who manages that product with Terraform."
  - tofu-api gives callers that are not Terraform — a portal, a script, another service — a plain REST API on top of it.

features:
  - title: No code per resource
    text: The contract comes from the provider's schemas. Bumping the provider and regenerating it *is* the API change.
  - title: Rules in YAML
    text: Values the service sets, defaults, patterns, enums and hidden attributes, with CEL expressions.
  - title: Credentials per namespace
    text: A provider process per namespace, configured from Vault, so a tenant reaches only what its credentials allow.
  - title: Contract enforced
    text: Requests that do not match are a 400 before the provider is called. Errors are RFC 9457 problems.

facts:
  - k: Tested live
    v: "Grafana and random providers — see [Testing](docs/testing/)"
  - k: Platforms
    v: linux amd64 and arm64, RPM and DEB packages
  - k: Known limits
    v: "[Limits](docs/limits/)"
  - k: Built on
    v: "[lib](../lib/)"

cascade:
  - target:
      path: "{/products/tofu-api/docs,/products/tofu-api/docs/**}"
    layout: docs
    product: tofu-api
---
