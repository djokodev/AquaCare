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

New cycle launches use `POST /api/aquaculture/cycles/launch/`. The operation updates the farm production plan and creates the cycle, its production units, and exactly one positive fish allocation per unit in one database transaction. The allocation total must equal the cycle initial count, and each unit capacity is checked by the backend.

`launch_uuid` is the idempotency key and is stored as the cycle `client_uuid`. The validated input is hashed with SHA-256. An identical retry returns HTTP 200 with the same IDs and `idempotent_replay=true`; reusing the UUID with another payload or farm returns HTTP 409 with `cycle_launch_idempotency_conflict`.

Direct `POST /api/aquaculture/cycles/` is reserved for no new cycles and returns `cycle_launch_requires_production_units`. Reads and updates of historical cycles without units remain supported, as does legacy cycle creation used by synchronization internals.

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
