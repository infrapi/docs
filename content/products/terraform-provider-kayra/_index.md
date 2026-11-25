---
# infrapi/terraform-provider-kayra is docs only: no hub page, its docs under
# /products/terraform-provider-kayra/docs/ (data/products.yaml: hub: false,
# listed in `docs` but not in `order`).
title: Terraform provider
build:
  render: never
  list: never
cascade:
  - target:
      path: "{/products/terraform-provider-kayra/docs,/products/terraform-provider-kayra/docs/**}"
    layout: docs
    product: terraform-provider-kayra
---
