# Architecture Overview

This is the canonical architecture index for AquaCare.

## Current stack

- Backend, Django REST Framework, PostgreSQL, Redis, Celery, Gunicorn.
- Frontend, React Native, Expo 56, TypeScript, Redux Toolkit.
- Authentication, JWT access and refresh tokens.
- Offline-first mobile workflows, UUID primary keys, `client_uuid` deduplication.

## Canonical references

- [Backend architecture](./BACKEND_ARCHITECTURE.md)
- [Frontend architecture](./FRONTEND_ARCHITECTURE.md)
- [Offline sync model](./OFFLINE_SYNC.md)
- [Deployment](./DEPLOYMENT.md)

## Where to add new work

- Backend feature, add a service, domain helper, serializer or view in the relevant app.
- Frontend feature, add a feature folder under `frontend/src/features/`.
- Offline behavior, update the sync model and the relevant queue or idempotency path.
- Deployment changes, update the compose files and the GitHub Actions workflow docs together.

## Architectural rules

- Views stay thin.
- Business logic lives in services and domain helpers.
- Frontend stays aligned with backend responses and does not become the source of truth for final calculations.
- UI strings go through i18n.
- Keep changes consistent with the existing module boundaries.
