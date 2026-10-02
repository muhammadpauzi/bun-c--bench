.PHONY: help build-bun build-dotnet build-all up-postgres up-bun up-dotnet down logs-bun logs-dotnet benchmark test migrate seed monitor

help:
	@echo "Available commands:"
	@echo "  make build-bun      - Build Docker image for Bun API"
	@echo "  make build-dotnet   - Build Docker image for .NET 10 API"
	@echo "  make build-all      - Build both Docker images"
	@echo "  make up-postgres    - Start PostgreSQL database"
	@echo "  make migrate        - Run DB migrations (via Docker container)"
	@echo "  make seed           - Seed 500.000 records to DB (via Docker container)"
	@echo "  make up-bun         - Deploy & run Bun API container (1 CPU limit)"
	@echo "  make up-dotnet      - Deploy & run .NET 10 API container (1 CPU limit)"
	@echo "  make down           - Stop all running containers"
	@echo "  make monitor        - Live TUI Engine Monitor & Historical Comparison"
	@echo "  make benchmark      - Run automated k6 benchmark suite"
	@echo "  make test           - Run Bun API unit test suite"

# Standalone Docker builds
build-bun:
	docker build -t gogoskola-bun:latest ./bun-api

build-dotnet:
	docker build -t gogoskola-dotnet:latest ./dotnet-api

build-all: build-bun build-dotnet

# Docker Compose deployment commands
up-postgres:
	docker compose up -d postgres

migrate:
	docker compose run --rm bun-api bun src/db/migrate.ts

seed:
	docker compose run --rm bun-api bun src/db/seed-500k.ts

up-bun:
	docker compose --profile dotnet down > /dev/null 2>&1 || true
	docker compose --profile bun up -d --build bun-api

up-dotnet:
	docker compose --profile bun down > /dev/null 2>&1 || true
	docker compose --profile dotnet up -d --build dotnet-api

down:
	docker compose --profile bun --profile dotnet down

logs-bun:
	docker compose logs -f bun-api

logs-dotnet:
	docker compose logs -f dotnet-api

# Testing and benchmarking
test:
	cd bun-api && bun test

monitor:
	./benchmarks/monitor.sh

benchmark:
	./benchmarks/run-benchmark.sh
