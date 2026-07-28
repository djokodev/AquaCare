---
title: Tree Shaking
impact: HIGH
tags: bundle, tree-shaking, dead-code, metro
---

# Skill: Tree Shaking

Enable dead code elimination to remove unused exports from your JavaScript bundle.

## Quick Config

```bash
# .env (Expo SDK 52+)
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

```javascript
// metro.config.js
config.transformer.getTransformOptions = async () => ({
  transform: { experimentalImportSupport: true },
});
```

## When to Use

- Bundle includes unused library code
- Want automatic barrel export optimization
- Using Expo SDK 52+

## Platform Support

| Bundler | Tree Shaking | Notes |
|---------|--------------|-------|
| Metro | Partial | Use config below |
| Expo (SDK 52+) | Experimental | Requires config |

## Setup: Expo SDK 52+

### 1. Enable Import Support

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
  },
});

module.exports = config;
```

### 2. Enable Tree Shaking

Create/edit `.env`:

```bash
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

**Note**: Only applies in production builds.

## Platform Shaking

Code inside `Platform.OS` and `Platform.select` checks is removed for other platforms:

```tsx
// IMPORTANT: import Platform directly from 'react-native'
import { Platform } from 'react-native';

if (Platform.OS === 'ios') {
  // Removed from Android bundle
}

if (Platform.select({ ios: true, android: false }) === 'ios') {
  // Removed from Android bundle
}
```

**Critical**: Must use direct import. This does NOT work:

```tsx
import * as RN from 'react-native';
if (RN.Platform.OS === 'ios') {
  // NOT removed - optimization fails
}
```

## AquaCare Application

### Enable Tree Shaking

1. Update `metro.config.js`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
  },
});

module.exports = config;
```

2. Add to `.env`:

```bash
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

### Expected Impact

- 5-15% smaller Hermes bytecode
- Automatic removal of unused exports
- Faster startup time

## Requirements for Tree Shaking

### ESM Imports Required

```tsx
// Tree shakeable
import { foo } from './module';

// NOT tree shakeable
const { foo } = require('./module');
```

### Side Effects Declaration

Libraries must declare side-effect-free in `package.json`:

```json
{
  "sideEffects": false
}
```

Or specify files with side effects:

```json
{
  "sideEffects": ["*.css", "./src/polyfills.js"]
}
```

## Verification

1. Build production bundle (see [bundle-analyze-js.md](./bundle-analyze-js.md))
2. Analyze with source-map-explorer
3. Search for functions you know are unused
4. If found → tree shaking not working

### Test Example

```tsx
// test-treeshake.js
export const usedFunction = () => 'used';
export const unusedFunction = () => 'unused'; // Should be removed

// app.js
import { usedFunction } from './test-treeshake';
```

After building, search bundle for `unusedFunction`. Should not exist.

## Common Pitfalls

- **Not using production build**: Tree shaking only in prod
- **CommonJS modules**: Need ESM for full effectiveness
- **Side effects not declared**: Library may not be shakeable
- **Dynamic imports**: `require(variable)` prevents analysis

## Related Skills

- [bundle-analyze-js.md](./bundle-analyze-js.md) - Verify tree shaking effect
- [bundle-barrel-exports.md](./bundle-barrel-exports.md) - Manual alternative
