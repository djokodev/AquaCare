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
- [ ] Origin firewall accepts HTTP/HTTPS only from Cloudflare IP ranges:
      `common.client_ip` trusts `CF-Connecting-IP` from the nginx proxy, so a
      direct hit on the server IP must be impossible.
- [ ] Cloudflare SSL/TLS mode set to "Full (strict)" with an origin certificate,
      and "Always Use HTTPS" enabled (Django keeps SECURE_SSL_REDIRECT off).
- [ ] `PUBLIC_API_BASE_URL` matches the environment (defaults: prod
      `https://api.aquacare.tech`, staging `https://api-staging.aquacare.tech`).
- [ ] `API_DOCS_PUBLIC` stays false in staging/production (docs staff-only).
- [ ] Rebuild images after the Django 5.2 upgrade and generate one cycle report
      PDF and one order document PDF on staging (WeasyPrint 70).

### Maps (iOS and Android)

- [ ] Android release build: create a Google Maps SDK for Android API key in
      Google Cloud, restricted to package `cm.mavecam.aquacare` and the Play
      signing SHA-1, then add it to `app.json` under the `react-native-maps`
      plugin (`androidGoogleMapsApiKey`). Without it the farm map is grey on
      Android release builds (Expo Go and iOS work without a key).
- [ ] iOS: nothing to configure, the farm map uses Apple Maps by default.
- [ ] Check the farm map, satellite toggle, Directions and Share buttons on a
      real iPhone and a real Android phone with a Cameroon location.

### Notifications and feeding reminders

- [ ] Run `python manage.py migrate` (notifications `0004` purges retired
      notification types and drops email preference fields).
- [ ] Push credentials in EAS: FCM V1 service account key (Android) and APNs
      key (iOS). Without them no remote push reaches a store or dev build.
- [ ] Expo push security: on expo.dev enable "Enhanced push security" for
      the project, create an access token and set `EXPO_ACCESS_TOKEN` in the
      server `.env` (staging and prod). Without it, anyone holding a device
      push token can send notifications that look like AquaCare.
- [ ] Remote push cannot be tested with Expo Go on Android (removed since
      SDK 53): test order and support push on a dev build or TestFlight.
- [ ] Local dev build: after any change to `app.json` plugins (sound,
      entitlements, permissions), regenerate the native folders with
      `npx expo prebuild --clean` then rebuild (`npx expo run:ios --device`,
      `npx expo run:android`). Metro reload is not enough.
- [ ] The alarm sound `feeding_alarm.wav` and the iOS time-sensitive level
      only work on a dev build or store build (Expo Go plays the default sound).
      Check the Time Sensitive capability is enabled for `cm.mavecam.aquacare`
      in the Apple developer account.
- [ ] Android 14+: exact alarms need "Alarms and reminders" allowed for
      AquaCare, otherwise Android may deliver a reminder a few minutes late.
      Check on a real device; decide if an in-app shortcut is needed.
- [ ] Android "Ring in Do Not Disturb" needs AquaCare allowed in the phone's
      Do Not Disturb settings.
- [ ] On a real device: tap an order push opens the orders history, tap a
      support push opens the support chat, logout stops push on the device,
      a second account on the same phone receives only its own push.

### Mobile build and stores

- [ ] Remaining npm advisories (image-size via Metro, decode-uri-component via
      React Navigation) need breaking upgrades; re-run `npm audit --omit=dev`
      at the next Expo SDK upgrade.

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
