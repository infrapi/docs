---
title: lib
layout: product
product: lib
description: lib gives your own platform services the same URL layout, authentication, contract enforcement, errors and observability as Kayra and tofu-api — so every API on the platform behaves the same way.
headline: The Go foundation of every InfraPI service.
start: getting-started

problems:
  - Each internal service picks its own routing, error format, auth, metrics and config conventions.
  - Callers have to learn each API's quirks; operators run each service differently.
  - The same plumbing is rewritten, and re-reviewed, in every new service.

features:
  - title: One URL layout
    text: "`/apis/{name}.{domain}/{version}/namespaces/{namespace}/{resource}`, shared by server, client and auth."
  - title: Server, pre-wired
    text: A gin engine with CORS, trusted proxies, Prometheus metrics, tracing and OpenAPI contracts enforced on every request.
  - title: Errors that help
    text: RFC 9457 problems with a stable code, a cause, a remediation hint and an explicit retryable flag.
  - title: Batteries for infra
    text: Vault (AppRole, KV v2, PKI), OTLP tracing, systemd socket activation, and the OpenTofu engine behind tofu-api.

facts:
  - k: Requires
    v: Go 1.26.7 or later
  - k: Install
    v: "`go get github.com/infrapi/lib`"

cascade:
  - target:
      path: "{/products/lib/docs,/products/lib/docs/**}"
    layout: docs
    product: lib
---
