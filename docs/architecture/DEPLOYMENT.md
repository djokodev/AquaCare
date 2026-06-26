# Deployment

## Environments

- Local development, Docker Compose with the source tree.
- Staging, GitHub Actions plus the staging compose stack.
- Production, GitHub Actions plus the production compose stack.

## GitHub Actions

- `pull-request-tests.yml`, validation on pull requests into `develop`.
- `deploy-staging.yml`, staging deployment fallback workflow.
- `deploy.yml`, production deployment fallback workflow.

## Runtime files

- Local development may use a local-only `backend/docker-compose.yml` file when present.
- `backend/docker-compose.staging.yml`, staging stack.
- `backend/docker-compose.prod.yml`, production stack.

## Operational notes

- Keep deployment documentation aligned with the actual Django package name in the source tree.
- Avoid hardcoding secrets, tokens, DSNs, or machine-specific values in docs.
- Use placeholders such as `<server-ip>`, `<api-domain>`, and `<sentry-dsn>` when describing environment variables.
- Recheck the compose files after changing service names, ports, or the Django entrypoint module.

## Common URLs

- Local API, `http://127.0.0.1:8000/api/`
- Local admin, `http://127.0.0.1:8000/admin/`
- Staging API, `https://api-staging.aquacare.tech/api/`
- Production API, `https://api.aquacare.tech/api/`

## Release safety

- Run tests before deployment.
- Confirm migrations are intentional.
- Verify the health endpoint after rollout.
- Back up production data before any schema change or destructive migration.
