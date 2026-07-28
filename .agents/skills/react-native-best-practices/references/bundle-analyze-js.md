---
title: Analyze JS Bundle Size
impact: CRITICAL
tags: bundle, analysis, source-map-explorer, expo-atlas
---

# Skill: Analyze JS Bundle Size

Use source-map-explorer and Expo Atlas to visualize what's in your JavaScript bundle.

## Quick Command

```bash
# Expo
EXPO_UNSTABLE_ATLAS=true npx expo export --platform ios && npx expo-atlas
```

## When to Use

- JS bundle seems too large
- Want to identify heavy dependencies
- Investigating startup time issues
- Before/after optimization comparison

## Understanding Hermes Bytecode

Modern React Native uses Hermes bytecode, not raw JavaScript:
- Skips parsing at runtime
- Still benefits from smaller bundles
- Heavy imports still execute on startup

**Impact of bundle size:**
- Larger bytecode = longer download from store
- More imports on init path = slower TTI

## Method 1: source-map-explorer

### Generate Bundle with Source Map (Expo)

```bash
npx expo export --platform ios --source-maps --output-dir dist
# Bundle at: dist/ios/_expo/static/js/ios/*.js
# Source map at: dist/ios/_expo/static/js/ios/*.map
```

### Analyze

```bash
npx source-map-explorer dist/ios/_expo/static/js/ios/*.js --no-border-checks
```

**Note**: `--no-border-checks` needed due to Metro's non-standard source maps.

Opens browser with treemap visualization showing:
- **Hierarchy**: `node_modules/` → `react-native/` → `Libraries/` → individual files
- **Size**: Box area proportional to file size (KB shown in labels)

Click on any section to drill down into that directory.

## Method 2: Expo Atlas (Recommended for Expo)

More accurate for Expo projects.

### Enable and Export

```bash
# Start with Atlas enabled
EXPO_UNSTABLE_ATLAS=true npx expo start --no-dev

# Or export
EXPO_UNSTABLE_ATLAS=true npx expo export
```

Then launch UI:

```bash
npx expo-atlas
```

## What to Look For

### Red Flags

| Finding | Problem | Solution |
|---------|---------|----------|
| Entire library imported | Barrel exports | Use direct imports |
| Duplicate packages | Multiple versions | Dedupe in package.json |
| Dev dependencies in bundle | Incorrect imports | Check conditional imports |
| Large polyfills | Unnecessary for Hermes | Remove |
| Moment.js with locales | Bloated date library | Switch to date-fns or dayjs |

### Common Offenders

- **Lodash full import**: Use `lodash-es` or specific imports
- **Moment.js**: Replace with `date-fns` or `dayjs`
- **Intl polyfills**: Check Hermes support
- **AWS SDK**: Import specific services only

## AquaCare Analysis

### What to Check

1. **i18n libraries**: Are all locales bundled or just FR/EN?
2. **Chart libraries**: If using charts, check their size
3. **Date handling**: Use lightweight alternatives
4. **Redux middleware**: Check for unnecessary middleware

### Target Sizes

| Component | Target | Action if Exceeded |
|-----------|--------|-------------------|
| Total bundle | < 3 MB | Audit dependencies |
| Single library | < 100 KB | Find alternative |
| Utils/helpers | < 50 KB | Direct imports |

## Code Examples

### Identify Barrel Import Impact

```tsx
// BAD: Imports entire library through barrel
import { format } from 'date-fns';
// In bundle: All of date-fns loaded

// GOOD: Direct import
import format from 'date-fns/format';
// In bundle: Only format function
```

## Comparing Bundles

```bash
# Generate baseline
npx expo export --platform ios --source-maps --output-dir baseline

# Make changes, generate new bundle
npx expo export --platform ios --source-maps --output-dir current

# Compare manually in browser with source-map-explorer
```

## Quick Commands Summary

```bash
# Use Expo Atlas (recommended for Expo projects)
EXPO_UNSTABLE_ATLAS=true npx expo export --platform ios
npx expo-atlas

# Or use source-map-explorer
npx expo export --platform ios --source-maps --output-dir dist
npx source-map-explorer dist/ios/_expo/static/js/ios/*.js --no-border-checks
```

## Related Skills

- [bundle-barrel-exports.md](./bundle-barrel-exports.md) - Fix barrel import issues
- [bundle-tree-shaking.md](./bundle-tree-shaking.md) - Enable dead code elimination
- [bundle-library-size.md](./bundle-library-size.md) - Check library sizes before adding
