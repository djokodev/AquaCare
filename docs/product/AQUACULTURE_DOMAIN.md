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
