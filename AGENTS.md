## Règle de push

**Ne jamais push de code sans que l'utilisateur ait explicitement confirmé que le test local est OK.**
Workflow obligatoire : implémenter → tester en local → attendre "c'est ok, tu peux push" → push.
Ne pas pousser "en avance" même si le code semble correct.

## Style de communication

Dans les messages texte, utiliser **","** comme séparateur dans les listes inline, jamais le tiret **"-"**. Exemple : "prix 2800 FCFA, poids 350g" (pas "prix 2800 FCFA - poids 350g").

## IMPORTANT : Workflow de Développement

**AVANT toute tâche de développement, LIRE `WORKFLOW.md`** à la racine du projet.

**Instruction Codex :** Commence chaque session de développement en lisant `WORKFLOW.md` pour connaître la routine appropriée selon la tâche (feature backend/frontend, bug fix, package installation, review PR, pre-release).

## Principe de Cohérence Technique

Toujours suivre au minimum l'architecture, les conventions de code, les patterns métier, et le style d'implémentation déjà présents dans le projet. Avant d'introduire une nouvelle structure, un nouveau pattern, ou un refactoring, vérifier d'abord si un équivalent existe déjà dans la codebase et s'y aligner par défaut. En cas d'écart nécessaire, le justifier explicitement, limiter l'impact, et préserver la compatibilité avec l'existant.

## Project Overview

AquaCare est une application de gestion aquacole bilingue (français/anglais) conçue pour le Cameroun, destinée aux pisciculteurs, avec des fonctionnalités mobiles fonctionnant hors ligne en priorité.
Technologies utilisées : Django REST Framework (backend) + React Native/Expo (frontend).

## Essential Commands

### Backend
```bash
# Start full stack (PostgreSQL + Redis + Django + Celery + Nginx)
cd backend
docker-compose up -d

# Database operations
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py makemigrations

# Load initial data (CRITICAL after migrations)
docker-compose exec api python manage.py load_nutritional_data  
docker-compose exec api python manage.py load_products         
docker-compose exec api python manage.py setup_rbac

# Create superuser from environment variables
docker-compose exec api python manage.py create_superuser_from_env

# Linting (Ruff — also runs in CI on PRs)
docker-compose exec api ruff check backend/manage.py backend/apps backend/aquacare_api backend/tests

# Testing
docker-compose exec api pytest                                  
docker-compose exec api pytest apps/aquaculture/tests/          
docker-compose exec api pytest -k test_function_name           
docker-compose exec api pytest --cov=apps --cov-report=html     

# Logs and debugging
docker-compose logs -f api          
docker-compose logs -f celery_worker
docker-compose exec api python manage.py shell
docker-compose exec db psql -U aquacare_user -d aquacare_db
```

### Frontend
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


## AquaCare Design System

**Colors (ONLY these - never invent new greens):**
```typescript
// frontend/src/constants/colors.ts
GREEN_PRIMARY = '#059669';     // Buttons, headers, main actions
GREEN_LIGHT = '#10b981';       // Hover states, accents
GREEN_DARK = '#047857';        // Emphasis, active borders
WHITE     = '#ffffff';         // Cards, modals
CREAM     = '#f8fafc';         // App background
GRAY_DARK = '#1e293b';         // Primary text
GRAY_LIGHT = '#64748b';        // Secondary text, placeholders
ERROR     = '#dc2626';         // Errors, mortality > 40%
WARNING   = '#f59e0b';         // Warnings, FCR > 2.0
INFO      = '#0ea5e9';         // Tooltips, info messages
```

**Typography:**
```typescript
h1: { fontSize: 32, fontWeight: 'bold' }    h2: { fontSize: 24, fontWeight: 'bold' }
h3: { fontSize: 20, fontWeight: 'bold' }    h4: { fontSize: 18, fontWeight: '600' }
body: { fontSize: 16 }   small: { fontSize: 14 }   caption: { fontSize: 12, color: GRAY_LIGHT }
```

**Spacing & Radius:** Base 4px multiples (4, 8, 12, 16, 20, 24, 32). Cards/buttons: `borderRadius: 12`. Inputs: `borderRadius: 8`. Touch targets: minimum 44x44px.

**Shadows:**
```typescript
shadow_sm: { shadowOffset:{width:0,height:1}, shadowOpacity:0.1, shadowRadius:2, elevation:2 }   // cards
shadow_md: { shadowOffset:{width:0,height:2}, shadowOpacity:0.1, shadowRadius:3, elevation:3 }   // buttons
shadow_lg: { shadowOffset:{width:0,height:4}, shadowOpacity:0.15, shadowRadius:6, elevation:6 }  // modals
```

**Animations:** Always `useNativeDriver: true` for 60fps. Durations: 150ms (micro), 300ms (standard), 500ms (major).

**Icons:** `@expo/vector-icons/Ionicons`. Sizes: 20 (inline), 24 (standard), 32 (stat cards), 48 (empty states).

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
8. **Migrating prod without backup** → Always `dumpdata > backup_$(date +%Y%m%d).json` first

## Security Considerations

- JWT tokens: Access (15min) + Refresh (7 days)
- Stored in `expo-secure-store` (encrypted storage)
- Axios interceptor auto-refreshes on 401
- NEVER commit `.env` files
- Phone validation prevents injection attacks
- All API endpoints require authentication (except login/register)

## CI/CD Pipeline

**Branch strategy:**
| Branch | Target | Trigger |
|--------|--------|---------|
| `feature/*` | Local dev | Tests only (`pull-request-tests.yml`) |
| `develop` | **Staging** → api-staging.aquacare.tech | `deploy-staging.yml` on push |
| `main` | **Production** → api.aquacare.tech | `deploy.yml` on push |

**Flow:** `feature/* → develop (staging auto-deploy) → main (prod auto-deploy)`

**Environments:**
- Production API: `https://api.aquacare.tech/api`
- Staging API: `https://api-staging.aquacare.tech/api`
- Registry: `ghcr.io/{owner}/aquacare-api` (`:latest` for prod, `:staging` for staging)
- Health check: `curl https://api.aquacare.tech/api/health/`


## Post-Migration Checklist

After running migrations, ALWAYS execute:
```bash
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data
docker-compose exec api python manage.py load_products
docker-compose exec api python manage.py setup_rbac
```

## Branding Note

AquaCare is independent of AquaCare. Do not use "AquaCare" as owner/author in exports, PDFs, or UI. Use neutral "AquaCare" branding.

## Mise en Place Automatique (Branch Setup)

Avant toute implémentation, et sans attendre qu'on le demande :

```bash
git checkout develop
git pull origin develop
git checkout -b {prefix}/{nom-kebab-case}
```

| Préfixe | Usage |
|---------|-------|
| `feature/` | Nouvelle fonctionnalité |
| `fix/` | Correction de bug |
| `refactor/` | Refactoring sans changement fonctionnel |

**Ne jamais coder directement sur `main` ou `develop`.** Les hooks bloquent les éditions sur ces branches.


## Skills — Invocation Automatique par Type de Tâche

Invoquer les skills dans l'ordre indiqué, AVANT d'écrire le code correspondant :

| Type de tâche | Skills à invoquer (dans l'ordre) |
|---------------|----------------------------------|
| Écran / Composant RN | `bilingual-strings` → `react-native-best-practices` → `expo-go-check` (si nouveau package) → `code-review-aquacare` (en fin) |
| Modèle Django | `offline-first-models` → `django-orm-patterns` → `django-security` → `python-testing` |
| API / Vue DRF | `django-rest-framework` → `clean-ddd-hexagonal` → `django-security` → `python-testing` |
| Feature fullstack | Tous les skills backend D'ABORD, puis tous les skills frontend |
| Refactoring Python | `python-design-patterns` → `python-code-style` |
| Optimisation perf | `python-performance-optimization` |

**Pour toute librairie utilisée** : consulter context7 AVANT d'écrire le code. Ne pas se fier aux connaissances d'entraînement pour les APIs de librairies — elles changent.

# Context 7
This project integrates Context7 MCP (Model Context Protocol) as a central knowledge layer to enhance agent intelligence and ensure system-wide consistency. Agents must treat Context7 as the single source of truth for understanding the system’s architecture, business logic, conventions, and evolving state.
Before performing any task — especially when generating or modifying code, proposing architectural decisions, or introducing new patterns — agents are required to first consult Context7 to align with existing structures and avoid inconsistencies. No code, design, or structural change should be made without verifying its coherence with the current context.
Additionally, agents should proactively update and enrich Context7 whenever they introduce meaningful changes (e.g., new modules, patterns, or decisions), ensuring that the shared knowledge remains accurate, up-to-date, and continuously improves over time.
