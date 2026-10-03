.PHONY: help build-bun build-dotnet build-laravel build-all up-postgres up-bun up-dotnet up-laravel down logs-bun logs-dotnet logs-laravel benchmark test migrate seed monitor

help:
	@echo "Available commands:"
	@echo "  make build-bun      - Build Docker image for Bun API"
	@echo "  make build-dotnet   - Build Docker image for .NET 10 API"
	@echo "  make build-laravel  - Build Docker image for Laravel FrankenPHP API"
	@echo "  make build-all      - Build all Docker images"
	@echo "  make up-postgres    - Start PostgreSQL database"
	@echo "  make migrate        - Run DB migrations (via Docker container)"
	@echo "  make seed           - Seed 500.000 records to DB (via Docker container)"
	@echo "  make up-bun         - Deploy & run Bun API container (3.0 CPU / 4GB RAM limit)"
	@echo "  make up-dotnet      - Deploy & run .NET 10 API container (3.0 CPU / 4GB RAM limit)"
	@echo "  make up-laravel     - Deploy & run Laravel FrankenPHP API container (3.0 CPU / 4GB RAM limit)"
	@echo "  make down           - Stop all running containers"
	@echo "  make monitor        - Live TUI Engine Monitor & Historical Comparison"
	@echo "  make benchmark      - Run automated k6 benchmark suite"
	@echo "  make test           - Run Bun API unit test suite"

# Standalone Docker builds
build-bun:
	docker build -t gogoskola-bun:latest ./bun-api

build-dotnet:
	docker build -t gogoskola-dotnet:latest ./dotnet-api

build-laravel:
	docker build -t gogoskola-laravel:latest ./laravel-api

build-all: build-bun build-dotnet build-laravel

up-postgres:
	docker compose up -d postgres pgbouncer

migrate:
	docker compose run --rm bun-api bun src/db/migrate.ts

seed:
	docker compose run --rm bun-api bun src/db/seed-500k.ts

up-bun:
	docker compose --profile dotnet --profile laravel down > /dev/null 2>&1 || true
	docker compose up -d pgbouncer
	docker compose --profile bun up -d --build bun-api

up-dotnet:
	docker compose --profile bun --profile laravel down > /dev/null 2>&1 || true
	docker compose up -d pgbouncer
	docker compose --profile dotnet up -d --build dotnet-api

up-laravel:
	docker compose --profile bun --profile dotnet down > /dev/null 2>&1 || true
	docker compose up -d pgbouncer
	docker compose --profile laravel up -d --build laravel-api

down:
	docker compose --profile bun --profile dotnet --profile laravel down

logs-bun:
	docker compose logs -f bun-api

logs-dotnet:
	docker compose logs -f dotnet-api

logs-laravel:
	docker compose logs -f laravel-api

# Testing and benchmarking
test:
	cd bun-api && bun test

monitor:
	./benchmarks/monitor.sh

benchmark:
	./benchmarks/run-benchmark.sh
