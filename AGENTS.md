# AGENTS.md

## Purpose

Root instruction file for Codex and general agents working on AquaCare.

## Project context

AquaCare is a bilingual French and English aquaculture management app for Cameroon. The stack is Django REST Framework, PostgreSQL, Redis, Celery on the backend, React Native, Expo, TypeScript, Redux Toolkit on the frontend.

## Non-negotiable rules

- Follow the existing architecture, naming, and patterns before introducing anything new.
- Keep visible UI text in i18n, never hardcode user-facing strings.
- Preserve offline-first behavior, UUID primary keys, and `client_uuid` deduplication.
- Keep backend business logic in services and domain helpers, not in views.
- Keep frontend final calculations aligned with backend responses.
- In inline lists, use commas, not hyphens.

## Branching and push policy

- Work from feature, fix, or refactor branches created from `develop`.
- Never work directly on `main` or `develop`.
- Never push until the user explicitly says the local review or tests are OK.

## Backend rules

- Use the backend architecture documented in `docs/architecture/BACKEND_ARCHITECTURE.md`.
- Favor service and domain layers over view logic.
- Keep UUID and offline sync rules intact for syncable models.

## Frontend rules

- Use Expo-compatible dependencies only.
- Validate changes with `npx tsc --noEmit`.
- Use `docs/design/DESIGN_SYSTEM.md` and `frontend/AGENTS.md` for UI-specific rules.

## Offline-first rules

- Generate UUIDs on the client for offline-created records.
- Deduplicate repeated submissions with `client_uuid` where supported.
- Keep sync endpoints idempotent where retries are expected.

## i18n rules

- Add every new visible string to both `frontend/src/i18n/locales/fr.ts` and `frontend/src/i18n/locales/en.ts`.
- Use `t('key')` in components instead of hardcoded copy.

## Testing and validation

- Backend, `pytest` and `ruff check`.
- Frontend, `npm test` and `npx tsc --noEmit`.
- Follow the detailed steps in `docs/workflows/TESTING.md` and the workflow docs.

## Documentation map

- [`WORKFLOW.md`](WORKFLOW.md), compatibility entry point for process docs.
- [`ARCHITECTURE.md`](ARCHITECTURE.md), compatibility entry point for architecture docs.
- [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md), compatibility entry point for UI rules.
- [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md), living project memory for agents and contributors.
- [`docs/agents/AGENT_DOCUMENTATION_STRATEGY.md`](docs/agents/AGENT_DOCUMENTATION_STRATEGY.md), documentation strategy and agent loading guidance.
- [`docs/product/PRODUCT_OVERVIEW.md`](docs/product/PRODUCT_OVERVIEW.md), product and domain knowledge entry point.
- [`backend/AGENTS.md`](backend/AGENTS.md), backend-specific rules.
- [`frontend/AGENTS.md`](frontend/AGENTS.md), frontend-specific rules.

## When unsure

- Read the relevant docs first, then inspect code.
- Prefer small, reversible changes.
- Call out any architectural deviation before implementing it.
