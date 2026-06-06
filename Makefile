# maintmode-ui — container build & run.
#
# Production (env=prod) is intentionally NOT runnable here: prod is deployed by
# the orchestrator/CD, not the local Makefile. `up`/`down`/`logs` accept only
# dev|local.

IMAGE        ?= maintmode-ui
TAG          ?= local
DOCKERFILE   := deployment/.build/Dockerfile
# Build context is the repo root so the Dockerfile can COPY the whole project.
CONTEXT      := .

# Runtime knobs (override on the CLI, e.g. `make up env=dev PORT=8080`).
PORT         ?= 3000
CONTAINER    ?= maintmode-ui-$(env)
ENV_FILE      = deployment/$(env)/app.env

# Docker network of the local backend stack (caddy gateway + services). Joining
# it lets the BFF reach the gateway by its service DNS name (caddy:3000) instead
# of relying on host port publishing. Override with NETWORK= if your stack
# differs; set NETWORK= (empty) to skip joining a network entirely.
NETWORK      ?= theapp
NETWORK_FLAG  = $(if $(NETWORK),--network $(NETWORK),)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Run with an environment, e.g.:  make up env=dev"
	@echo "  Environments for up/down/logs:  dev | local  (prod is deploy-only)"

# --- guards -----------------------------------------------------------------
# Ensure `env` is one of the runnable environments and its env file exists.
.PHONY: guard-env
guard-env:
	@if [ -z "$(env)" ]; then \
		echo "error: env is required, e.g. 'make $(MAKECMDGOALS) env=dev'"; exit 1; fi
	@if [ "$(env)" != "dev" ] && [ "$(env)" != "local" ]; then \
		echo "error: env must be 'dev' or 'local' (got '$(env)'); prod is deploy-only"; exit 1; fi
	@if [ ! -f "$(ENV_FILE)" ]; then \
		echo "error: $(ENV_FILE) not found. Copy it from the example:"; \
		echo "       cp $(ENV_FILE).example $(ENV_FILE)"; exit 1; fi

# --- build ------------------------------------------------------------------
.PHONY: build
build: ## Build the production image (IMAGE=$(IMAGE) TAG=$(TAG))
	docker build -f $(DOCKERFILE) -t $(IMAGE):$(TAG) $(CONTEXT)

# Build the image only if it does not exist yet, so `up` is self-sufficient on
# a fresh machine without rebuilding on every run. Use `build`/`reup` to force.
.PHONY: ensure-image
ensure-image:
	@docker image inspect $(IMAGE):$(TAG) >/dev/null 2>&1 \
		|| { echo "image $(IMAGE):$(TAG) not found, building..."; $(MAKE) build; }

# --- run --------------------------------------------------------------------
# up:   stop any existing container, build the image if missing, then run.
# down: stop & remove the container.
# reup: force a fresh image build, then up. Use after changing app code.
.PHONY: up
up: guard-env ensure-image ## Stop, (build if missing), and run: make up env=dev|local
	$(MAKE) down env=$(env)
	docker run --rm -d \
		--name $(CONTAINER) \
		--env-file $(ENV_FILE) \
		$(NETWORK_FLAG) \
		--add-host host.docker.internal:host-gateway \
		-p $(PORT):3000 \
		$(IMAGE):$(TAG)
	@echo "maintmode-ui ($(env)) -> http://localhost:$(PORT)"

.PHONY: down
down: guard-env ## Stop and remove the container for an env
	-docker rm -f $(CONTAINER)

.PHONY: logs
logs: guard-env ## Tail container logs for an env
	docker logs -f $(CONTAINER)

.PHONY: reup
reup: guard-env ## Force-rebuild the image, then up: make reup env=dev
	$(MAKE) build
	$(MAKE) up env=$(env)
