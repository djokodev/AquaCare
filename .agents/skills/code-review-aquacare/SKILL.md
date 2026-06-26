---
name: code-review-aquacare
description: Apply AquaCare code review standards when reviewing code, suggesting improvements, finishing features, or when the user asks for feedback on implementation.
---

# Code Review Standards - AquaCare

## Required Checklist

### TypeScript (Frontend)

- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] No `any` types - use explicit types
- [ ] Optionals handled: `(value || default)` or `value ?? default`
- [ ] Props interfaces defined above components
- [ ] No TypeScript ignore comments without justification

### Translations (Bilingual FR/EN)

- [ ] No hardcoded text in components
- [ ] New keys added to `frontend/src/i18n/locales/fr.ts`
- [ ] New keys added to `frontend/src/i18n/locales/en.ts`
- [ ] Using `t('key')` pattern everywhere
- [ ] Keys are camelCase

### MAVECAM Colors

Only these colors allowed:

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Green | `#059669` | Buttons, headers |
| Light Green | `#10b981` | Accents |
| Dark Green | `#047857` | Emphasis |
| Cream | `#f8fafc` | Backgrounds |
| Red | `#dc2626` | Errors |

- [ ] Import from `constants/colors.ts`, no inline hex codes

### Code Quality

- [ ] No `console.log` statements (remove before commit)
- [ ] No commented-out code
- [ ] No `// TODO` without associated issue
- [ ] No unused imports or variables

### Backend Specific

- [ ] Phone validation: +237 format (9 digits after code)
- [ ] UUID as PK (never AutoField)
- [ ] Decimal for FCFA amounts (never float)
- [ ] Error messages use `gettext_lazy()`
- [ ] Services are transactional (`@transaction.atomic`)

### Offline-First

- [ ] Models with `client_uuid` if created offline
- [ ] Deduplication logic in serializer/service

## Verification Commands

```bash
# Frontend TypeScript check
cd frontend && npx tsc --noEmit

# Backend Django check
cd backend && python manage.py check

# Run tests
cd frontend && npm test
cd backend && pytest
```

## Common Issues to Flag

1. Hardcoded strings without translation
2. Missing null/undefined checks
3. Inline color hex codes
4. console.log left in code
5. Missing sync metadata on offline models
6. AutoField instead of UUIDField
