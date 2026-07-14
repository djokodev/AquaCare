# Design System

## Source of truth

Primitive values live once in `frontend/src/theme/tokens.json`. TypeScript imports
them through `frontend/src/theme/`; `frontend/tailwind.config.js` imports that same
JSON. `constants/colors.ts` and `constants/typography.ts` are compatibility facades
for existing screens and must not gain new values.

## Tokens

- Semantic colors: `brand`, `surface`, `text`, `border`, `status`, and `overlay`.
- Spacing: 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- Radii: `none`, `sm`, `md`, `lg`, `xl`, `xxl`, `full`.
- Touch controls: use `sizing.touchTargetMinimum` (44px) or larger.
- Shadows: use `shadows.small`, `medium`, or `large`, never copied shadow objects.
- Typography: use a token variant for shape and set color separately with `AppText`.

## Shared components

Use `@/components/ui` for new repeated UI: `AppText`, `Button`, `IconButton`,
`Card`, `SelectableCard`, `Badge`, `AppHeader`, `Screen`, `FormField`, `TextField`,
`SelectionModal`, and loading, empty, error, and alert states. NativeWind remains
appropriate for concise static layout; use `StyleSheet` for platform behaviour,
shadows, or genuinely dynamic values.

`AppHeader` owns safe-area padding for screens that draw their own header. Do not
render it in addition to a React Navigation header. Icon buttons require an
accessible label; selectable cards expose their selected and disabled state.

## Development gallery

`DesignSystemGallery` is registered only when `__DEV__` is true and is available
from Settings in development builds. It is deliberately absent from production
navigation and has no product workflow dependency.

## i18n and accessibility

Every visible string belongs in both locale dictionaries. Controls must have an
appropriate native role, label, state, and a minimum 44px touch area. Keep dynamic
font scaling enabled and do not rely only on color to communicate status.

## Do not do

- Do not add a hex color directly in a screen.
- Do not recreate a local button or header before checking `components/ui`.
- Do not hardcode visible text.
- Do not add an arbitrary spacing value before checking tokens.
- Do not use an icon-only button without an accessibility label.
- Do not create a selection modal before checking `SelectionModal`.

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
