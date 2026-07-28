---
name: bilingual-strings
description: Ensure all UI text uses i18n translations in both French and English. Apply when writing React Native components, creating screens, adding user-facing text, or modifying UI elements.
---

# Bilingual Strings - AquaCare

## Absolute Rule
ALL user-visible text MUST use the i18n system.

## Required Pattern

```typescript
// FORBIDDEN
<Text>Statut juridique</Text>
<Button title="Valider" />

// REQUIRED
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();

<Text>{t('legalStatus')}</Text>
<Button title={t('validate')} />
```

## Files to Modify

When adding a new translation key:

1. **frontend/src/i18n/locales/fr.ts** - Add the key with French value
2. **frontend/src/i18n/locales/en.ts** - Add the SAME key with English value

Both files MUST be updated simultaneously.

## Naming Convention

- Keys in camelCase: `legalStatus`, `phoneNumber`, `submitButton`
- Group by feature if many: `aquaculture.cycleStatus`, `commerce.addToCart`

## Verification Checklist

Before finishing, verify:
- [ ] No hardcoded text in components
- [ ] Key exists in fr.ts
- [ ] Key exists in en.ts
- [ ] Values are consistent between both languages
