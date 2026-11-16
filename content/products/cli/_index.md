---
# infrapi/cli is docs only: no hub page, its docs under /products/cli/docs/
# (data/products.yaml: hub: false, listed in `docs` but not in `order`).
title: cli
build:
  render: never
  list: never
cascade:
  - target:
      path: "{/products/cli/docs,/products/cli/docs/**}"
    layout: docs
    product: cli
---
