# EAS Build

## Source of truth

- `frontend/eas.json`.
- `frontend/src/config/environment.ts`.

## Current build profiles

- `development`, internal development client.
- `staging`, internal staging build.
- `testflight-staging`, iOS store distribution for staging.
- `play-internal-staging`, Android internal distribution for staging.
- `play-closed-staging`, Android closed testing for staging.
- `production`, store distribution for production.

## Operational rules

- Use EAS-managed environment variables, not committed secrets.
- Do not document raw DSNs or token values.
- Verify Expo Go compatibility before adding dependencies that could break builds.

## Typical commands

- `cd frontend`
- `eas build --profile staging --platform android`
- `eas build --profile production --platform all`
- `eas submit --platform ios`
- `eas submit --platform android`

## Environment selection

- Development builds should target the local backend.
- Staging builds should target the staging API.
- Production builds should target the production API.

## Validation

- Confirm the build profile matches the intended channel.
- Confirm the API URL is correct for the environment.
- Confirm any Sentry or release metadata comes from EAS config, not hardcoded docs.
