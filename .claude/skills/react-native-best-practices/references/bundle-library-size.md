---
title: Determine Library Size
impact: MEDIUM
tags: dependencies, bundlephobia, library-size
---

# Skill: Determine Library Size

Evaluate third-party library size impact before adding to your project.

## Quick Command

```bash
# Check size before installing
# Visit: https://bundlephobia.com/package/[package-name]

# Or use CLI
npx bundle-phobia-cli <package-name>
```

## When to Use

- Evaluating new dependencies
- Comparing alternative libraries
- Auditing existing dependencies
- Investigating bundle bloat

## Tools Overview

| Tool | Type | Best For |
|------|------|----------|
| bundlephobia.com | Web | Quick size check |
| pkg-size.dev | Web | Backup/alternative |
| Import Cost (VS Code) | IDE extension | Real-time feedback |

## bundlephobia.com

### Usage

Visit [bundlephobia.com](https://bundlephobia.com) and enter package name.

### Shows

- **Minified size**: Raw JS size
- **Minified + Gzipped**: Network transfer size
- **Download time**: Estimated on various connections
- **Dependencies**: What else gets pulled in
- **Composition**: Breakdown by dependency

### Example Analysis

```
react-native-paper
├── Minified: 312 kB
├── Gzipped: 78 kB
└── Dependencies: 12 packages
```

## Import Cost (VS Code Extension)

### Install

Search "Import Cost" in VS Code extensions or:

```bash
code --install-extension wix.vscode-import-cost
```

### Usage

Shows inline size next to imports:

```tsx
import React from 'react';           // 6.5K (gzipped)
import { View, Text } from 'react-native';  // 0B (native)
import lodash from 'lodash';         // 71.5K (gzipped: 24.7K)
import get from 'lodash/get';        // 8K (gzipped: 2.9K)
```

## AquaCare Dependency Audit

### Libraries to Check

| Library | Expected Size | Alternative if Too Large |
|---------|---------------|-------------------------|
| i18next | ~40 KB | Check if all features needed |
| redux-toolkit | ~35 KB | Zustand (~2 KB) for simple state |
| axios | ~14 KB | fetch API (0 KB) |
| date-fns | ~75 KB (full) | Direct imports or dayjs (~3 KB) |

### Before Adding New Dependencies

1. Check on bundlephobia first
2. Compare with alternatives
3. Consider if native JS can do it

## Comparison Workflow

### Before Adding Dependency

1. Check on bundlephobia:
   ```
   https://bundlephobia.com/package/[package-name]
   ```

2. Compare alternatives:
   ```
   moment (289 kB) vs date-fns (75 kB) vs dayjs (6 kB)
   ```

3. Check what you actually need:
   - Full library import vs specific functions
   - Native alternative available?

## Size Guidelines

| Size (gzipped) | Assessment | Action |
|----------------|------------|--------|
| < 5 KB | Small | Generally fine |
| 5-20 KB | Medium | Evaluate necessity |
| 20-50 KB | Large | Look for alternatives |
| > 50 KB | Very large | Strong justification needed |

## Common Large Dependencies

| Library | Size (gzipped) | Alternative |
|---------|----------------|-------------|
| moment | ~70 KB | dayjs (~3 KB) |
| lodash (full) | ~25 KB | lodash-es + direct imports |
| aws-sdk (full) | 200+ KB | @aws-sdk/client-* |
| crypto-js | ~15 KB | react-native-quick-crypto |

## Code Example: Optimizing Imports

```tsx
// BAD: Full library (71.5 KB)
import _ from 'lodash';
_.get(obj, 'path.to.value');

// BETTER: Specific import (8 KB)
import get from 'lodash/get';
get(obj, 'path.to.value');

// BEST: Native JS (0 KB)
obj?.path?.to?.value;
```

## Quick Size Check Script

```bash
# Check size before installing
npx bundle-phobia-cli <package-name>
```

## Decision Matrix

| Factor | Keep JS Library | Use Native Alternative |
|--------|-----------------|------------------------|
| Size | > 50 KB | < 50 KB |
| Platform coverage | Both platforms | Single platform OK |
| Performance | Not critical | Critical path |
| Functionality | Simple | Complex computation |

## Related Skills

- [bundle-analyze-js.md](./bundle-analyze-js.md) - Verify actual bundle impact
- [bundle-barrel-exports.md](./bundle-barrel-exports.md) - Optimize how you import
