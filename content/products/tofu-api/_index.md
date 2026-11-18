---
title: tofu-api
layout: product
product: tofu-api
description: tofu-api runs an OpenTofu or Terraform provider over the plugin protocol — without HCL or state file — and generates the OpenAPI contract from its schemas, and MCP tools for AI agents from the contract. What is left to write is what is specific to your platform, in one YAML file per provider.
headline: Any OpenTofu or Terraform provider, as a REST API — and as MCP tools for AI agents.
start: getting-started

problems:
  - An internal API in front of a product is mostly a client of that product's API — and writing, then maintaining, that client is most of the work.
  - "A Terraform provider *is* that client, already written: **maintained** by the vendor or its community, **tested** daily by everyone who manages that product with Terraform."
  - tofu-api gives callers that are not Terraform — a portal, a script, another service — a plain REST API on top of it.
  - "And AI agents get the same API over MCP, natively: they read and plan with their user's token and rights, and change nothing unless you allow it."

features:
  - title: No code per resource
    text: The contract comes from the provider's schemas. Bumping the provider and regenerating it *is* the API change.
  - title: Rules in YAML
    text: Values the service sets, defaults, patterns, enums and hidden attributes, with CEL expressions.
  - title: Credentials per namespace
    text: A provider process per namespace, configured from Vault, so a tenant reaches only what its credentials allow.
  - title: Contract enforced
    text: Requests that do not match are a 400 before the provider is called. Errors are RFC 9457 problems.
  - title: Native MCP for AI agents
    text: "Every instance is an MCP server at `<root>/-/mcp`: a tool per operation, a document per resource type, prompts — generated, read only by default."
  - title: Dry run and drift
    text: "`?dryRun=true` says what a create or an update would change, and applies nothing: against the spec it was created with, a resource's drift."

facts:
  - k: Tested live
    v: "Grafana and random providers — see [Testing](docs/testing/)"
  - k: Platforms
    v: linux amd64 and arm64, RPM and DEB packages
  - k: AI agents
    v: "MCP, Streamable HTTP — see [MCP](docs/mcp/)"
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

## For AI agents

An AI agent connects to a tofu-api as to any MCP server, with its user's
token. Its tools are the API's operations, each call going through the API
itself: the token and RBAC, the rules and the contract apply, so the agent
does what its user may, no more. It reads resources and data sources and
plans changes — `plan_create_folder`, `plan_update_folder` — and creates,
updates or deletes only where the configuration says `writes: true`.

```bash
claude mcp add --transport http grafana https://api.example.com/grafana/v1/-/mcp \
  --header "Authorization: Bearer $TOKEN"
```

The context comes with it: a document per resource type, generated from the
provider's schema and the rules — its attributes, who sets them, their
constraints, a minimal body — prompts to check a resource's drift or plan a
new one, and whatever the configuration adds: your conventions, your
procedures. See [MCP](docs/mcp.md).
