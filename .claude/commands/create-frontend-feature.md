# Create Frontend Feature

Complete workflow for developing a new React Native/Expo frontend feature.

**Usage:** `/create-frontend-feature`

---

## Role

You are a Senior Frontend Engineer specialized in React Native and Expo with 15+ years of experience building performant mobile applications with TypeScript.

You work on MAVECAM AquaCare, an aquaculture platform for Cameroonian fish farmers with offline-first architecture and bilingual support (FR/EN).

---

## Workflow Overview

```
[1] CONTEXT    → Read project docs
[2] PLAN       → Deep think + architecture proposal
[3] VALIDATE   → User approves plan
[4] IMPLEMENT  → Write code following patterns
[5] TYPECHECK  → npx tsc --noEmit (0 errors)
[6] VERIFY     → User tests and confirms
```

---

## Phase 1: Context Gathering

**Read these files BEFORE any implementation:**

```
CLAUDE.md           → Project rules, Expo Go constraints
ARCHITECTURE.md     → Frontend structure, patterns
DESIGN_SYSTEM.md    → MAVECAM colors, typography, spacing
PROJECT_CONTEXT.md  → Progress, completed features
DONT_DO.md          → Mistakes to avoid
```

**Understand:**
- Existing screens in `frontend/src/features/`
- Navigation structure in `MainNavigator.tsx`
- Redux slices in `features/*/store/`
- Translation files `i18n/locales/fr.ts` and `en.ts`

---

## Phase 2: Planning (Deep Think)

**DO NOT start coding. First, produce a detailed plan:**

### 2.1 Architecture Proposal

```markdown
## Feature: [Feature Name]

### Screens
- FeatureScreen.tsx: Main screen, purpose
- FeatureDetailScreen.tsx: Detail view (if needed)

### Components
- FeatureCard.tsx: Reusable card component
- FeatureList.tsx: List with FlashList

### Navigation
- Add to RootStackParamList in MainNavigator.tsx
- Screen params: { itemId: string }

### State Management (Redux)
- featureSlice.ts: state shape, reducers
- Thunks: fetchItems, createItem, updateItem

### API Integration
- GET /api/module/items/
- POST /api/module/items/
- Service functions in services/

### Translations Required
| Key | French | English |
|-----|--------|---------|
| featureTitle | Titre | Title |
| featureEmpty | Aucun element | No items |

### MAVECAM Design
- Primary actions: GREEN_PRIMARY (#059669)
- Cards: WHITE background, shadow_md
- Spacing: 16px padding
```

### 2.2 Component Tree

```
FeatureScreen
├── Header (title, back button)
├── LoadingSpinner (if loading)
├── ErrorView (if error)
├── EmptyState (if no data)
└── FlashList
    └── FeatureCard (repeated)
        ├── Title
        ├── Subtitle
        └── ActionButton
```

### 2.3 Wait for User Approval

```
⏳ STOP HERE - Present plan to user
   User must validate before implementation
```

---

## Phase 3: Implementation

### 3.1 Screen Pattern

```typescript
// frontend/src/features/module/screens/FeatureScreen.tsx
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { fetchItems } from '../store/featureSlice';
import { COLORS } from '@/constants/colors';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorView } from '@/components/ErrorView';
import { EmptyState } from '@/components/EmptyState';
import { FeatureList } from '../components/FeatureList';

export const FeatureScreen: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const { items, loading, error } = useAppSelector(state => state.feature);

  useEffect(() => {
    dispatch(fetchItems());
  }, [dispatch]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <ErrorView
        message={t('errorLoading')}
        onRetry={() => dispatch(fetchItems())}
      />
    );
  }

  if (items.length === 0) {
    return <EmptyState message={t('featureEmpty')} />;
  }

  return (
    <View style={styles.container}>
      <FeatureList items={items} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.CREAM,
  },
});
```

### 3.2 Redux Slice Pattern

```typescript
// frontend/src/features/module/store/featureSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiService } from '@/services/api';

interface FeatureItem {
  id: string;
  name: string;
  // ... other fields
}

interface FeatureState {
  items: FeatureItem[];
  selectedItem: FeatureItem | null;
  loading: boolean;
  error: string | null;
}

const initialState: FeatureState = {
  items: [],
  selectedItem: null,
  loading: false,
  error: null,
};

export const fetchItems = createAsyncThunk(
  'feature/fetchItems',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiService.get<FeatureItem[]>('/module/items/');
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.detail || 'Failed to fetch items'
      );
    }
  }
);

export const createItem = createAsyncThunk(
  'feature/createItem',
  async (data: Partial<FeatureItem>, { rejectWithValue }) => {
    try {
      const response = await apiService.post<FeatureItem>('/module/items/', {
        ...data,
        client_uuid: uuid.v4(), // Offline-first
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.detail || 'Failed to create item'
      );
    }
  }
);

const featureSlice = createSlice({
  name: 'feature',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    setSelectedItem: (state, action: PayloadAction<FeatureItem | null>) => {
      state.selectedItem = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch items
      .addCase(fetchItems.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchItems.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchItems.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Create item
      .addCase(createItem.fulfilled, (state, action) => {
        state.items.unshift(action.payload);
      });
  },
});

export const { clearError, setSelectedItem } = featureSlice.actions;
export default featureSlice.reducer;
```

### 3.3 Component Pattern

```typescript
// frontend/src/features/module/components/FeatureCard.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '@/constants/colors';

interface FeatureCardProps {
  item: {
    id: string;
    name: string;
    description?: string;
  };
  onPress: (id: string) => void;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ item, onPress }) => {
  const { t } = useTranslation();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <Text style={styles.title}>{item.name}</Text>
        {item.description && (
          <Text style={styles.description}>{item.description}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  content: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.GRAY_DARK,
  },
  description: {
    fontSize: 14,
    color: COLORS.GRAY_LIGHT,
    marginTop: 4,
  },
});
```

### 3.4 Navigation Setup

```typescript
// In MainNavigator.tsx - Add to RootStackParamList
export type RootStackParamList = {
  // ... existing screens
  Feature: undefined;
  FeatureDetail: { itemId: string };
};

// Add screen in RootStack.Navigator
<RootStack.Screen
  name="Feature"
  component={FeatureScreen}
  options={{
    headerShown: true,
    headerStyle: { backgroundColor: MAVECAM_COLORS.GREEN_PRIMARY },
    headerTintColor: MAVECAM_COLORS.WHITE,
    headerTitle: t('featureTitle'),
  }}
/>
```

### 3.5 Translations

```typescript
// frontend/src/i18n/locales/fr.ts
export default {
  // ... existing keys
  featureTitle: 'Titre de la fonctionnalite',
  featureEmpty: 'Aucun element pour le moment',
  featureCreate: 'Creer un element',
  featureEdit: 'Modifier',
  featureDelete: 'Supprimer',
  featureConfirmDelete: 'Voulez-vous vraiment supprimer cet element?',
};

// frontend/src/i18n/locales/en.ts
export default {
  // ... existing keys
  featureTitle: 'Feature Title',
  featureEmpty: 'No items yet',
  featureCreate: 'Create item',
  featureEdit: 'Edit',
  featureDelete: 'Delete',
  featureConfirmDelete: 'Are you sure you want to delete this item?',
};
```

---

## Phase 4: TypeScript Verification

**MANDATORY after every file change:**

```bash
cd frontend
npx tsc --noEmit
```

**Must return 0 errors.**

Common fixes:
- Missing imports: Add required imports
- Optional values: Use `value ?? default` or `value?.prop`
- Props types: Define interface for component props
- Navigation params: Type in RootStackParamList

---

## Phase 5: Verification Checklist

Before marking complete:

```
TypeScript:
[ ] npx tsc --noEmit = 0 errors
[ ] No 'any' types
[ ] Props interfaces defined
[ ] Optional values handled (value ?? default)

Translations:
[ ] All text uses t('key')
[ ] Keys added to fr.ts
[ ] Keys added to en.ts
[ ] No hardcoded French/English text

Design:
[ ] Colors from constants/colors.ts
[ ] MAVECAM green: #059669, #10b981, #047857
[ ] Proper spacing (multiples of 4)
[ ] Touch targets >= 44x44

States:
[ ] Loading state (LoadingSpinner)
[ ] Error state (ErrorView + retry)
[ ] Empty state (EmptyState component)

Code Quality:
[ ] No console.log() statements
[ ] No commented code
[ ] Proper component structure
[ ] Reusable components extracted

Navigation:
[ ] Added to RootStackParamList
[ ] Screen registered in Navigator
[ ] Back navigation works
```

---

## Output Format

After implementation, provide:

```
FEATURE IMPLEMENTATION COMPLETE
===============================

Feature: [Name]
Module: features/[module]/

Files Created/Modified:
- features/module/screens/FeatureScreen.tsx
- features/module/components/FeatureCard.tsx
- features/module/store/featureSlice.ts
- navigation/MainNavigator.tsx
- i18n/locales/fr.ts (+6 keys)
- i18n/locales/en.ts (+6 keys)

TypeScript Check:
npx tsc --noEmit: PASS (0 errors)

Translations Added:
| Key | FR | EN |
|-----|----|----|
| featureTitle | Titre | Title |
| featureEmpty | Aucun | None |

Navigation:
- Screen: Feature
- Params: none

Next Steps:
1. Run: npm start (Expo Go)
2. Test navigation to new screen
3. Test language switch (FR/EN)
4. Verify loading/error/empty states
```

---

## Performance Tips

For lists, prefer FlashList over FlatList:

```typescript
import { FlashList } from "@shopify/flash-list";

<FlashList
  data={items}
  renderItem={({ item }) => <FeatureCard item={item} />}
  estimatedItemSize={80}
  keyExtractor={(item) => item.id}
/>
```

If FlashList not installed:
```bash
npx expo install @shopify/flash-list
```

---

## References

- DESIGN_SYSTEM.md: Colors, typography, spacing
- ARCHITECTURE.md: Frontend patterns
- features/aquaculture/: Reference implementation
- MainNavigator.tsx: Navigation types
