---
title: ulgen
layout: product
product: ulgen
description: ulgen is one MCP endpoint in front of several MCP servers. Every tool takes a tenant, a Kayra namespace; every call is checked against Kayra before it reaches the upstream, with the caller's token or the tenant's own credential from Vault.
headline: One MCP endpoint for AI agents, every call authorized per tenant by Kayra.
start: getting-started

problems:
  - An AI agent is configured with one MCP server per product, and logs in to each one.
  - Most MCP servers have no notion of tenant. They run with one credential that can reach everything.
  - What an agent may do is decided in each MCP server, or nowhere, instead of in the platform's RBAC.

features:
  - title: One endpoint
    text: "`/mcp` serves every upstream's tools, `<upstream>_<tool>`, after one OAuth login at Kayra; `/mcp/<upstream>` serves one upstream."
  - title: Tenants everywhere
    text: Every tool takes a `tenant`. An upstream with no notion of tenant gets the tenant's own credential, read from Vault; `list_tenants` says where each upstream is usable.
  - title: Rights in Kayra
    text: ulgen asks Kayra's `/check` before each call, on a resource per tool family, and serves the api's OpenAPI document. A namespace role grants Prometheus and not Loki like any other right.
  - title: Only the tools you list
    text: "`allowed_tools`: regular expressions on the tool names. A tool no rule matches is neither listed nor callable."
  - title: Traceable
    text: One audit line per call — who, which tool, which tenant, the outcome — with the request id passed on to the upstream, and Prometheus metrics.

facts:
  - k: Upstreams
    v: "Any MCP server over Streamable HTTP: mcp-grafana, an infrapi MCP ([tofu-api](../tofu-api/docs/mcp/), [lib](../lib/docs/packages/mcp/))"
  - k: Platforms
    v: linux amd64 and arm64, or a container image
  - k: Works with
    v: "[Kayra](../kayra/): callers, tenants, rights, the OAuth login"

cascade:
  - target:
      path: "{/products/ulgen/docs,/products/ulgen/docs/**}"
    layout: docs
    product: ulgen
---

## Named after Ülgen

In Altai Turkic mythology, Ülgen is a son of Kayra Han. He is the lord of
the upper world and the protector of humankind, and the good spirits that
act on earth answer to him. ulgen plays that part next to Kayra: the tools
that act on your platform for an AI agent answer through it, each call made
for a caller Kayra knows, on a tenant where Kayra allows it.
