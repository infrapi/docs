---
title: InfraPI
description: Build your internal developer platform as APIs. Tenancy, RBAC and any infrastructure product behind one consistent, contract-first REST surface.
lead: InfraPI turns the infrastructure products you already run into governed, multi-tenant REST APIs. One URL layout, one token, one RBAC model, an OpenAPI contract enforced on every request — so a portal, a CLI or a pipeline creates what it needs without a ticket.

problems:
  - icon: ticket
    title: Tickets instead of APIs
    text: Teams wait days for a host, a DNS record or a dashboard that a script could create in seconds.
  - icon: puzzle
    title: One-off integrations
    text: Every internal API in front of a product is a hand-written client of that product, to keep in step with each of its releases.
  - icon: tenants
    title: Tenancy bolted on
    text: Who may create what, in which team's space, is re-invented in each tool — or left to shared admin credentials.

steps:
  - title: Describe
    text: Pick the resource types of an OpenTofu provider to expose, and the rules over them, in one YAML file.
    lang: yaml
    code: |
      provider:
        source: hashicorp/aws
        version: 6.0.0
        config:
          region: ${AWS_REGION}
      resources:
        aws_instance:
          attributes:
            instance_type:
              enum: [t3.micro, t3.small]
  - title: Serve
    text: One binary for every provider. The OpenAPI contract is generated from the provider's schemas at start.
    lang: bash
    code: |
      systemctl enable --now tofu-api@aws
      # contract at /-/openapi/aws/v1.json
      # Swagger UI at /-/docs
  - title: Call
    text: Any caller gets a plain REST API, checked against the contract, scoped to its namespace.
    lang: bash
    code: |
      curl -X POST \
        :8080/aws/v1/namespaces/acme/instance \
        -d '{"ami":"ami-0abc…",
             "instance_type":"t3.micro"}'

why:
  - icon: puzzle
    title: Composable
    text: Adopt one piece at a time — tofu-api alone in front of one product, Kayra for tenancy and RBAC, lib for your own services.
  - icon: contract
    title: Contract-first
    text: Every API serves its OpenAPI contract and rejects any request that does not match it, before a handler runs.
  - icon: tenants
    title: Multi-tenant by design
    text: Namespaces are the tenants. With tofu-api each one runs with its own credentials from Vault, so isolation comes from the credentials.
  - icon: server
    title: Plain to operate
    text: Single Go binaries, systemd units, RPM and DEB packages, Prometheus metrics and OpenTelemetry traces. No cluster required.

tiers:
  - title: Community
    price: Free, open source
    items: [All products, MIT license, Docs and tutorials, GitHub discussions]
    cta: Read the docs
    url: kayra/docs/
  - title: Consulting
    price: Per engagement
    featured: true
    items: [Platform assessment, First golden paths implemented, Identity, directory and Vault integration, Training for your platform team]
    cta: Talk to us
    url: services/#consulting
  - title: Support
    price: Yearly
    items: [Priority answers and fixes, Upgrade help while pre-1.0, A direct line to the maintainers]
    cta: Get support
    url: services/#support
---
