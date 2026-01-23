---
title: High-Performance Animations
impact: MEDIUM
tags: reanimated, animations, worklets, ui-thread
---

# Skill: High-Performance Animations

Use React Native Reanimated and InteractionManager for smooth 60+ FPS animations.

## Quick Pattern

**Incorrect (JS thread - blocks on heavy work):**

```jsx
const opacity = useRef(new Animated.Value(0)).current;
Animated.timing(opacity, { toValue: 1 }).start();
```

**Correct (UI thread - smooth even during JS work):**

```jsx
const opacity = useSharedValue(0);
const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
opacity.value = withTiming(1);
```

## When to Use

- Animations drop frames or feel janky
- UI freezes during animations
- Need gesture-driven animations
- Want animations to run during heavy JS work

## Prerequisites

- `react-native-reanimated` (included in Expo)

> **Expo Go Note**: Reanimated is pre-installed in Expo Go. No additional setup needed.

## Key Concepts

### Main Thread vs JS Thread

- **Main/UI Thread**: Handles native rendering (60+ FPS target)
- **JS Thread**: Runs React and your JavaScript

**Problem**: Heavy JS work blocks animations running on JS thread.

**Solution**: Run animations on UI thread with Reanimated worklets.

## Step-by-Step Instructions

### 1. Basic Animated Style (UI Thread)

```jsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming
} from 'react-native-reanimated';

const FadeInView = () => {
  const opacity = useSharedValue(0);

  // This runs on UI thread - won't be blocked by JS
  const animatedStyle = useAnimatedStyle(() => {
    return { opacity: opacity.value };
  });

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
  }, []);

  return <Animated.View style={[styles.box, animatedStyle]} />;
};
```

### 2. Animation with Callback

```jsx
const AnimatedButton = () => {
  const scale = useSharedValue(1);

  const handlePress = () => {
    scale.value = withTiming(
      1.2,
      { duration: 200 },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      }
    );
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.button, animatedStyle]}>
        <Text>Press Me</Text>
      </Animated.View>
    </Pressable>
  );
};
```

## InteractionManager for Heavy Work

Defer expensive JS work until animations complete:

```jsx
import { InteractionManager } from 'react-native';

const ScreenWithAnimation = () => {
  useEffect(() => {
    // Schedule after animations/interactions finish
    const task = InteractionManager.runAfterInteractions(() => {
      // Heavy computation here
      loadExpensiveData();
    });

    return () => task.cancel();
  }, []);

  return <AnimatedHeader />;
};
```

### With React Navigation

```jsx
import { useFocusEffect } from '@react-navigation/native';

const Screen = () => {
  useFocusEffect(
    useCallback(() => {
      // Wait for screen transition animation to complete
      const task = InteractionManager.runAfterInteractions(() => {
        fetchData();
        renderExpensiveComponent();
      });

      return () => task.cancel();
    }, [])
  );

  return <View>...</View>;
};
```

## AquaCare Application

### Dashboard Animations

```jsx
// Animate cycle stats cards on load
const DashboardCard = ({ value }) => {
  const translateY = useSharedValue(50);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(0, { duration: 300 });
    opacity.value = withTiming(1, { duration: 300 });
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Text>{value}</Text>
    </Animated.View>
  );
};
```

### Defer Data Load After Navigation

```jsx
const CycleDetailScreen = () => {
  const [isReady, setIsReady] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        // Load heavy cycle data after transition animation
        loadCycleDetails();
        setIsReady(true);
      });

      return () => task.cancel();
    }, [])
  );

  if (!isReady) return <LoadingSpinner />;

  return <CycleDetails />;
};
```

## When to Use What

| Thread | Best For |
|--------|----------|
| **UI Thread** (worklets) | Visual animations, transforms, gestures |
| **JS Thread** | State updates, data processing, API calls |

| Hook/API | Use Case |
|----------|----------|
| `useAnimatedStyle` | Animated styles (auto UI thread) |
| `runOnUI` | Manual UI thread execution |
| `runOnJS` | Call JS functions from worklets |
| `InteractionManager` | Defer heavy JS until animations complete |

## Common Pitfalls

- **Accessing React state in worklets**: Use `useSharedValue` instead of `useState` for animated values
- **Not using Animated components**: Must use `Animated.View`, `Animated.Text`, etc.
- **Heavy computation in useAnimatedStyle**: Keep worklets fast
- **Forgetting 'worklet' directive**: Required for inline worklet functions

```jsx
// BAD: Regular function in useAnimatedStyle
const style = useAnimatedStyle(() => {
  heavyComputation();  // Blocks UI thread!
  return { opacity: 1 };
});

// GOOD: Keep worklets fast
const style = useAnimatedStyle(() => {
  return { opacity: opacity.value };  // Just read value
});
```

## Related Skills

- [js-measure-fps.md](./js-measure-fps.md) - Verify animation frame rate
- [js-concurrent-react.md](./js-concurrent-react.md) - React-level deferral with useTransition
