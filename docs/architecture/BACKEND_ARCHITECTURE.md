# Backend Architecture

## Source of truth

- Django project package, `backend/aquacare_api/`.
- Settings modules, `backend/aquacare_api/settings/{base,development,staging,production,test}.py`.
- URL entry point, `backend/aquacare_api/urls.py`.

## Structure

- `backend/apps/accounts/`, identity, profiles, registration, JWT, farm setup.
- `backend/apps/aquaculture/`, core production workflows, cycles, logs, reports, sync.
- `backend/apps/commerce/`, product catalogue, order flows, feeding-related commerce data.
- `backend/apps/chat/`, support and messaging.
- `backend/apps/notifications/`, notification delivery and push-related behavior.

## Layering

- Views handle HTTP concerns, authentication, permissions, and serializer handoff.
- Services hold orchestration, transactions, and use-case logic.
- Domain modules hold pure business rules and calculators.
- Models hold persistence concerns, UUID primary keys, and indexed query behavior.

## Important patterns

- UUID primary keys are mandatory for offline-first compatible models.
- `client_uuid` is used for idempotency and deduplication on offline-created records.
- Decimal values should be used for FCFA money values.
- Read models and summaries should prefer backend-computed values over frontend recomputation.
- Admin and API concerns should stay separated.

## Backend feature flow

1. Identify the owning app.
2. Add or update a service.
3. Add pure calculations or validators in domain code when needed.
4. Keep the view thin.
5. Add tests for the service and the API path.
6. Validate migrations and fixtures when schema or reference data changes.

## Testing expectations

- Fast unit tests for domain logic.
- Integration tests for service and API behavior.
- `pytest` coverage should stay above the repo threshold used in CI.

## Further reading

- [Offline sync model](./OFFLINE_SYNC.md)
- [Deployment](./DEPLOYMENT.md)
- [`backend/apps/accounts/README.md`](../../backend/apps/accounts/README.md)
- [`backend/apps/aquaculture/README.md`](../../backend/apps/aquaculture/README.md)
