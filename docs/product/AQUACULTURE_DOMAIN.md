# Aquaculture Domain

## Scope

This domain covers fish production planning, daily operational logs, feeding guidance, sanitary tracking, harvests, reporting, and offline sync for production data.

## Main concepts

- Production cycle, the unit of work for a fish production run.
- Daily log, the recurring record of cycle observations.
- Feeding plan, the recommendation layer for rationing and schedule.
- Sanitary log, the incident and treatment record.
- Harvest, the point where the cycle is finalized or partially reduced.
- Report, the user-facing summary generated from production data.

## Domain rules

- Production data should be computed by backend services and domain helpers.
- Optimistic frontend estimates are allowed, but they must be replaced by backend results.
- Syncable records should tolerate retries without creating duplicates.
- Cycle state transitions must remain consistent with the backend model and service logic.
- A cycle has one planned duration shared by all production units. Recommended values are 120 days for Clarias and 180 days for Tilapia; other species use 180 days as the compatibility fallback.
- The configured duration is an integer from 30 through 365 days and may be customized during farm setup. A manual value is not overwritten when the species changes.
- Planned harvest dates use inclusive calendar-day semantics: `start_date + planned_cycle_duration_days - 1 day`.
- The resolved duration drives annual cadence, cycle simulation, feed/cost projections, reports, and remaining-time calculations. Legacy clients may omit it, and legacy null cycles fall back to the species recommendation.

## Transactional cycle launch

All new launches use `POST /api/aquaculture/cycles/launch/` with an explicit `launch_kind`:

- `initial_setup` requires a production plan and `source=new` units. It completes the farm setup and creates the cycle, units, and exactly one positive allocation per unit in one database transaction. A completed setup cannot be initialized again.
- `additional_cycle` requires a completed setup and `source=existing` references to active units owned by the farm. The selected units are locked and reused; only the cycle and its allocations are created. Setup data is never rewritten, and a rollback leaves the existing setup unchanged.

In both modes, allocation totals must equal the cycle initial count and the backend checks the canonical capacity for both new and existing units. A foreign or unknown existing-unit ID is intentionally opaque and returns 404; an owned inactive unit returns 400. A physical unit may have at most one active allocation attached to an active cycle. The unit is locked before this occupancy check; an occupied unit returns HTTP 409 with `cycle_launch_unit_already_allocated`, without exposing the occupying cycle. Harvested or otherwise officially inactive allocations release the unit for reuse. A replay of the same launch remains allowed before the occupancy check.

`cycle_name` is optional launch intent. A non-blank name is trimmed and persisted exactly; an absent or blank name is left as `None` so the backend generates its normal name.

`launch_uuid` is the idempotency key and is stored as the cycle `client_uuid`. Pure domain code canonicalizes a copy of the validated payload and computes its SHA-256 hash; client array order is preserved in the business result. An identical retry returns HTTP 200 with the same IDs and `idempotent_replay=true`; reusing the UUID with another payload or farm returns HTTP 409 with `cycle_launch_idempotency_conflict`.

Selling prices are optional at the HTTP boundary. When absent, the backend resolves the species default from `ECONOMIC_DEFAULTS_BY_SPECIES` (Clarias 2,000 FCFA/kg, Tilapia 2,800 FCFA/kg); zero and negative values are rejected.

Direct `POST /api/aquaculture/cycles/` is deprecated and disabled for new cycles; it returns `cycle_launch_requires_production_units` and points callers to the launch endpoint. Reads and updates of historical cycles remain supported, as does legacy cycle creation used by synchronization internals.

The modern `NewCycleScreen` uses one online launch request with a stable UUID for retries. It does not create an isolated modern cycle offline; the incomplete form stays in memory. The legacy synchronization fallback remains available only for compatibility with older flows.

## Production reports

Reports reuse one backend pipeline for daily, weekly, and monthly periods. A
cycle report is scoped by `ProductionCycle` and aggregates all allocations in
that cycle. A unit report is scoped by `CycleUnitAllocation`, not only by the
physical `ProductionUnit`; this preserves the cycle context when a physical
unit is reused later.

Manual generation uses `scope_type=cycle` with `cycle_id`, or
`scope_type=unit` with `cycle_unit_allocation_id`. The backend resolves both
the farm and the allocation and rejects an allocation from another cycle or
farm opaquely. Legacy clients may continue sending `scope` as an alias.

Unit reports contain only allocation-linked logs, mortalities, weights,
sanitary events, harvests, stock, biomass, survival, FCR, capacity, and
density. Cycle-wide logs, global sanitary events, cycle costs, and unscoped
feeding plans are omitted from unit reports rather than being divided between
units. Cycle reports retain their existing multi-unit comparison and
cycle-wide sections. The mobile report screen loads its options from the
selected cycle's allocations and keeps the full-cycle option available for
legacy cycles without allocations.

## Constants and references

- `backend/apps/aquaculture/constants.py`
- `backend/apps/aquaculture/domain/`
- `backend/apps/aquaculture/services/`
- `frontend/src/constants/aquaculture.ts`
- `frontend/src/domain/aquaculture/`

## Useful terms

- FCR, feed conversion ratio.
- Biomass, total fish mass in the cycle.
- Survival rate, retained fish versus starting fish.
- Stocking density, how many fish are introduced per surface or volume unit.
