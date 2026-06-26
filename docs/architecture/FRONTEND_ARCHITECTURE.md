# Frontend Architecture

## Source of truth

- `frontend/package.json`, current Expo and React Native versions.
- `frontend/src/config/environment.ts`, runtime API selection.
- `frontend/src/constants/colors.ts`, color tokens.
- `frontend/src/constants/typography.ts`, typography tokens.
- `frontend/src/i18n/locales/fr.ts`, `frontend/src/i18n/locales/en.ts`, UI copy.

## Structure

- `frontend/src/features/`, feature-owned screens, components, services, store slices, and local utilities.
- `frontend/src/services/`, shared API and offline services.
- `frontend/src/store/`, global Redux store.
- `frontend/src/navigation/`, app navigation graphs.
- `frontend/src/domain/`, pure frontend estimators and helpers that mirror but do not replace backend truth.

## Core rules

- The backend is the source of truth for business outcomes.
- Local computations are allowed only as temporary optimistic estimates for UX.
- Visible UI text must come from i18n, never hardcoded in components.
- Expo Go compatibility is required for any new dependency.
- TypeScript must stay clean, with `npx tsc --noEmit` returning zero errors.

## Feature flow

1. Add the screen or component inside the relevant feature folder.
2. Wire the Redux slice or local state only if the feature needs shared state.
3. Add translations in both languages.
4. Keep navigation types aligned with the screen.
5. Validate on device or simulator, then run TypeScript and tests.

## Design alignment

- Reuse the color, spacing, radius, shadow, and typography tokens already in the repo.
- Keep touch targets usable on small mobile screens.
- Provide loading, empty, and error states for data-driven screens.

## Further reading

- [Design system](../design/DESIGN_SYSTEM.md)
- [Offline sync model](./OFFLINE_SYNC.md)
- [`frontend/src/features/aquaculture/AQUACULTURE_MODULE.md`](../../frontend/src/features/aquaculture/AQUACULTURE_MODULE.md)
