---
title: Kayra
layout: product
product: kayra
description: Kayra says who a caller is, which namespace they act in, and what RBAC lets them do there. It keeps the catalog of the platform's APIs and which namespace is subscribed to which, and leaves each API to the team that owns it.
headline: Identity, tenancy and access control for your internal platform.
start: getting-started

problems:
  - Every platform API re-implements authentication and "who may do what".
  - Tenants exist in each tool under a different name, joined by convention.
  - Onboarding a team on a new API is a manual, undocumented sequence of steps.

features:
  - title: Authentication
    text: Bearer tokens from your OIDC identity provider, personal access tokens, and a portable [`infrapi-cli`](/products/cli/docs/) to log in with.
  - title: RBAC
    text: "`Group`, `Role`, `RoleBinding`, cluster- and namespace-scoped, gated by real directory groups rather than a synced list."
  - title: Namespaces
    text: The unit of isolation of every API's resources, RBAC and subscriptions. A team or a customer owns one or several, [as in Kubernetes](/products/kayra/docs/architecture/multi-tenancy/).
  - title: API catalog
    text: Register API groups and their owners; subscribe namespaces to them; a reconciler turns subscriptions active.

facts:
  - k: Storage
    v: etcd, or local files for development
  - k: Binaries
    v: "`kayra` (server, reconciler); end users run `infrapi-cli`"
  - k: Built on
    v: "[lib](../lib/)"

cascade:
  - target:
      path: "{/products/kayra/docs,/products/kayra/docs/**}"
    layout: docs
    product: kayra
---

## Named after Kayra Han

In Altai Turkic mythology, Kayra Han rose from the primordial waters, shaped
the land and gave each of his sons a realm to govern. Kayra does the same
for your platform: it creates namespaces, decides who rules what through
RBAC, and leaves each API to the team that owns it.
