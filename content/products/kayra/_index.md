---
title: Kayra
layout: product
product: kayra
description: Kayra says who a caller is, which namespace — tenant — they act in, and what RBAC lets them do there. It keeps the catalog of the platform's APIs and which tenant is subscribed to which, and leaves each API to the team that owns it.
headline: Identity, tenancy and access control for your internal platform.
start: getting-started

problems:
  - Every platform API re-implements authentication and "who may do what".
  - Tenants exist in each tool under a different name, joined by convention.
  - Onboarding a team on a new API is a manual, undocumented sequence of steps.

features:
  - title: Authentication
    text: Bearer tokens from your OIDC identity provider, personal access tokens, and a portable `kayra-cli` to log in with.
  - title: RBAC
    text: "`Group`, `Role`, `RoleBinding`, cluster- and namespace-scoped, gated by real directory groups rather than a synced list."
  - title: Namespaces
    text: The namespace *is* the tenant — not two things joined by a name.
  - title: API catalog
    text: Register API groups and their owners; subscribe tenants to them; a reconciler turns subscriptions active.

facts:
  - k: Storage
    v: etcd, or local files for development
  - k: Binaries
    v: "`kayra` (server, reconciler) and `kayra-cli` (end users)"
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
