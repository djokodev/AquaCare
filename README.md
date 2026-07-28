# AquaCare

## Overview

AquaCare is a bilingual French and English aquaculture management mobile application for fish farmers in Cameroon. It is designed for low-connectivity environments and follows an offline-first approach.

## Product areas

- Accounts and farm setup
- Aquaculture production cycles and daily logs
- Feeding plans and production reports
- Commerce and feed-related purchasing
- Notifications and reminders
- Support and communication flows

## Tech stack

- Backend: Django REST Framework, PostgreSQL, Redis, Celery
- Frontend: React Native, Expo, TypeScript, Redux Toolkit
- Deployment: GitHub Actions, Docker Compose deployment stacks, EAS for mobile builds

## Documentation

Start here:

- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md)
- [`AGENTS.md`](AGENTS.md)
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md)
- [`docs/workflows/DEVELOPMENT_WORKFLOW.md`](docs/workflows/DEVELOPMENT_WORKFLOW.md)
- [`docs/workflows/TESTING.md`](docs/workflows/TESTING.md)
- [`docs/product/PRODUCT_OVERVIEW.md`](docs/product/PRODUCT_OVERVIEW.md)
- [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md)

## For AI agents

Agents should start with:

1. `AGENTS.md`
2. `PROJECT_CONTEXT.md`
3. The smallest relevant doc under `docs/`

Claude Code should use `CLAUDE.md`, which imports `AGENTS.md`.

## Local development

Local development may rely on local-only files such as `backend/docker-compose.yml` when present. See the canonical workflow docs instead of duplicating setup steps here.

- [`docs/workflows/DEVELOPMENT_WORKFLOW.md`](docs/workflows/DEVELOPMENT_WORKFLOW.md)
- [`docs/workflows/TESTING.md`](docs/workflows/TESTING.md)
- [`docs/architecture/DEPLOYMENT.md`](docs/architecture/DEPLOYMENT.md)

## Security

Do not commit secrets, raw DSNs, tokens, private IPs, or machine-specific local paths.

Use placeholders in documentation for sensitive infrastructure values.

## Status

This project is under active development. See `PROJECT_CONTEXT.md` for current state, priorities, risks, and update policy.
