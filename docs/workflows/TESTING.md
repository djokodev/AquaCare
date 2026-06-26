# Testing

## Backend

From the repository root:

If a local-only `backend/docker-compose.yml` exists in your environment:

- `docker compose -f backend/docker-compose.yml up -d`
- `docker compose -f backend/docker-compose.yml exec api python manage.py migrate`
- `docker compose -f backend/docker-compose.yml exec api pytest`
- `docker compose -f backend/docker-compose.yml exec api pytest backend/apps/aquaculture/tests/`

For CI-aligned host validation from the repository root:

- `ruff check backend/manage.py backend/apps backend/aquacare_api backend/tests`

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
