---
name: react-native-best-practices
description: Provides React Native performance optimization guidelines for FPS, TTI, bundle size, memory leaks, re-renders, and animations. Applies to tasks involving Hermes optimization, JS thread blocking, bridge overhead, FlashList, native modules, or debugging jank and frame drops.
license: MIT
metadata:
  author: Callstack
  source: https://github.com/callstackincubator/agent-skills
  tags: react-native, expo, performance, optimization, profiling
---

# React Native Best Practices

## Overview

Performance optimization guide for React Native applications, covering JavaScript/React, Native (iOS/Android), and bundling optimizations. Based on Callstack's "Ultimate Guide to React Native Optimization".

> **AquaCare Context**: This project uses Expo Go, so some native-specific optimizations may not apply. Focus on JS/React and Bundle optimizations.

## Skill Format

Each reference file follows a hybrid format for fast lookup and deep understanding:

- **Quick Pattern**: Incorrect/Correct code snippets for immediate pattern matching
- **Quick Command**: Shell commands for process/measurement skills
- **Quick Config**: Configuration snippets for setup-focused skills
- **Quick Reference**: Summary tables for conceptual skills
- **Deep Dive**: Full context with When to Use, Prerequisites, Step-by-Step, Common Pitfalls

**Impact ratings**: CRITICAL (fix immediately), HIGH (significant improvement), MEDIUM (worthwhile optimization)

## When to Apply

Reference these guidelines when:
- Debugging slow/janky UI or animations
- Investigating memory leaks (JS or native)
- Optimizing app startup time (TTI)
- Reducing bundle or app size
- Profiling React Native performance
- Reviewing React Native code for performance
- Working on lists (cycles, logs, products in AquaCare)

## Priority-Ordered Guidelines

| Priority | Category | Impact | Prefix |
|----------|----------|--------|--------|
| 1 | FPS & Re-renders | CRITICAL | `js-*` |
| 2 | Bundle Size | CRITICAL | `bundle-*` |
| 3 | TTI Optimization | HIGH | `native-*`, `bundle-*` |
| 4 | Memory Management | MEDIUM-HIGH | `js-*` |
| 5 | Animations | MEDIUM | `js-*` |

## Quick Reference

### Critical: FPS & Re-renders

**Profile first:**
```bash
# Open React Native DevTools
# Press 'j' in Metro, or shake device -> "Open DevTools"
```

**Common fixes:**
- Replace ScrollView with FlatList/FlashList for lists
- Use React Compiler for automatic memoization
- Use atomic state (Jotai/Zustand) to reduce re-renders
- Use `useDeferredValue` for expensive computations

### Critical: Bundle Size

**Analyze bundle:**
```bash
# For Expo projects
npx expo export --platform ios --dump-assetmap
npx expo export --platform android --dump-assetmap

# General analysis
npx react-native bundle \
  --entry-file index.js \
  --bundle-output output.js \
  --platform ios \
  --sourcemap-output output.js.map \
  --dev false --minify true

npx source-map-explorer output.js --no-border-checks
```

**Common fixes:**
- Avoid barrel imports (import directly from source)
- Remove unnecessary Intl polyfills (Hermes has native support)
- Enable tree shaking (Expo SDK 52+)

### High: TTI Optimization

**Common fixes:**
- Defer non-critical work with `InteractionManager`
- Lazy load screens with React.lazy()
- Pre-load critical data during splash screen

## References

Full documentation with code examples in `references/`:

### JavaScript/React (`js-*`)

| File | Impact | Description |
|------|--------|-------------|
| `js-lists-flatlist-flashlist.md` | CRITICAL | Replace ScrollView with virtualized lists |
| `js-profile-react.md` | MEDIUM | React DevTools profiling |
| `js-measure-fps.md` | HIGH | FPS monitoring and measurement |
| `js-memory-leaks.md` | MEDIUM | JS memory leak hunting |
| `js-atomic-state.md` | HIGH | Jotai/Zustand patterns |
| `js-concurrent-react.md` | HIGH | useDeferredValue, useTransition |
| `js-react-compiler.md` | HIGH | Automatic memoization |
| `js-animations-reanimated.md` | MEDIUM | Reanimated worklets |
| `js-uncontrolled-components.md` | HIGH | TextInput optimization |

### Bundling (`bundle-*`)

| File | Impact | Description |
|------|--------|-------------|
| `bundle-barrel-exports.md` | CRITICAL | Avoid barrel imports |
| `bundle-analyze-js.md` | CRITICAL | JS bundle visualization |
| `bundle-tree-shaking.md` | HIGH | Dead code elimination |
| `bundle-library-size.md` | MEDIUM | Evaluate dependencies |

## Problem -> Skill Mapping

| Problem | Start With |
|---------|------------|
| App feels slow/janky | `js-measure-fps.md` -> `js-profile-react.md` |
| Too many re-renders | `js-profile-react.md` -> `js-react-compiler.md` |
| Slow startup (TTI) | `bundle-analyze-js.md` |
| Large app size | `bundle-analyze-js.md` -> `bundle-barrel-exports.md` |
| Memory growing | `js-memory-leaks.md` |
| Animation drops frames | `js-animations-reanimated.md` |
| List scroll jank | `js-lists-flatlist-flashlist.md` |
| TextInput lag | `js-uncontrolled-components.md` |

## AquaCare-Specific Recommendations

### Lists to Optimize
- Production cycles list (dashboard)
- Daily logs history
- Product catalog
- Notifications list

### Key Patterns
```typescript
// INCORRECT - Re-renders entire list on state change
const [cycles, setCycles] = useState<Cycle[]>([]);
<ScrollView>
  {cycles.map(c => <CycleCard key={c.id} cycle={c} />)}
</ScrollView>

// CORRECT - Virtualized with FlashList
import { FlashList } from "@shopify/flash-list";
<FlashList
  data={cycles}
  renderItem={({ item }) => <CycleCard cycle={item} />}
  estimatedItemSize={100}
/>
```

### Barrel Export Issue
```typescript
// INCORRECT - Imports ALL constants even if unused
import { COLORS } from '@/constants';

// CORRECT - Direct import
import { COLORS } from '@/constants/colors';
```

## Attribution

Based on "The Ultimate Guide to React Native Optimization" by Callstack.
Source: https://github.com/callstackincubator/agent-skills
