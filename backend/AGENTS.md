# Backend Agent Instructions

These rules apply to everything under `backend/`.

## Core rules

- Follow the Django and DRF service-first architecture already used in the codebase.
- Keep views thin, move business logic into services and domain helpers.
- Use UUID primary keys for offline-first compatible models.
- Preserve `client_uuid` deduplication on records that can be created offline.
- Use pytest for backend tests.

## Conventions

- Read the app-level README when a module already has one.
- Keep permissions, throttles, and validation close to the owning API.
- Keep migrations safe and intentional.
- Do not commit secrets or environment values.

## Useful docs

- [Backend architecture](../docs/architecture/BACKEND_ARCHITECTURE.md)
- [Offline sync model](../docs/architecture/OFFLINE_SYNC.md)
- [Testing](../docs/workflows/TESTING.md)
