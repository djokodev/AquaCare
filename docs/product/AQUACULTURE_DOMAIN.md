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

In both modes, allocation totals must equal the cycle initial count and new-unit capacity is checked by the backend. A foreign or unknown existing-unit ID is intentionally opaque and returns 404; an owned inactive unit returns 400. The domain permits a unit to be selected by more than one cycle when the model allows it.

`launch_uuid` is the idempotency key and is stored as the cycle `client_uuid`. Pure domain code canonicalizes a copy of the validated payload and computes its SHA-256 hash; client array order is preserved in the business result. An identical retry returns HTTP 200 with the same IDs and `idempotent_replay=true`; reusing the UUID with another payload or farm returns HTTP 409 with `cycle_launch_idempotency_conflict`.

Selling prices are optional at the HTTP boundary. When absent, the backend resolves the species default from `ECONOMIC_DEFAULTS_BY_SPECIES` (Clarias 2,000 FCFA/kg, Tilapia 2,800 FCFA/kg); zero and negative values are rejected.

Direct `POST /api/aquaculture/cycles/` is deprecated and disabled for new cycles; it returns `cycle_launch_requires_production_units` and points callers to the launch endpoint. Reads and updates of historical cycles remain supported, as does legacy cycle creation used by synchronization internals.

The modern `NewCycleScreen` uses one online launch request with a stable UUID for retries. It does not create an isolated modern cycle offline; the incomplete form stays in memory. The legacy synchronization fallback remains available only for compatibility with older flows.

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
