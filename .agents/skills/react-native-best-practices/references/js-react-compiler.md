---
title: React Compiler
impact: HIGH
tags: memoization, react-compiler, memo, useMemo, useCallback
---

# Skill: React Compiler

Set up React Compiler to automatically memoize components and eliminate unnecessary re-renders.

## Quick Pattern

**Before (manual memoization):**

```jsx
const MemoizedButton = memo(({ onPress }) => <Pressable onPress={onPress} />);
const handler = useCallback(() => doSomething(), []);
```

**After (automatic with React Compiler):**

```jsx
// No memo/useCallback needed - compiler handles it
const Button = ({ onPress }) => <Pressable onPress={onPress} />;
const handler = () => doSomething();
```

## When to Use

- Want automatic performance optimization without manual `memo`/`useMemo`/`useCallback`
- Codebase follows Rules of React
- Expo SDK 52+
- Ready to remove boilerplate memoization code

## Prerequisites

- React 17+ (React 19 recommended for best compatibility)
- Babel-based build system
- Code follows [Rules of React](https://react.dev/reference/rules)

## Step-by-Step Instructions

### Step 1: Check Compatibility

Before enabling the compiler, verify your project is compatible:

```bash
npx react-compiler-healthcheck@latest
```

This checks if your app follows the Rules of React and identifies potential issues.

### Step 2: Install React Compiler (Expo)

**SDK 54 and later** (simplified setup):

```bash
npx expo install babel-plugin-react-compiler
```

**SDK 52-53**:

```bash
npx expo install babel-plugin-react-compiler@beta react-compiler-runtime@beta
```

Then enable in your app config:

```json
// app.json
{
  "expo": {
    "experiments": {
      "reactCompiler": true
    }
  }
}
```

### Step 3: Set Up ESLint (Recommended)

The ESLint plugin helps identify code that can't be optimized and enforces the Rules of React.

```bash
npx expo lint  # Ensures ESLint is set up
npx expo install eslint-plugin-react-compiler -- -D
```

Configure ESLint:

```javascript
// .eslintrc.js
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const reactCompiler = require('eslint-plugin-react-compiler');

module.exports = defineConfig([
  expoConfig,
  reactCompiler.configs.recommended,
  {
    ignores: ['dist/*'],
  },
]);
```

### Step 4: Verify Optimizations

Open React DevTools. Optimized components show a `Memo ✨` badge.

## Incremental Adoption

### Strategy 1: Limit to Specific Directories

Configure the Babel plugin to only run on specific files:

```javascript
// babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          'react-compiler': {
            sources: (filename) => {
              return filename.includes('src/path/to/dir');
            },
          },
        },
      ],
    ],
  };
};
```

After changing `babel.config.js`, restart Metro with cache cleared:

```bash
npx expo start --clear
```

### Strategy 2: Opt Out Specific Components

Use the `"use no memo"` directive to skip optimization for specific components or files:

```jsx
function ProblematicComponent() {
  'use no memo';

  return <Text>Will not be optimized</Text>;
}
```

This is useful for temporarily opting out components that cause issues.

## AquaCare Application

### Components to Prioritize

1. **Dashboard Cards**: Multiple cards re-rendering on state changes
2. **Cycle List Items**: renderItem functions
3. **Form Components**: Input handlers

### Example Migration

```jsx
// BEFORE: Manual memoization
const CycleCard = memo(({ cycle, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(cycle.id);
  }, [cycle.id, onPress]);

  return (
    <Pressable onPress={handlePress}>
      <Text>{cycle.name}</Text>
    </Pressable>
  );
});

// AFTER: With React Compiler (no changes needed!)
const CycleCard = ({ cycle, onPress }) => {
  const handlePress = () => {
    onPress(cycle.id);
  };

  return (
    <Pressable onPress={handlePress}>
      <Text>{cycle.name}</Text>
    </Pressable>
  );
};
```

## What Gets Optimized

```jsx
// Components - auto-memoized
const Button = ({ onPress, label }) => (
  <Pressable onPress={onPress}>
    <Text>{label}</Text>
  </Pressable>
);

// Callbacks - auto-cached (no useCallback needed)
const handlePress = () => {
  console.log('pressed');
};

// Expensive computations - auto-cached (no useMemo needed)
const filtered = items.filter((item) => item.active);
```

## What Breaks Compilation

```jsx
// BAD: Mutating props
const BadComponent = ({ items }) => {
  items.push('new item'); // Mutation!
  return <List data={items} />;
};

// BAD: Mutating during render
const BadMutation = () => {
  const [items, setItems] = useState([]);
  items.push('new'); // Mutation during render!
  return <List data={items} />;
};

// BAD: Non-idempotent render
let counter = 0;
const BadRender = () => {
  counter++; // Side effect during render!
  return <Text>{counter}</Text>;
};
```

## Should You Remove Manual Memoization?

Yes, once the compiler is working correctly. You can remove instances of `useCallback`, `useMemo`, and `React.memo` in favor of automatic memoization.

**Note**: Class components will not be optimized. Migrate to function components for full benefits.

## Expected Performance Improvements

- Significant reduction in cascading re-renders
- Most impact on apps without existing manual optimization
- Already heavily optimized apps may see marginal gains

## Common Pitfalls

- **Not fixing ESLint errors first**: When ESLint reports an error, the compiler skips that component
- **Expecting it to fix bad patterns**: Compiler optimizes good code, doesn't fix bad code
- **Forgetting shallow comparison**: Like `memo`, compiler uses shallow comparison for objects/arrays
- **Not running healthcheck**: Always run `npx react-compiler-healthcheck@latest` before enabling

## Related Skills

- [js-profile-react.md](./js-profile-react.md) - Verify optimization impact
- [js-atomic-state.md](./js-atomic-state.md) - Alternative for state-related re-renders
