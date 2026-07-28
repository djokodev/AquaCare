# Release

## Pre-release checklist

- Backend tests pass.
- Frontend tests pass.
- TypeScript passes with zero errors.
- Translations are complete in both languages.
- Offline-first rules are preserved.
- No secrets or private infrastructure details appear in docs or code.

## Deployment flow

1. Merge to the correct integration branch.
2. Confirm the target environment.
3. Validate the health endpoint after deployment.
4. Watch logs for the first rollout window.

## Safety rules

- Do not deploy unreviewed changes.
- Do not push from the assistant before the user has confirmed local validation is OK.
- Back up production data before schema changes.
- Recheck environment variables if a deployment uses a new setting.

## Environment mapping

- `develop`, staging.
- `main`, production.

## Notes

- Keep this doc aligned with the current GitHub Actions workflows and compose files.
- Use placeholders in documentation for anything sensitive.
