# Release

## Pre-release checklist

- Backend tests pass.
- Frontend tests pass.
- TypeScript passes with zero errors.
- Translations are complete in both languages.
- Offline-first rules are preserved.
- No secrets or private infrastructure details appear in docs or code.

## Production and store launch checklist (open items)

Items found during module-by-module prod preparation. Tick them before the
first production deployment and store submission.

### Deployment (server)

- [ ] GitHub secret `RESEND_API_KEY` exists before the production deploy.
- [ ] Domain `aquacare.tech` is verified in Resend (sender `AquaCare <no-reply@aquacare.tech>`).
- [ ] `https://api.aquacare.tech/static/brand/aquacare-logo.png` answers publicly
      (email logo, `EMAIL_LOGO_URL`); `collectstatic` ran in the container.
- [ ] DRF throttles see the real client IP behind Cloudflare (login, register,
      forgot password limits are per IP).
- [ ] Off-server PostgreSQL and media backups with a tested restore.

### Maps (iOS and Android)

- [ ] Android release build: create a Google Maps SDK for Android API key in
      Google Cloud, restricted to package `cm.mavecam.aquacare` and the Play
      signing SHA-1, then add it to `app.json` under the `react-native-maps`
      plugin (`androidGoogleMapsApiKey`). Without it the farm map is grey on
      Android release builds (Expo Go and iOS work without a key).
- [ ] iOS: nothing to configure, the farm map uses Apple Maps by default.
- [ ] Check the farm map, satellite toggle, Directions and Share buttons on a
      real iPhone and a real Android phone with a Cameroon location.

### Mobile build and stores

- [ ] Splash screen still uses the legacy blue `#2563eb`; switch to brand green.
- [ ] Google Play developer account: identity and phone verification unresolved,
      app `cm.mavecam.aquacare` was removed by Google.
- [ ] Store review demo account (phone login, no OTP).
- [ ] Privacy policy and account deletion URLs declared in both stores.

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
