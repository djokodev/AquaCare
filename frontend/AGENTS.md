# Frontend Agent Instructions

These rules apply to everything under `frontend/`.

## Core rules

- Use Expo-compatible dependencies only.
- Keep visible text in i18n, never hardcode UI copy.
- Treat the backend as the source of truth for final business results.
- Run `npx tsc --noEmit` after frontend changes.
- Keep tokens in SecureStore and other storage rules consistent with the existing app.

## Conventions

- Reuse the color and typography tokens already defined in the repo.
- Keep mobile touch targets large enough for real device use.
- Provide loading, empty, and error states for data screens.
- Keep feature code close to the owning feature folder.

## Useful docs

- [Frontend architecture](../docs/architecture/FRONTEND_ARCHITECTURE.md)
- [Design system](../docs/design/DESIGN_SYSTEM.md)
- [EAS build](../docs/workflows/EAS_BUILD.md)
