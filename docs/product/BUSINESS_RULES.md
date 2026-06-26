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

## What to avoid

- Frontend-only business truth.
- Hardcoded text strings in UI components.
- Hardcoded secrets or machine-specific infrastructure values in docs.
- Breaking existing sync identifiers or deduplication rules.
