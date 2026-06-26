# PROJECT_CONTEXT.md

## Purpose

This file is the living memory of AquaCare. Update it when major product, technical, architecture, release, or business decisions change.

## Project snapshot

AquaCare is a bilingual French and English aquaculture management mobile application for fish farmers in Cameroon. It is designed for intermittent connectivity and follows an offline-first approach.

Current stack:

- Backend, Django REST Framework, PostgreSQL, Redis, Celery
- Frontend, React Native, Expo, TypeScript, Redux Toolkit
- Product areas, accounts/auth, aquaculture, commerce, support/chat, notifications, onboarding/profile

## Current status

| Area | Status | Notes |
| --- | --- | --- |
| Accounts/Auth | Implemented | JWT auth, phone-based login, farm profile flows, backend service layering |
| Aquaculture | Implemented | Cycles, logs, feeding, sanitary tracking, reporting, offline sync |
| Commerce | Implemented | Product catalogue, orders, feed-related commerce logic |
| Notifications | Implemented | Notification flows and device registration are present |
| Chat/Support | Implemented | Support module exists and is wired into the backend |
| Mobile frontend | Implemented | Expo/TypeScript app with feature folders and i18n |
| Deployment | Implemented | Docker Compose stacks and GitHub Actions workflows exist |
| Agent documentation | Implemented | Root agent files plus docs strategy and path-specific rules |

## Major technical decisions

- Offline-first behavior is a core product constraint.
- UUID primary keys are used where offline-created data needs safe synchronization.
- `client_uuid` deduplication is required for retry-safe creation paths where supported.
- The backend is the source of truth for business calculations and final values.
- FR/EN i18n is mandatory for visible UI text.
- React Native UI must not hardcode visible copy.
- Expo compatibility matters for all frontend dependencies.
- Backend code should keep business logic in services and domain helpers.
- Path-specific rules live in `backend/AGENTS.md` and `frontend/AGENTS.md`.

## Product and business context

- Primary users are fish farmers and farm managers in Cameroon.
- Rural connectivity can be unstable, so sync and retry behavior matters.
- Aquaculture concepts that matter here include feed, biomass, FCR, mortality, harvest, and cycle tracking.
- Commerce is tied to feed and product purchasing rather than general retail.

Deeper references:

- [`docs/product/PRODUCT_OVERVIEW.md`](docs/product/PRODUCT_OVERVIEW.md)
- [`docs/product/BUSINESS_RULES.md`](docs/product/BUSINESS_RULES.md)
- [`docs/product/AQUACULTURE_DOMAIN.md`](docs/product/AQUACULTURE_DOMAIN.md)
- [`docs/product/COMMERCE_DOMAIN.md`](docs/product/COMMERCE_DOMAIN.md)

## Documentation map

- [`AGENTS.md`](AGENTS.md), shared agent rules
- [`CLAUDE.md`](CLAUDE.md), Claude Code import and guidance
- [`docs/agents/AGENT_DOCUMENTATION_STRATEGY.md`](docs/agents/AGENT_DOCUMENTATION_STRATEGY.md), agent loading strategy
- [`docs/architecture/ARCHITECTURE.md`](docs/architecture/ARCHITECTURE.md), architecture entry point
- [`docs/workflows/DEVELOPMENT_WORKFLOW.md`](docs/workflows/DEVELOPMENT_WORKFLOW.md), development flow
- [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md), UI rules
- [`backend/AGENTS.md`](backend/AGENTS.md), backend-specific rules
- [`frontend/AGENTS.md`](frontend/AGENTS.md), frontend-specific rules

## Current priorities

- Offline sync hardening, to confirm.
- Support and chat improvements, to confirm.
- Push notification completion, to confirm.
- Deployment and release readiness, to confirm.
- Documentation quality maintenance, confirmed.

## Known risks and cautions

- Do not expose secrets, DSNs, tokens, or private IPs in docs.
- Avoid stale module names, always verify the runtime source tree first.
- Do not change application source code during docs-only refactors unless a reference is broken.
- Verify frontend runtime constants before editing `frontend/src/constants/*`.
- Keep root docs short and use selective docs for details.

## Update policy

Update this file when:

- a major feature lands
- a major architecture decision changes
- the deployment or release process changes
- the product scope changes
- a new module is added
- significant technical debt is identified or resolved

Do not put here:

- full architecture details
- full workflow instructions
- full design tokens
- temporary task notes
- long PR checklists
