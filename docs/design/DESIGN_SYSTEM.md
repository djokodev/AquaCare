# Design System

## Source of truth

- `frontend/src/constants/colors.ts`
- `frontend/src/constants/typography.ts`

## Design principles

- Keep the interface simple, readable, and usable on low-connectivity mobile devices.
- Use established tokens instead of inventing new ones.
- Prefer consistent spacing and predictable hierarchy over decorative variation.
- Keep UI text in i18n, not in hardcoded component strings.

## Color tokens

The current color set in `colors.ts` is the reference point for the app.

- Brand greens, `GREEN_PRIMARY`, `GREEN_LIGHT`, `GREEN_DARK`.
- Neutrals, `WHITE`, `CREAM`, `GRAY_DARK`, `GRAY_LIGHT`.
- Semantic colors, `BLUE`, `SUCCESS`, `WARNING`, `ERROR`, `INFO`.

## Typography tokens

Use the existing typography scale in `typography.ts`.

- `h1`, `h2`, `h3`, `h4`.
- `body`, `bodyStrong`.
- `small`, `smallStrong`.
- `caption`.
- `button`, `buttonSmall`.

## Spacing and radius

- Prefer multiples of 4 for spacing.
- Cards and primary controls should generally use a 12px radius.
- Inputs should generally use an 8px radius.
- Keep touch targets at or above 44x44px.

## Shadows and elevation

- Use subtle shadows for cards.
- Use stronger shadows sparingly for overlays and dialogs.
- Keep elevation values consistent across comparable components.

## UI states

- Every data screen should consider loading, empty, error, and success states.
- Forms should show inline validation feedback when possible.
- Long operations should show progress or a clear pending state.

## Accessibility

- Maintain readable contrast.
- Keep controls large enough for touch.
- Avoid color-only meaning when a label or icon can clarify the state.

## Anti-patterns

- Hardcoded visible text.
- New ad hoc color tokens without updating the design source of truth.
- Inconsistent spacing or radius values inside the same feature.
- Final business calculations in the frontend.

## Examples

- Primary action, use the brand green token.
- Standard card, use white background, the shared radius, and a subtle shadow.
- Input, use a neutral background or border, not a custom one-off style.
