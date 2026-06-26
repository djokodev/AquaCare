# Testing

## Backend

- `cd backend`
- `docker compose up -d`
- `docker compose exec api python manage.py migrate`
- `docker compose exec api pytest`
- `docker compose exec api pytest apps/aquaculture/tests/`
- `docker compose exec api ruff check backend/manage.py backend/apps backend/aquacare_api backend/tests`

## Frontend

- `cd frontend`
- `npm test`
- `npm run test:coverage`
- `npx tsc --noEmit`

## When to run fixtures

- After schema changes that require reference data.
- After migrations that affect seeded lookup tables.
- After backend changes that document a new operational baseline.

## Validation thresholds

- Backend coverage should satisfy the CI threshold.
- Frontend TypeScript must return zero errors.
- New UI should have tests for the affected screens, services, or helpers.

## Package checks

- Verify Expo Go compatibility before adding new frontend dependencies.
- Prefer `npx expo install` for Expo-managed packages.
