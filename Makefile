# InfraPI portal — local workflow
#
#   make dev      link ../kayra ../tofu-api ../lib and serve with live reload
#   make check    build exactly as CI does (fails on broken links/anchors)
#   make help     everything else

# Hugo: $HUGO if set, else on PATH, else where `go install` puts it.
HUGO ?= $(firstword $(shell command -v hugo 2>/dev/null) \
          $(wildcard $(shell go env GOBIN 2>/dev/null)/hugo) \
          $(wildcard $(shell go env GOPATH 2>/dev/null)/bin/hugo) \
          $(wildcard $(HOME)/.local/share/go/bin/hugo) \
          $(wildcard $(HOME)/go/bin/hugo))
HUGO_VERSION ?= v0.169.0

# where your checkouts of the product repositories live, for `make link`
LOCAL ?= ..
REPOS := kayra tofu-api lib
PORT  ?= 1313

.PHONY: help dev link check-repos fetch serve check build open clean install-hugo hugo-ok

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-13s %s\n", $$1, $$2}'
	@echo; echo "  hugo: $(or $(HUGO),NOT FOUND — run: make install-hugo)"

dev: link serve ## Link your local checkouts, then serve with live reload

link: ## Use your checkouts in $(LOCAL)/<repo> (edits there reload live)
	@mkdir -p _repos
	@for r in $(REPOS); do \
	  [ -d "$(LOCAL)/$$r/docs" ] || { echo "missing $(LOCAL)/$$r/docs (clone infrapi/$$r there, or use: make fetch)"; exit 1; }; \
	  rm -rf "_repos/$$r"; ln -s "$$(realpath $(LOCAL)/$$r)" "_repos/$$r"; \
	  echo "  _repos/$$r -> $$(realpath $(LOCAL)/$$r) ($$(git -C $(LOCAL)/$$r branch --show-current 2>/dev/null))"; \
	done
	@$(MAKE) --no-print-directory check-repos

check-repos: ## Check every linked repo has portal-ready docs (front matter)
	@bad=0; for r in $(REPOS); do \
	  f="_repos/$$r/docs/index.md"; \
	  if [ ! -f "$$f" ]; then echo "  ✗ $$r: no docs/index.md"; bad=1; \
	  elif [ "$$(head -1 $$f)" != "---" ]; then \
	    echo "  ✗ $$r: docs/index.md has no front matter (branch $$(git -C _repos/$$r branch --show-current 2>/dev/null)): not migrated, switch to docs/portal-ready"; bad=1; \
	  fi; \
	done; [ $$bad = 0 ] && echo "  ✓ all repos have portal-ready docs" || exit 1

fetch: ## Use the repos' main branches from GitHub instead, as CI does
	@mkdir -p _repos
	@for r in $(REPOS); do \
	  rm -rf "_repos/$$r"; \
	  git -c core.hooksPath=/dev/null clone -q --depth 1 --filter=blob:none --sparse "https://github.com/infrapi/$$r.git" "_repos/$$r" && \
	  git -c core.hooksPath=/dev/null -C "_repos/$$r" sparse-checkout set docs && echo "  _repos/$$r <- infrapi/$$r@main"; \
	done

serve: hugo-ok ## Serve on http://localhost:$(PORT)/docs/ with live reload
	@[ -d _repos ] || { echo "no _repos/: run make link (local checkouts) or make fetch (GitHub) first"; exit 1; }
	@echo "  → http://localhost:$(PORT)/docs/"
	$(HUGO) server --port $(PORT) --disableFastRender --navigateToChanged

check: hugo-ok ## Build as CI does: fails on any broken link or anchor
	$(HUGO) --gc --minify --panicOnWarning --destination public
	@echo "  ok: $$(find public -name index.html | wc -l) pages in public/"

build: check ## Alias of check

open: ## Open the running preview in your browser
	@xdg-open "http://localhost:$(PORT)/docs/" 2>/dev/null || open "http://localhost:$(PORT)/docs/" 2>/dev/null || echo "open http://localhost:$(PORT)/docs/"

clean: ## Remove build output
	rm -rf public resources .hugo_build.lock

install-hugo: ## Install Hugo $(HUGO_VERSION) with go install
	go install github.com/gohugoio/hugo@$(HUGO_VERSION)

HUGO_MIN := 158
hugo-ok:
	@[ -n "$(HUGO)" ] || { echo "hugo not found: make install-hugo, or make HUGO=/path/to/hugo"; exit 1; }
	@v=$$($(HUGO) version | sed -nE 's/^hugo v0\.([0-9]+).*/\1/p'); \
	  [ -n "$$v" ] && [ "$$v" -ge $(HUGO_MIN) ] || { \
	    echo "$(HUGO) is $$($(HUGO) version | cut -d' ' -f2): need v0.$(HUGO_MIN) or later."; \
	    echo "  make install-hugo, or make <target> HUGO=/path/to/newer/hugo"; exit 1; }
