---
# infrapi/dev is docs only: no hub page, its docs under /products/dev/docs/
# (data/products.yaml: hub: false, listed in `docs` but not in `order`).
title: dev
build:
  render: never
  list: never
cascade:
  - target:
      path: "{/products/dev/docs,/products/dev/docs/**}"
    layout: docs
    product: dev
---
