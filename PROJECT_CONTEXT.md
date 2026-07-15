# PROJECT_CONTEXT.md

## Purpose

This file is the living memory of AquaCare. Update it when major product, technical, architecture, release, or business decisions change.

## Calibration tanks and autonomous sessions

A calibration tank is a permanent physical `ProductionUnit` (`unit_type=tank`,
`purpose=calibration`). Its first live arrival opens an autonomous rearing session,
represented by a `ProductionCycle(cycle_kind=calibration)` and one active allocation.
The transfer is a ledger movement: source stock decreases and destination stock is
then independent. Harvesting or closing the source never cascades to the destination.

A partial harvest subtracts the actual harvested count and biomass, then replays the
ledger. Harvesting the last active allocation closes the technical destination
session in the same transaction, preserves its history and makes the physical tank
available. A later arrival creates a new session rather than reopening the old one.

Unit mutation and deletion rules are centralized across specialized and generic APIs
and Django admin. Occupied calibration tanks protect volume, type, purpose and
status; empty tanks with history cannot be deleted. Unit names are case-insensitively
unique within a farm.

Replay orders events by business timestamp, `created_at`, UUID. A backdated offline
movement is accepted only when the complete timeline stays positive; if it becomes
the first arrival, session dates and initial descriptive snapshots are updated.
Transfers, harvests and replay re-aggregate cycle metrics. Reports expose incoming
and outgoing movements and their origins separately from growth and mortality.

Offline tanks and operations remain in `AsyncStorage`, merge with server data by
`client_uuid`, and stay visible as pending. Local destinations use
`destination_production_unit_client_uuid`; only server-confirmed items are marked as
synchronized.

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

### Calibration tanks and grading transfers

A calibration tank reuses the existing physical `ProductionUnit` aggregate. `unit_type` remains the physical shape (`tank`, `pond`, `cage`), while `purpose` distinguishes `production` from `calibration`; calibration units must be tanks with a positive volume and no surface. There is no parallel `CalibrationTank` database model. The `/calibration-tanks/` API is a filtered compatibility facade over `ProductionUnit`.

Grading starts from one precise `CycleUnitAllocation`. The first arrival into an empty calibration unit creates a `ProductionCycle(cycle_kind="calibration")` and a zero-initialized destination allocation. Later arrivals reuse its single active allocation. `CalibrationOperation` is an immutable ledger movement between `source_allocation` and `destination_allocation`, with before/after snapshots and idempotent `client_uuid` replay. The canonical endpoint is `POST /aquaculture/cycle-unit-allocations/{id}/calibrate/`; the cycle endpoint is only a compatibility adapter when exactly one active source allocation exists.

Allocation stock is replayed in deterministic business-time order from incoming movements, unit logs, outgoing movements, partial harvests and final state. Mortality preserves the previous average weight and recomputes biomass. Cycle survival and FCR recognize live transfers and harvested stock, so an arrival is not growth and a departure is not mortality. Backdated offline movements replay later snapshots transactionally.

Cycle launch optionally accepts `calibration_units`; these physical units are created atomically but remain empty and unallocated. Bulk sync normalizes UUID, datetime and decimal values, resolves allocations and units by server ID or client UUID, returns per-item errors, and always includes calibration server updates during full sync. The mobile queue marks only confirmed items as synchronized and includes calibration tanks and operations in unit fallback results.

Migration `aquaculture.0032_calibration_allocations` replaces the unmerged experimental 0032/0033 migrations. Local branches that applied the old versions must migrate aquaculture back to 0031 before applying the new 0032. The migration uses a two-second lock timeout, concurrent indexes on existing tables and a two-phase check constraint. No production migration is performed from a development workspace.

Confirmed movements cannot be edited or deleted. Mixing species, transferring an entire source allocation and redistributing historical costs remain out of scope.

- Offline-first behavior is a core product constraint.
- UUID primary keys are used where offline-created data needs safe synchronization.
- `client_uuid` deduplication is required for retry-safe creation paths where supported.
- The backend is the source of truth for business calculations and final values.
- FR/EN i18n is mandatory for visible UI text.
- React Native UI must not hardcode visible copy.
- Expo compatibility matters for all frontend dependencies.
- Backend code should keep business logic in services and domain helpers.
- Order documents are admin-only operational artifacts. Their document inputs
  are immutable snapshots; no mobile PDF delivery is provided.
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
