---
name: expo-go-check
description: Verify package compatibility with Expo Go before suggesting or installing any npm package. Apply when recommending new dependencies, discussing libraries, or when the user asks about adding packages.
---

# Expo Go Compatibility Check - AquaCare

## Critical Constraint

AquaCare uses **Expo Go** (no dev build). Packages with native code are FORBIDDEN.

## Before Suggesting a Package

1. **Check on reactnative.directory**
   - Look for "Expo Go compatible" tag
   - URL: https://reactnative.directory/

2. **Check Expo documentation**
   - URL: https://docs.expo.dev/versions/latest/

3. **Prefer Expo alternatives**

| Native Package | Expo Alternative |
|----------------|------------------|
| react-native-camera | expo-camera |
| react-native-image-picker | expo-image-picker |
| react-native-maps | react-native-maps (Expo compatible) |
| react-native-fs | expo-file-system |
| react-native-async-storage | @react-native-async-storage/async-storage |
| react-native-svg | react-native-svg (Expo compatible) |
| react-native-gesture-handler | Already included in Expo |
| react-native-reanimated | Already included in Expo |

## Correct Installation

```bash
# CORRECT
cd frontend
npx expo install package-name

# FORBIDDEN for React Native packages
npm install react-native-xxx
```

## If Not Compatible

1. Inform user that the package is not Expo Go compatible
2. Propose a compatible alternative
3. If no alternative: document that it requires migration to EAS Build
4. NEVER silently install an incompatible package
