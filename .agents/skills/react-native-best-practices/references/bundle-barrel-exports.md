---
title: Avoid Barrel Exports
impact: CRITICAL
tags: bundle, imports, barrel, tree-shaking
---

# Skill: Avoid Barrel Exports

Refactor barrel imports (index files) to reduce bundle size and improve startup time.

## Quick Pattern

**Incorrect:**

```tsx
import { Button } from './components';
// Loads ALL exports from components/index.ts
```

**Correct:**

```tsx
import Button from './components/Button';
// Loads only Button
```

## When to Use

- Bundle contains unused code from libraries
- Circular dependency warnings in Metro
- Hot Module Replacement (HMR) breaks frequently
- TTI is slow due to module evaluation

## What Are Barrel Exports?

```tsx
// components/index.ts (barrel file)
export { Button } from './Button';
export { Card } from './Card';
export { Modal } from './Modal';
export { Sidebar } from './Sidebar';

// Usage (barrel import)
import { Button } from './components';
```

## Problems with Barrel Imports

### 1. Bundle Size Overhead

Metro includes **all exports** even if you use one:

```tsx
// Only need Button, but entire barrel is bundled
import { Button } from './components';
// Card, Modal, Sidebar also included!
```

### 2. Runtime Overhead

All modules evaluate before returning your import:

```tsx
import { Button } from './components';
// JavaScript must evaluate:
// - Button.tsx
// - Card.tsx
// - Modal.tsx
// - Sidebar.tsx
// Even though you only use Button
```

### 3. Circular Dependencies

Barrel files make cycles easier to create accidentally:

```
Warning: Require cycle:
  components/index.ts -> Button.tsx -> utils/index.ts -> components/index.ts
```

Breaks HMR, causes unpredictable behavior.

## Solution 1: Direct Imports

Replace barrel imports with direct paths:

```tsx
// BEFORE: Barrel import
import { Button, Card } from './components';

// AFTER: Direct imports
import Button from './components/Button';
import Card from './components/Card';
```

### Enforce with ESLint

```bash
npm install -D eslint-plugin-no-barrel-files
```

```javascript
// eslint.config.js
import noBarrelFiles from 'eslint-plugin-no-barrel-files';

export default [
  {
    plugins: { 'no-barrel-files': noBarrelFiles },
    rules: {
      'no-barrel-files/no-barrel-files': 'error',
    },
  },
];
```

## Solution 2: Tree Shaking (Expo SDK 52+)

Enable tree shaking to automatically remove unused barrel exports.

```tsx
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

```bash
# .env
EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH=1
EXPO_UNSTABLE_TREE_SHAKING=1
```

## Real-World Example: date-fns

```tsx
// BAD: Imports entire library
import { format, addDays, isToday } from 'date-fns';

// GOOD: Direct imports
import format from 'date-fns/format';
import addDays from 'date-fns/addDays';
import isToday from 'date-fns/isToday';
```

## AquaCare Specific Patterns

### Constants

```tsx
// INCORRECT - Imports ALL constants
import { COLORS } from '@/constants';

// CORRECT - Direct import
import { COLORS } from '@/constants/colors';
```

### Features/Slices

```tsx
// INCORRECT
import { selectCycles } from '@/features/aquaculture';

// CORRECT
import { selectCycles } from '@/features/aquaculture/store/aquacultureSlice';
```

## Refactoring Strategy

### Step 1: Identify Barrel Files

Look for `index.ts` files with multiple exports:

```bash
grep -r "export \* from" frontend/src/
grep -r "export { .* } from" frontend/src/
```

### Step 2: Update Imports

```tsx
// Find all usages
// VS Code: Cmd+Shift+F for "from './components'"

// Replace each with direct import
import Button from './components/Button';
```

### Step 3: (Optional) Keep Barrel for External API

If your package is consumed by others:

```tsx
// Keep index.ts for package API
// components/index.ts
export { Button } from './Button';

// Internal code uses direct imports
// src/screens/Home.tsx
import Button from '../components/Button';
```

## Verification

After refactoring:

1. Run bundle analysis
2. Compare sizes before/after
3. Check for circular dependency warnings

## Common Pitfalls

- **Breaking external consumers**: If publishing a library, keep barrel for public API
- **IDE auto-imports**: Configure IDE to prefer direct imports
- **Inconsistent patterns**: Enforce with ESLint across team

## Related Skills

- [bundle-analyze-js.md](./bundle-analyze-js.md) - Verify impact
- [bundle-tree-shaking.md](./bundle-tree-shaking.md) - Automatic solution
