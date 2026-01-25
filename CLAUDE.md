# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚀 IMPORTANT : Workflow de Développement

**AVANT toute tâche de développement, LIRE `WORKFLOW.md`** à la racine du projet.

Ce fichier contient :
- **Routine 10 étapes** : De la feature jusqu'au merge (feature → branch → implement → test → commit → PR → review → merge)
- **Cheatsheet** : 8 custom commands, 5 agents, 6 skills, 5 MCP servers
- **Checklists qualité** : Pre-commit, pre-PR, pre-release
- **Troubleshooting guidé** : Debug API errors, frontend crashes, offline sync, i18n
- **Commandes Docker/npm** : Référence complète copiable

**Instruction Claude Code :** Commence chaque session de développement en lisant `WORKFLOW.md` pour connaître la routine appropriée selon la tâche (feature backend/frontend, bug fix, package installation, review PR, pre-release).

---

## Project Overview

AquaCare is a bilingual (French/English) aquaculture management application for Cameroon, targeting fish farmers with offline-first mobile capabilities. Stack: Django REST Framework (backend) + React Native/Expo (frontend).

## Essential Commands

### Backend (Docker)
```bash
# Start full stack (PostgreSQL + Redis + Django + Celery + Nginx)
cd backend
docker-compose up -d

# Database operations
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py makemigrations

# Load initial data (CRITICAL after migrations)
docker-compose exec api python manage.py load_nutritional_data  # 8 MAVECAM guides
docker-compose exec api python manage.py load_products           # 22 products catalog
docker-compose exec api python manage.py setup_rbac              # Admin roles/permissions

# Create superuser from environment variables
docker-compose exec api python manage.py create_superuser_from_env

# Testing
docker-compose exec api pytest                                   # Run all tests
docker-compose exec api pytest apps/aquaculture/tests/          # Specific module
docker-compose exec api pytest -k test_function_name            # Single test
docker-compose exec api pytest --cov=apps --cov-report=html     # Coverage report

# Logs and debugging
docker-compose logs -f api          # Watch Django logs
docker-compose logs -f celery_worker
docker-compose exec api python manage.py shell
docker-compose exec db psql -U aquacare_user -d aquacare_db
```

### Frontend (Expo)
```bash
cd frontend
npm start                    # Start Expo Go (auto-detects backend IP)
npm start -- --clear         # Clear cache (required after .env or config changes)

# TypeScript validation (MANDATORY after any code changes)
npx tsc --noEmit             # MUST show 0 errors before committing

# Testing
npm test                     # Run Jest tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

## Critical Architecture Patterns

### Offline-First with UUID Primary Keys

**ALL database models use UUID** (not auto-increment integers) to enable offline-first operation:

```python
# Django models
id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
client_uuid = models.UUIDField(unique=True, null=True, blank=True)  # For deduplication
```

**Why:** Fish farmers in rural Cameroon often have intermittent 2G connectivity. UUID allows:
- Mobile app generates UUIDs locally
- Backend deduplicates via `client_uuid` (unique constraint)
- If UUID exists → return existing record instead of error

### Backend Architecture: Views → Services → Domain

```
HTTP Request
    ↓
views.py          # Thin layer: auth, serializer validation only
    ↓
services/         # Business logic, transactions, orchestration
    ↓
domain/           # Pure Python calculators/validators (no Django dependencies)
    ↓
models.py         # ORM persistence
```

**Pattern for new features:**
1. Create service in `apps/{module}/services/`
2. Add calculations to `domain/calculators.py` or `domain/validators.py`
3. Views delegate to services (no business logic in views)
4. Write domain tests (fast, no DB) + integration tests (with DB)

### Frontend Architecture: Backend is Source of Truth

Frontend NEVER performs definitive business calculations. Pattern:

```typescript
// 1. Optimistic UI (temporary estimation for UX)
const estimatedValue = biomassKg * 1800;  // Show immediately

// 2. Submit to backend
const response = await api.post('/cycles/harvest/', data);

// 3. Replace with backend calculations
dispatch(updateCycleValue(response.data.final_value));  // Backend is truth
```

**Rule:** All FCR, biomass, ROI, feed calculations happen backend-only. Frontend displays results.

## Bilingual Translations (MANDATORY)

Application MUST be 100% bilingual French/English. **NEVER hardcode text in components.**

```typescript
// ❌ WRONG - Will fail review
<Text>Statut juridique</Text>

// ✅ CORRECT - Always use i18next
<Text>{t('legalStatus')}</Text>
```

**Process for new strings:**
1. Add key to `frontend/src/i18n/locales/fr.ts`
2. Add same key to `frontend/src/i18n/locales/en.ts`
3. Use `t('key')` in components

**Verification:** Run `/i18n-validator` agent to check completeness.

## Cameroon-Specific Constraints

### Phone Numbers (Primary Identifier)
- Format: `+237` + 9 digits (e.g., `+237652000000`)
- Phone replaces email as login identifier (90% mobile penetration vs 30% email)
- Validation: `accounts/validators.py` - `validate_cameroon_phone_number()`

### Geography Constants
- 10 regions, departments, arrondissements in `constants/cameroon.ts`
- Timezone: `Africa/Douala` (UTC+1)

### Business Constants
```typescript
// frontend/src/constants/aquaculture.ts
FISH_PRICE_PER_KG = 1800;      // FCFA
FEED_PRICE_PER_KG = 1250;      // FCFA
FCR_BASELINE = 1.3;             // Without AquaCare
FCR_TARGET = 0.7;               // With AquaCare optimization
```

## MAVECAM Design System

**Colors (ONLY these - never invent new greens):**
```typescript
// frontend/src/constants/colors.ts
GREEN_PRIMARY = '#059669';     // Buttons, headers, main actions
GREEN_LIGHT = '#10b981';       // Hover states, accents
GREEN_DARK = '#047857';        // Emphasis, active borders
CREAM = '#f8fafc';             // App background
ERROR = '#dc2626';             // Errors, high mortality alerts
WARNING = '#f59e0b';           // Warnings, FCR > 2.0
```

**Typography & Spacing:**
- Base spacing: multiples of 4px (4, 8, 12, 16, 20, 24, 32)
- Border radius: 12px (cards/buttons), 8px (inputs)
- Touch targets: minimum 44x44px (Apple HIG)

## Expo Go Compatibility (CRITICAL)

**App uses Expo Go** (not custom dev build). This means:
- ❌ **NO packages with native code** (react-native-camera, react-native-maps, etc.)
- ✅ **ONLY `expo-*` packages or pure JavaScript packages**

**Before installing ANY package:**
1. Check https://reactnative.directory/ for "Expo Go" tag
2. Use `npx expo install {package}` (never `npm install` for RN packages)
3. Or run `/check-package {package-name}` command

## TypeScript Requirements

**Zero tolerance for TypeScript errors.** After ANY code change:

```bash
cd frontend
npx tsc --noEmit   # MUST show 0 errors
```

**Defensive coding for optionals:**
```typescript
// ❌ WRONG - crashes if undefined
if (farmProfile.total_area_m2 > 0)

// ✅ CORRECT - safe
if ((farmProfile.total_area_m2 || 0) > 0)
```

## Testing Requirements

### Backend (pytest)
```bash
# All tests require @pytest.mark.django_db decorator
@pytest.mark.django_db
def test_create_cycle():
    user = User.objects.create_user(phone_number="+237652000000", password="test123")
    # ...
```

**Coverage:** Minimum 50% required. Current config in `pytest.ini`:
- Parallel execution: `-n auto`
- Coverage reports: `--cov=apps --cov-report=term-missing`

**Common gotchas:**
- Read `models.py` BEFORE writing tests (field names must match exactly)
- Include ALL required fields (check `null=False` in model)
- Use exact enum values (e.g., `species="tilapia"` not `"fish"`)

### Frontend (Jest)
```bash
npm test                    # All tests
npm run test:coverage       # With coverage
```

## Key Django Models

**Core entities:**
- `User` (accounts): Phone-based auth, JWT tokens
- `FarmProfile` (accounts): Farm details, location, legal status
- `ProductionCycle` (aquaculture): 60-180 day cycles, central entity
- `CycleLog` (aquaculture): Daily logs with `client_uuid` for offline
- `FeedingPlan` (aquaculture): Auto-generated weekly feeding schedules
- `NutritionalGuide` (aquaculture): 8 MAVECAM guides (fixtures)
- `Product` (commerce): Feed catalog (22 products from fixtures)
- `Order` (commerce): Cart + order management

**Sync metadata fields:**
```python
created_offline = models.BooleanField(default=False)
synced_at = models.DateTimeField(null=True, blank=True)
client_uuid = models.UUIDField(unique=True, null=True, blank=True)
```

## Redux State Management

**5 main slices:**
```
frontend/src/features/{domain}/store/{domain}Slice.ts

1. auth         - Login, registration, JWT management
2. aquaculture  - Cycles, logs, feeding plans, stats
3. commerce     - Products, cart, orders
4. notifications - Alerts, filtering
5. chat         - Support messaging
```

**Async operations use createAsyncThunk:**
```typescript
export const fetchCycles = createAsyncThunk(
  'aquaculture/fetchCycles',
  async (_, { rejectWithValue }) => {
    const response = await api.get('/cycles/');
    return response.data;
  }
);
```

## Environment Auto-Detection

```typescript
// frontend/src/config/environment.ts
if (__DEV__) {
  // Expo Go → http://{local-ip}:8000/api (auto-detected)
} else {
  // Production → http://77.237.241.223/api
}
```

**No manual configuration needed.** Backend IP auto-detected in development.

## Navigation Types

```typescript
// frontend/src/navigation/MainNavigator.tsx
export type RootStackParamList = {
  MainTabs: undefined;
  DailyLog: undefined;
  ProductDetail: { productId: string };  // With params
  // ...
};

// Usage in screens
import { NativeStackScreenProps } from '@react-navigation/native-stack';
type Props = NativeStackScreenProps<RootStackParamList, 'ProductDetail'>;
```

## Docker Stack (Development)

Services in `docker-compose.yml`:
- `db` - PostgreSQL 15 (port 5432)
- `api` - Django + Gunicorn (port 8000)
- `redis` - Cache + Celery broker (port 6379)
- `celery_worker` - Async task processing
- `celery_beat` - Scheduled tasks (cron-like)
- `nginx` - Static/media files + reverse proxy (port 80)

## Common Gotchas (DO NOT REPEAT)

1. **Missing fixtures after migration** → Run `load_nutritional_data` + `load_products`
2. **`git status -uall`** → NEVER use `-uall` flag (crashes on large repos)
3. **Hardcoded text** → Always use `t('key')` translations
4. **Console.log in production** → Remove all debug logs before commit
5. **Native packages in Expo Go** → Will crash, check compatibility first
6. **TypeScript errors ignored** → Must run `npx tsc --noEmit` and fix ALL errors
7. **Decimal for money** → Use `models.DecimalField` for FCFA amounts (not Float)

## Security Considerations

- JWT tokens: Access (15min) + Refresh (7 days)
- Stored in `expo-secure-store` (encrypted storage)
- Axios interceptor auto-refreshes on 401
- NEVER commit `.env` files
- Phone validation prevents injection attacks
- All API endpoints require authentication (except login/register)

## CI/CD Pipeline

**GitHub Actions workflows:**
```
.github/workflows/
├── pull-request-tests.yml  # Run pytest on PR to main
└── deploy.yml              # Build + Push to ghcr.io + Deploy on push to main
```

**Production:**
- API: http://77.237.241.223/api
- Registry: ghcr.io/{owner}/aquacare-api
- Nginx serves `/static/` and `/media/`, proxies to Django

## Custom Commands & Skills

**Available commands** (see `.claude/commands/README.md` for details):
- `/check-package <name>` - Verify Expo Go compatibility before installing
- `/create-backend-feature` - Scaffold new Django feature with tests
- `/create-frontend-feature` - Scaffold new React Native screen with Redux
- `/fix-bug` - Systematic bug diagnosis and fixing workflow
- `/review-pr` - Code review following AquaCare standards
- `/db-debug` - Query PostgreSQL database for debugging
- `/update-changelog` - Document changes in PROJECT_CONTEXT.md
- `/pre-release` - Comprehensive validation before production deploy

**Auto-applied skills:**
- `bilingual-strings` - Enforces i18n translations for all UI text
- `commit-conventions` - AquaCare commit message format
- `code-review-aquacare` - Code review standards
- `expo-go-check` - Package compatibility verification
- `offline-first-models` - UUID + sync metadata patterns

## File Structure

```
AquaCare/
├── backend/
│   ├── apps/
│   │   ├── accounts/          # Auth, users, farm profiles
│   │   ├── aquaculture/       # Cycles, logs, feeding (core business logic)
│   │   ├── commerce/          # Products, orders, cart
│   │   ├── notifications/     # Alerts system
│   │   └── chat/              # Support messaging
│   ├── mavecam_api/
│   │   ├── settings/          # base.py, development.py, production.py, test.py
│   │   └── urls.py
│   ├── docker-compose.yml     # Development stack
│   ├── pytest.ini             # Test configuration
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── features/          # Feature-sliced design
    │   ├── navigation/        # React Navigation
    │   ├── store/             # Redux Toolkit
    │   ├── services/          # API clients (axios)
    │   ├── i18n/locales/      # fr.ts, en.ts
    │   ├── constants/         # colors.ts, aquaculture.ts, cameroon.ts
    │   └── types/             # TypeScript interfaces
    ├── package.json
    ├── tsconfig.json
    └── app.json               # Expo configuration
```

## Post-Migration Checklist

After running migrations, ALWAYS execute:
```bash
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data
docker-compose exec api python manage.py load_products
docker-compose exec api python manage.py setup_rbac
```

## Branding Note

AquaCare is independent of MAVECAM. Do not use "MAVECAM" as owner/author in exports, PDFs, or UI. Use neutral "AquaCare" branding.
