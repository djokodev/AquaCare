# Business Rules

## Non-negotiables

- The backend is authoritative for final calculations.
- Visible UI text must exist in both French and English.
- Offline-created records must be safe to retry.
- Syncable entities should use UUID primary keys.

## Important data sources

- `backend/apps/accounts/constants.py`
- `backend/apps/aquaculture/constants.py`
- `backend/apps/commerce/constants.py`
- `frontend/src/constants/aquaculture.ts`
- `frontend/src/constants/cameroon.ts`

## Operational defaults

- FCFA is the monetary context for the app.
- The aquaculture domain currently centers on tilapia and clarias.
- The app uses a consistent set of backend and frontend constants for prices, densities, and thresholds.
- Recommended planned cycle duration: Clarias 120 days, Tilapia 180 days, other species 180 days for compatibility.
- Planned cycle duration is editable from 30 to 365 calendar days and belongs to the cycle, not to individual production units.
- The first cycle day is the stocking date, so the planned harvest date is the start date plus duration minus one day.

- A new cycle launch must include at least one real production unit.
- Each launch unit has exactly one positive allocation, and the sum of allocations equals the cycle initial fish count.
- Launch setup, cycle, units, and allocations commit atomically; an intermediate failure rolls everything back.
- Launch retries use a stable `launch_uuid`; identical retries are replayed without duplicate rows, while changed payloads return a conflict.
- A custom duration survives species changes and is used consistently by simulation, annual projections, persistence, reports, and time remaining.

## What to avoid

- Frontend-only business truth.
- Hardcoded text strings in UI components.
- Hardcoded secrets or machine-specific infrastructure values in docs.
- Breaking existing sync identifiers or deduplication rules.
