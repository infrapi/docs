# infrapi/docs

The InfraPI developer portal: landing page, product hubs, Learn tutorials,
services — and every product's documentation in one site, with one search.
Built with [Hugo](https://gohugo.io): one binary, no theme or npm dependency.

**No product documentation is written here.** Each product keeps its docs in
its own repository's `docs/`, next to its code and browsable on GitHub. Hugo
mounts those folders at build time; nothing is copied or committed here.

| Written here | Mounted from the products |
|---|---|
| `content/_index.md` — landing page (data in front matter) | `content/products/<slug>/docs/` ← `infrapi/<slug>/docs/` |
| `content/products/<slug>/_index.md` — product hubs (`/products/<slug>/`) | |
| `content/learn/` — tutorials | |
| `data/products.yaml` — names, status, taglines (`version` is only a fallback) | `data/releases.yaml` ← each product's latest GitHub release (`scripts/releases.sh`) |
| `layouts/`, `assets/` — the theme, hand-written | |

## How it works

```
infrapi/kayra    ──┐  push to main touching docs/**, or a release (CI `notify` job)
infrapi/tofu-api ──┼──► repository_dispatch (docs-updated) ──┬─► infrapi/docs: Publish
infrapi/lib      ──┘          (+ nightly, + every push here)  │    ├─ checkout each repo's docs/ into _repos/
                                                              │    ├─ scripts/releases.sh → data/releases.yaml
                                                              │    ├─ hugo --panicOnWarning
                                                              │    └─ GitHub Pages
                                                              └─► infrapi/.github: Versions
                                                                   └─ versions in profile/README.md, committed
```

- The version shown for a product is its latest GitHub release, read at build
  time (`make releases` locally; offline, `version` in `data/products.yaml`).

- [`hugo.toml`](hugo.toml) mounts `_repos/<slug>/docs` at `content/products/<slug>/docs`,
  and its `index.md` as `_index.md` (Hugo needs that name, GitHub needs `index.md`).
- [`layouts/_markup/render-link.html`](layouts/_markup/render-link.html) resolves the
  docs' GitHub-style links — relative `.md` paths and the old
  `https://infrapi.github.io/<slug>/...` sites — to portal pages under `/products/<slug>/docs/`, and **fails the
  build on an unknown page or anchor**.
- [`layouts/_partials/docs-tree.html`](layouts/_partials/docs-tree.html) builds each
  product's sidebar from the files: `weight` in front matter orders pages; a
  subfolder is a group that takes the first free slot (10, 20, …).
- GitHub alerts (`> [!NOTE]`) render as callouts, `<details>` as is.

### What a product repository's docs need

- `docs/index.md` and one `.md` per page, front matter `title`, `description`, `weight`.
- GitHub-native Markdown only: alerts (`> [!NOTE]`), `<details>`, relative `.md` links.

## Run locally

Requires Hugo ≥ 0.158 (`go install github.com/gohugoio/hugo@latest` works).

```bash
make link     # use your checkouts in ../kayra, ../tofu-api, ../lib (LOCAL=.. by default)
make serve    # http://localhost:1313/docs/ — edits in ../kayra/docs reload live
make build    # as CI: fails on any broken link or anchor
make fetch    # instead of link: the repos' main branches from GitHub
```

## Add a product

1. Two mounts in [`hugo.toml`](hugo.toml) (copy an existing pair).
2. An entry in [`data/products.yaml`](data/products.yaml).
3. Its hub: `content/products/<slug>/_index.md` (copy one; set `product: <slug>` and keep the `cascade`).
4. A checkout step in [`.github/workflows/publish.yml`](.github/workflows/publish.yml).
5. In the product repo, [`templates/notify-docs.yml`](templates/notify-docs.yml) → `.github/workflows/`,
   and in its `ci.yml` a `notify` job after the release job (see infrapi/lib's).

## Setup, once

- **Pages**: Settings → Pages → Source = GitHub Actions. The workflow takes the
  base URL from Pages, so a custom domain later needs no change here.
- **GitHub App**, for the products' notify workflow: Repository permissions
  Contents read/write, no webhook, installed on `infrapi/docs` and `infrapi/.github`. At org
  level, shared with the product repositories: variable `DOCS_APP_ID` (the
  App ID) and secret `DOCS_APP_PRIVATE_KEY` (the `.pem` contents). Without
  it, the nightly build still picks changes up.
