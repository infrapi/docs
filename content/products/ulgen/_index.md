---
title: ulgen
layout: product
product: ulgen
description: ulgen is one MCP endpoint in front of the platform's APIs. It finds them in Kayra's catalog, serves all their tools after a single login, and makes every call with the caller's own token, which each API checks as for any of its routes.
headline: One MCP endpoint for AI agents, in front of every API of the platform.
start: getting-started

problems:
  - An AI agent is configured with one MCP server per API, and logs in to each one.
  - A new API means a new entry in every agent's configuration.
  - A gateway that decides rights on its own is one more place to keep in step with the platform's RBAC.

features:
  - title: One endpoint
    text: "`<root>/-/mcp` serves every API's tools, `<short_name>_<tool>`, after one OAuth login at Kayra; `<root>/-/mcp/<short_name>` serves one API."
  - title: Found in Kayra
    text: The APIs come from Kayra's catalog, with the caller's token. An API whose contract has its MCP endpoint is served; a new one shows up without a restart.
  - title: As the caller
    text: Every call goes to its API with the caller's token. The API checks it as any of its routes, against Kayra's RBAC in the namespace. ulgen grants nothing and refuses nothing.
  - title: Any MCP server, bridged
    text: "An MCP server that is not an infrapi API, mcp-grafana for one, is bridged into one by [tofu-api](../tofu-api/docs/mcp/) or [lib](../lib/docs/packages/mcp/): its tools become resources Kayra's roles grant per namespace."
  - title: Traceable
    text: One audit line per call — who, which tool of which API, which namespace, the outcome — with the request id passed on to the API, and Prometheus metrics.

facts:
  - k: Built on
    v: "[lib](../lib/): its settings, endpoints, errors and metrics"
  - k: Platforms
    v: linux amd64 and arm64, or a container image
  - k: Works with
    v: "[Kayra](../kayra/): callers, the APIs, namespaces, the OAuth login"

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
as a caller Kayra knows, to an API that checks it with Kayra.
