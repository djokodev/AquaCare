# WORKFLOW.md

Guide opérationnel pour développer AquaCare avec Claude Code

---

## 🎯 But de ce Document

Ce fichier documente **comment utiliser la configuration Claude Code existante** pour développer AquaCare efficacement. Il contient des checklists copiables, des commandes prêtes à l'emploi, et une routine de développement claire.

**Philosophie :** Claude Code n'est pas juste un assistant IA, c'est un coéquipier qui connaît l'architecture AquaCare, applique les patterns offline-first, valide les traductions FR/EN, et génère du code production-ready. Ce workflow vous montre comment collaborer avec Claude Code pour scaler le développement solo.

---

## 📋 Pré-requis (Setup Initial)

### Installation de Base

```bash
# 1. Docker Desktop (backend stack)
# Télécharger depuis https://www.docker.com/products/docker-desktop

# 2. Node.js 18+ (frontend)
node --version  # Vérifier version

# 3. Expo CLI
npm install -g expo-cli
expo --version

# 4. gh CLI (optionnel, recommandé pour PRs)
# Télécharger depuis https://cli.github.com/
gh auth login
```

### Variables d'Environnement

```bash
# Backend : créer backend/.env (jamais commiter !)
cp backend/.env.example backend/.env
# Éditer avec vos valeurs locales

# Frontend : créer frontend/.env (jamais commiter !)
cat > frontend/.env <<'EOF'
EXPO_PUBLIC_API_URL=http://77.237.241.223/api
EOF
```

### Démarrage Stack Locale

```bash
# 1. Backend (PostgreSQL + Redis + Django + Celery)
cd backend
docker-compose up -d

# 2. Migrations + Data Loading (CRITICAL)
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data  # 8 guides MAVECAM
docker-compose exec api python manage.py load_products           # 22 produits
docker-compose exec api python manage.py setup_rbac              # Rôles admin

# 3. Créer superuser (admin Django)
docker-compose exec api python manage.py create_superuser_from_env

# 4. Frontend
cd ../frontend
npm install
npm start
```

### Vérification

```bash
# Backend : http://localhost:8000/api/
curl http://localhost:8000/api/health/  # Doit retourner 200

# Frontend : Scanner QR code avec Expo Go app
# L'app doit se connecter au backend (auto-détecte IP locale)

# Admin Django : http://localhost:8000/admin/
# Login avec superuser créé à l'étape précédente
```

---

## ⚡ Cheatsheet : Commandes & Agents Rapides

### Custom Commands (8)

| Command | Quand l'utiliser | Phases |
|---------|------------------|--------|
| `/create-backend-feature` | Nouvelle API, model, service Django | 5 phases (Context → Plan → Approval → Impl → Testing) |
| `/create-frontend-feature` | Nouvel écran, composant, Redux | 6 phases (Context → Plan → Approval → Impl → TS Check → Verification) |
| `/fix-bug` | Erreur API/UI, crash, data inconsistency | 6 phases (Understand → Diagnose → Plan → Implement → Verify → Document) |
| `/check-package` | Avant d'installer un package npm/pip | Vérifie Expo Go compatibility |
| `/db-debug` | Investiguer données PostgreSQL | Query SQL interactif |
| `/review-pr` | Reviewer une PR avant merge | Analyse fichiers, applique checklists (TS, i18n, sécurité) |
| `/update-changelog` | Documenter feature/fix complétée | Met à jour PROJECT_CONTEXT.md |
| `/pre-release` | Avant déploiement production | 7 phases de validation (Quality → i18n → Security → Packages → Offline → Docs → Final) |

### Agents (5)

| Agent | Rôle | Trigger |
|-------|------|---------|
| `i18n-validator` | Vérifier traductions FR/EN complètes | Auto dans /pre-release ou manuel |
| `security-reviewer` | Scanner vulnérabilités (injection, XSS, OWASP) | Auto dans /pre-release |
| `test-runner` | Lancer tests + coverage backend/frontend | Auto dans /pre-release |
| `offline-sync-checker` | Valider UUID PK + client_uuid patterns | Auto dans /pre-release |
| `expo-compatibility` | Vérifier packages Expo Go sans native code | Auto dans /pre-release ou avec /check-package |

### Skills (Auto-appliqués - 6)

| Skill | Quand il s'applique |
|-------|---------------------|
| `bilingual-strings` | Écriture composants React Native → Force usage de `t('key')` |
| `code-review-aquacare` | Code review, suggestions d'amélioration |
| `commit-conventions` | Création de commits → Format `type(scope): description` |
| `expo-go-check` | Recommandation de packages → Bloque si native code |
| `offline-first-models` | Création/modif models Django → Force UUID PK + client_uuid |
| `react-native-best-practices` | Optimisation performance RN, listes, animations (14 références) |

### MCP Servers (5)

| MCP Server | Usage | Exemples |
|------------|-------|----------|
| `postgres-mcp` | Query PostgreSQL avancé | `SELECT * FROM accounts_user WHERE phone_number = '+237...'` |
| `context7` | Lookup documentation officielle | "Comment utiliser Django signals?" |
| `greptile` | Code understanding, PR analysis | Lister PRs, analyser commentaires review |
| `github` | Opérations GitHub avancées | Créer PRs, merger, search code |
| `playwright` | Browser automation | Tester admin web (peu utilisé pour mobile-first) |

### Commandes Docker Essentielles

```bash
# Démarrer stack
docker-compose up -d

# Migrations + data (TOUJOURS après migrate)
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data
docker-compose exec api python manage.py load_products
docker-compose exec api python manage.py setup_rbac

# Logs
docker-compose logs -f api
docker-compose logs -f celery_worker

# Tests
docker-compose exec api pytest --cov=apps

# Shell Django
docker-compose exec api python manage.py shell

# Shell PostgreSQL
docker-compose exec db psql -U aquacare_user -d aquacare_db

# Rebuild après Dockerfile change
docker-compose up -d --build api

# Arrêter tout
docker-compose down
```

### Commandes npm Essentielles

```bash
# Démarrer Expo Go (auto-détecte backend IP)
npm start

# Clear cache (requis après modif .env)
npm start -- --clear

# Tests
npm test
npm run test:watch
npm run test:coverage

# TypeScript check (OBLIGATOIRE avant commit)
npx tsc --noEmit  # DOIT afficher 0 erreurs

# Installer package (TOUJOURS via expo install)
npx expo install {package-name}
# JAMAIS npm install pour packages React Native
```

---

## 🔄 Routine de Développement (10 Étapes)

### Étape 1 : Choisir une Feature

**Identifier la prochaine feature :**
- Backlog dans PROJECT_CONTEXT.md
- Issues GitHub étiquetées `enhancement` ou `bug`

**Créer une branche dédiée :**
```bash
git checkout -b feature/{nom-feature}
# Exemples :
# - feature/biomass-calculator
# - fix/offline-sync-crash
# - refactor/admin-jazzmin-ui
```

### Étape 2 : Concevoir (Spécification Rapide)

**Définir acceptance criteria (3-5 bullet points) :**
```markdown
## Acceptance Criteria
- [ ] User can calculate biomass from count + average weight
- [ ] Calculation stored in domain/calculators/biomass.py
- [ ] API endpoint POST /api/cycles/{id}/calculate-biomass/
- [ ] Tests coverage >50%
- [ ] Translations FR + EN for error messages
```

**Identifier modules impactés :**
- Backend only → `/create-backend-feature`
- Frontend only → `/create-frontend-feature`
- Both → Run both commands séquentiellement

**Décider quel command utiliser :**
- Feature = `/create-backend-feature` ou `/create-frontend-feature`
- Bug = `/fix-bug`
- Package new = `/check-package` avant installation

### Étape 3 : Implémenter

#### Si Backend

```bash
# Lancer le command
/create-backend-feature

# Workflow 5 phases :
# Phase 1: Context Gathering
#   - Lit CLAUDE.md, ARCHITECTURE.md, PROJECT_CONTEXT.md
#   - Identifie patterns existants (services, domain, serializers)

# Phase 2: Plan
#   - Architecture : models.py, services/, domain/calculators.py
#   - Patterns appliqués : UUID PK, client_uuid, offline-first
#   - Files impactés : apps/{module}/models.py, services/, tests/

# Phase 3: Approval
#   - Claude présente le plan
#   - User approuve ou demande modifications

# Phase 4: Implementation
#   - Crée models avec UUID PK
#   - Services pour business logic
#   - Serializers pour API
#   - Admin Jazzmin configuration
#   - Migrations

# Phase 5: Testing
#   - Génère tests pytest avec @pytest.mark.django_db
#   - Vérifie coverage >50%
#   - Tests intégration + unit tests domain
```

**Patterns automatiquement appliqués :**
- UUID comme PK : `id = models.UUIDField(primary_key=True, default=uuid.uuid4)`
- Client UUID pour deduplication : `client_uuid = models.UUIDField(unique=True, null=True)`
- Sync metadata : `created_offline`, `synced_at`
- Services layer : Business logic dans `apps/{module}/services/`
- Domain calculators : Pure Python dans `domain/calculators/`

#### Si Frontend

```bash
# Lancer le command
/create-frontend-feature

# Workflow 6 phases :
# Phase 1: Context Gathering
#   - Lit DESIGN_SYSTEM.md, MAVECAM colors, spacing rules
#   - Identifie composants existants réutilisables

# Phase 2: Plan
#   - Composants à créer (screens, components)
#   - Redux slice (state, actions, thunks)
#   - Navigation (stack params, routing)
#   - Translations (keys FR + EN)

# Phase 3: Approval
#   - Claude présente le plan UI/UX
#   - User approuve ou demande ajustements

# Phase 4: Implementation
#   - Crée screen dans src/features/{domain}/screens/
#   - Composants dans src/features/{domain}/components/
#   - Redux slice dans src/features/{domain}/store/
#   - Ajoute navigation params
#   - MAVECAM colors uniquement (GREEN_PRIMARY, GREEN_LIGHT, etc.)
#   - Translations i18n (t('key'))

# Phase 5: TypeScript Check
#   - Run npx tsc --noEmit
#   - Corrige toutes les erreurs TS (0 erreurs requis)

# Phase 6: Verification
#   - Test dans Expo Go sur device
#   - Vérifie responsive (différentes tailles écran)
#   - Vérifie traductions FR/EN switch
```

**Patterns automatiquement appliqués :**
- i18n : `t('key')` pour tout texte UI
- MAVECAM colors : `#059669`, `#10b981`, `#047857` (jamais hex custom)
- Spacing : multiples de 4px (4, 8, 12, 16, 20, 24, 32)
- Border radius : 12px (cards/buttons), 8px (inputs)
- Touch targets : minimum 44x44px
- Defensive coding : `(value || default)` pour optionals

#### Si Bug Fix

```bash
/fix-bug

# Workflow 6 phases :
# Phase 1: Understand Bug
#   - Repro steps
#   - Logs d'erreur (backend/frontend)
#   - Context : user flow, données impactées

# Phase 2: Diagnose Root Cause
#   - Lit code source
#   - Vérifie DB (peut utiliser /db-debug)
#   - Identifie ligne ou pattern problématique

# Phase 3: Plan Fix
#   - Solution proposée
#   - Risk assessment (impact autres features)
#   - Files à modifier

# Phase 4: Implement Fix + Test
#   - Applique fix
#   - Ajoute test de non-régression
#   - Vérifie que fix résout le bug

# Phase 5: Verify Resolution
#   - Test manual avec repro steps
#   - Run tests automatisés
#   - Vérifie pas d'effets de bord

# Phase 6: Document
#   - Si bug significatif, update DONT_DO.md
#   - Commit message détaillé avec root cause
```

### Étape 4 : Tester

#### Backend

```bash
cd backend

# Tests d'un module spécifique
docker-compose exec api pytest apps/aquaculture/tests/ -v

# Tests avec coverage
docker-compose exec api pytest --cov=apps --cov-report=html

# Vérifier coverage report
# Ouvrir backend/htmlcov/index.html dans navigateur
# Vérifier >50% requis (CI blocker si <50%)

# Test d'une fonction spécifique
docker-compose exec api pytest -k test_biomass_calculation

# Tests en parallèle (plus rapide)
docker-compose exec api pytest -n auto
```

**Checklist Backend :**
- [ ] Tous les tests passent (`pytest` retourne 0 failed)
- [ ] Coverage >50% (vérifié dans htmlcov/index.html)
- [ ] Pas de warnings pytest non résolus
- [ ] Migrations appliquées (`migrate` run)
- [ ] Fixtures chargées si nécessaire (`load_*` commands)

#### Frontend

```bash
cd frontend

# Lancer tous les tests
npm test

# Watch mode (re-run auto sur changements)
npm run test:watch

# Coverage report
npm run test:coverage
# Vérifier coverage/index.html

# Test d'un fichier spécifique
npm test -- src/features/aquaculture/utils/calculations.test.ts
```

**Checklist Frontend :**
- [ ] Tous les tests passent
- [ ] Coverage >95% pour utils critiques (calculations, validators)
- [ ] Pas de console warnings dans tests
- [ ] Snapshots mis à jour si UI modifiée (`npm test -- -u`)

#### TypeScript (OBLIGATOIRE)

```bash
cd frontend
npx tsc --noEmit

# DOIT afficher :
# ✓ Compiled successfully!
# 0 errors

# Si erreurs TypeScript → BLOCKER
# Corriger TOUTES les erreurs avant commit
```

**Erreurs TS communes :**
```typescript
// ❌ ERREUR : Property 'total_area_m2' may be undefined
if (farmProfile.total_area_m2 > 0)

// ✅ FIX : Defensive coding
if ((farmProfile.total_area_m2 || 0) > 0)

// ❌ ERREUR : Argument of type 'string | undefined' is not assignable
navigation.navigate('ProductDetail', { productId: product.id })

// ✅ FIX : Type guard
if (product.id) {
  navigation.navigate('ProductDetail', { productId: product.id })
}
```

### Étape 5 : Vérifier Qualité

**Checklist Manuelle** (pas de linting auto configuré) :

#### Code Quality
- [ ] Pas de `console.log()` oublié
- [ ] Pas de code commenté non nettoyé
- [ ] Pas de `TODO` sans issue GitHub associée
- [ ] Pas de variables non utilisées
- [ ] Pas de duplications évidentes (DRY principle)

#### Traductions (i18n)
- [ ] Toutes les nouvelles UI strings dans `fr.ts` **ET** `en.ts`
- [ ] Jamais de texte hardcodé (`<Text>Login</Text>` ❌)
- [ ] Utilise `t('key')` partout
- [ ] Keys i18n cohérentes (camelCase, namespace par feature)

#### Design System
- [ ] MAVECAM colors uniquement (#059669, #10b981, #047857)
- [ ] Pas de hex custom ou colors inventées
- [ ] Spacing multiples de 4px
- [ ] Border radius 12px (cards) ou 8px (inputs)
- [ ] Touch targets ≥44x44px

#### Backend Patterns
- [ ] UUID comme PK sur nouveaux models
- [ ] `client_uuid` pour entities offline-sync
- [ ] Business logic dans services/ (pas dans views.py)
- [ ] Calculations dans domain/ (pure Python)
- [ ] Defensive coding pour optionals (`|| default`)

#### Si Nouveau Package Installé

```bash
# AVANT commit, vérifier Expo Go compatibility
/check-package {nom-package}

# Exemples :
/check-package react-native-camera  # ❌ Native code → Bloqué
/check-package expo-camera          # ✅ Expo package → OK
/check-package date-fns             # ✅ Pure JS → OK
```

### Étape 6 : Commit

#### Format de Commit

```bash
# 1. Stager fichiers spécifiques (éviter git add .)
git add apps/aquaculture/services/biomass.py
git add apps/aquaculture/domain/calculators/biomass.py
git add apps/aquaculture/tests/test_biomass.py

# 2. Vérifier pas de secrets
git status
# Vérifier que .env, credentials, keys ne sont PAS stagés

# 3. Commit avec convention
git commit -m "feat(aquaculture): add biomass calculator service

- Created domain/calculators/biomass.py for pure calculation logic
- Added service method calculate_biomass() in services/aquaculture.py
- Added endpoint POST /api/cycles/{id}/calculate-biomass/
- Tests coverage: 87% (15 tests added)
- Translations: FR + EN for error messages

Closes #42

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

#### Types de Commit

| Type | Usage | Exemples |
|------|-------|----------|
| `feat` | Nouvelle feature | `feat(aquaculture): add biomass calculator` |
| `fix` | Bug fix | `fix(auth): prevent duplicate JWT refresh` |
| `refactor` | Refactoring sans changement de comportement | `refactor(admin): clean Jazzmin CSS architecture` |
| `docs` | Documentation | `docs(readme): add Expo Go setup instructions` |
| `test` | Ajout/modif tests | `test(commerce): add product catalog tests` |
| `chore` | Maintenance (deps, config) | `chore(deps): update Django to 4.2.8` |
| `perf` | Performance | `perf(ui): replace ScrollView with FlashList` |
| `style` | Formatting (PEP8, Prettier) | `style(accounts): fix indentation in models.py` |

#### Scopes

| Scope | Module |
|-------|--------|
| `auth` | Authentication, JWT, login/register |
| `aquaculture` | Cycles, logs, feeding, biomass |
| `commerce` | Products, orders, cart |
| `admin` | Jazzmin, admin config |
| `i18n` | Translations FR/EN |
| `offline` | Sync, client_uuid, offline-first |
| `ui` | UI components, design system |
| `api` | API endpoints, serializers |

### Étape 7 : Push

```bash
# Push vers origin
git push origin feature/{nom-feature}

# Si première fois (set upstream)
git push -u origin feature/{nom-feature}

# Vérifier push success
git status
# Doit afficher : "Your branch is up to date with 'origin/feature/{nom-feature}'"
```

### Étape 8 : Créer PR

#### Via gh CLI (Recommandé)

```bash
# Depuis la branche feature
gh pr create --title "feat(aquaculture): add daily biomass calculation" --body "$(cat <<'EOF'
## Summary
- Added biomass calculation in services/aquaculture.py
- Created domain/calculators/biomass.py for pure logic (no Django dependencies)
- Added tests with 87% coverage (15 tests)
- Translations FR + EN for error messages

## Changes
- **Backend:** `apps/aquaculture/services/aquaculture.py` - New `calculate_biomass()` method
- **Backend:** `apps/aquaculture/domain/calculators/biomass.py` - Pure Python calculator
- **Backend:** `apps/aquaculture/tests/test_biomass.py` - 15 new tests
- **Translations:** `fr.ts` + `en.ts` - Added keys for biomass errors

## Test Plan
- [x] Backend tests pass: `pytest apps/aquaculture/tests/test_biomass.py`
- [x] Coverage >50%: verified in htmlcov/ (87% achieved)
- [x] Manual test: POST /api/cycles/123/calculate-biomass/ with valid data
- [x] Manual test: Error handling with invalid data (count=0, negative weight)
- [x] Translations verified: FR/EN switch in error messages

## Related Issues
Closes #42

🤖 Generated with Claude Code
EOF
)"
```

#### Via GitHub Web

1. Aller sur https://github.com/{owner}/AquaCare
2. Cliquer "Compare & pull request" (banner jaune)
3. Remplir template :
   - **Title :** `feat(aquaculture): add daily biomass calculation`
   - **Summary :** Bullet points des changements
   - **Test Plan :** Checklist des tests effectués
   - **Captures :** Si changements UI (screenshots Expo Go)
4. Assigner reviewers (optionnel)
5. Labels : `enhancement`, `backend` ou `frontend`
6. Créer PR

### Étape 9 : Review (Auto-Review)

```bash
# 1. Récupérer le numéro de la PR (ex: 45)
gh pr list  # Lister PRs ouvertes

# 2. Lancer auto-review
/review-pr 45

# L'agent va :
# - Fetch PR info from GitHub
# - Analyser tous les fichiers modifiés
# - Appliquer checklists :
#   ✓ TypeScript : 0 erreurs
#   ✓ i18n : Translations FR + EN complètes
#   ✓ Security : Pas d'injection, XSS, hardcoded secrets
#   ✓ Offline patterns : UUID PK, client_uuid
#   ✓ Tests : Coverage >50% backend
#   ✓ Design system : MAVECAM colors only
# - Générer rapport avec issues par sévérité (Critical/High/Medium/Low)
```

**Exemple de rapport :**
```markdown
## Code Review Report - PR #45

### Summary
- Files changed: 4
- Lines added: +342
- Lines removed: -12
- Severity: 2 Medium issues

### Issues

#### Medium Severity
1. **Missing translation key** (src/features/aquaculture/screens/BiomassScreen.tsx:45)
   - Key `biomass.error.invalidWeight` found in fr.ts but missing in en.ts
   - Impact: English users will see untranslated text
   - Fix: Add key to en.ts with translation

2. **Test coverage below threshold** (apps/aquaculture/services/aquaculture.py)
   - Current coverage: 62% (target: 80% for services)
   - Missing tests for edge case: count=0
   - Fix: Add test_calculate_biomass_with_zero_count()

### Recommendations
- ✅ TypeScript: 0 errors
- ✅ Security: No vulnerabilities detected
- ✅ Offline patterns: UUID PK correctly used
- ⚠️ Translations: 1 missing key (fixable)
- ⚠️ Coverage: Below target for services (fixable)

**Overall:** Approve after fixing 2 medium issues.
```

#### Corriger les Issues

```bash
# 1. Corriger les issues identifiées
# Exemple : ajouter traduction manquante
# frontend/src/i18n/locales/en.ts

# 2. Stage corrections
git add frontend/src/i18n/locales/en.ts
git add apps/aquaculture/tests/test_biomass.py

# 3. Commit corrections
git commit -m "fix(review): address PR feedback

- Added missing translation key biomass.error.invalidWeight in en.ts
- Added test for zero count edge case (coverage now 87%)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

# 4. Push corrections
git push

# 5. Re-run review si nécessaire
/review-pr 45
```

### Étape 10 : Merge

**Pré-requis pour merge :**
- [ ] Tests CI passent (GitHub Actions)
- [ ] Review approuvée (manual ou /review-pr)
- [ ] Aucun blocker (Critical/High issues résolues)
- [ ] Branche up-to-date avec main

#### Via gh CLI

```bash
# Merge avec squash (recommandé pour features)
gh pr merge 45 --squash --delete-branch

# Ou merge classique
gh pr merge 45 --merge --delete-branch

# Ou rebase (pour fixes simples)
gh pr merge 45 --rebase --delete-branch
```

#### Via GitHub Web

1. Aller sur la PR
2. Vérifier tous les checks passent (✓ vert)
3. Cliquer "Squash and merge"
4. Éditer commit message si nécessaire
5. Confirmer merge
6. Cliquer "Delete branch"

**Après merge :**
```bash
# Retour sur main
git checkout main
git pull origin main

# Vérifier merge success
git log --oneline -5
# Doit afficher le commit mergé

# Nettoyage branche locale
git branch -d feature/{nom-feature}
```

**Déploiement Auto :**
Le push sur `main` déclenche GitHub Actions (`.github/workflows/deploy.yml`) :
1. Build Docker image
2. Push vers ghcr.io/{owner}/aquacare-api
3. Deploy sur VPS production (77.237.241.223)
4. Run migrations
5. Restart services (Gunicorn, Celery, Nginx)

---

## 🚀 Workflow Pré-Release (Avant Production)

```bash
/pre-release

# Exécute 7 phases de validation :

# Phase 1: Code Quality
#   - TypeScript : npx tsc --noEmit (DOIT être 0 erreurs)
#   - Tests backend : pytest --cov=apps --cov-fail-under=50
#   - Tests frontend : npm test
#   - Vérifier pas de console.log(), code commenté

# Phase 2: Translations (i18n-validator agent)
#   - Compare fr.ts et en.ts
#   - Identifie keys manquantes
#   - Vérifie no hardcoded strings dans components

# Phase 3: Security (security-reviewer agent)
#   - Scan injection SQL/NoSQL
#   - XSS vulnerabilities
#   - Hardcoded secrets (.env exposés)
#   - OWASP Top 10 checks

# Phase 4: Packages (expo-compatibility agent)
#   - Vérifie package.json et requirements.txt
#   - Identifie packages avec native code (blockers Expo Go)
#   - Suggestions alternatives

# Phase 5: Offline Patterns (offline-sync-checker agent)
#   - Vérifie tous models ont UUID PK
#   - Vérifie client_uuid sur entities offline
#   - Vérifie created_offline, synced_at metadata

# Phase 6: Documentation
#   - CHANGELOG à jour (PROJECT_CONTEXT.md)
#   - README cohérent
#   - ARCHITECTURE.md reflète changements

# Phase 7: Final Checks
#   - git status (pas de uncommitted changes)
#   - Migrations non appliquées (makemigrations check)
#   - Docker health check (tous services UP)
#   - Production API reachable (curl http://77.237.241.223/api/health/)
```

**Résultat Exemple :**
```markdown
## Pre-Release Validation Report

### Phase 1: Code Quality ✅
- TypeScript: 0 errors
- Backend tests: 142 passed, 0 failed (coverage: 67%)
- Frontend tests: 89 passed, 0 failed

### Phase 2: Translations ⚠️
- Missing keys: 3 (en.ts)
  - aquaculture.biomass.title
  - commerce.cart.emptyMessage
  - notifications.settings.title
- Action: Add missing keys before deploy

### Phase 3: Security ✅
- No SQL injection vulnerabilities
- No XSS vulnerabilities
- No hardcoded secrets

### Phase 4: Packages ✅
- All packages Expo Go compatible
- No native dependencies

### Phase 5: Offline Patterns ✅
- All models use UUID PK
- client_uuid present on 8/8 offline entities

### Phase 6: Documentation ⚠️
- PROJECT_CONTEXT.md not updated since 2026-01-15
- Action: Run /update-changelog

### Phase 7: Final Checks ✅
- No uncommitted changes
- No pending migrations
- Docker services: 6/6 UP
- Production API: HTTP 200 OK

---

**Overall: PASS with 2 warnings**
Fix warnings before production deploy.
```

**Si PASS :** Déployer via push sur main
**Si FAIL :** Corriger blockers avant déploiement

---

## 🐳 Commandes Docker (Référence Complète)

### Stack Management

```bash
# Démarrer tous services
docker-compose up -d

# Démarrer service spécifique
docker-compose up -d api
docker-compose up -d db

# Arrêter tous services
docker-compose down

# Arrêter + supprimer volumes (⚠️ perte de données)
docker-compose down -v

# Rebuild après changement Dockerfile/requirements
docker-compose up -d --build api

# Vérifier status services
docker-compose ps
# Doit afficher 6 services : db, api, redis, celery_worker, celery_beat, nginx
```

### Migrations & Data

```bash
# Créer migrations
docker-compose exec api python manage.py makemigrations

# Appliquer migrations
docker-compose exec api python manage.py migrate

# Rollback migration
docker-compose exec api python manage.py migrate {app_name} {migration_number}

# CRITICAL : Charger fixtures après migrate
docker-compose exec api python manage.py load_nutritional_data  # 8 guides MAVECAM
docker-compose exec api python manage.py load_products           # 22 produits catalogue
docker-compose exec api python manage.py setup_rbac              # Rôles admin + permissions

# Vérifier migrations appliquées
docker-compose exec api python manage.py showmigrations
```

### Testing

```bash
# Tous les tests
docker-compose exec api pytest

# Module spécifique
docker-compose exec api pytest apps/aquaculture/tests/

# Test spécifique
docker-compose exec api pytest -k test_create_cycle

# Avec coverage
docker-compose exec api pytest --cov=apps --cov-report=html

# Coverage report HTML
# Ouvrir backend/htmlcov/index.html dans navigateur

# Tests en parallèle (plus rapide)
docker-compose exec api pytest -n auto

# Verbose output
docker-compose exec api pytest -vv

# Stop on first failure
docker-compose exec api pytest -x
```

### Logs & Debugging

```bash
# Logs temps réel
docker-compose logs -f api
docker-compose logs -f celery_worker

# Logs depuis dernières 100 lignes
docker-compose logs --tail=100 api

# Logs tous services
docker-compose logs -f

# Shell Django
docker-compose exec api python manage.py shell

# IPython shell (plus puissant)
docker-compose exec api python manage.py shell_plus

# Shell PostgreSQL
docker-compose exec db psql -U aquacare_user -d aquacare_db

# Exécuter SQL depuis fichier
docker-compose exec db psql -U aquacare_user -d aquacare_db -f /path/to/query.sql

# Bash dans container
docker-compose exec api bash
```

### Database Operations

```bash
# Backup database
docker-compose exec db pg_dump -U aquacare_user aquacare_db > backup.sql

# Restore database
docker-compose exec -T db psql -U aquacare_user -d aquacare_db < backup.sql

# Reset database (⚠️ perte de données)
docker-compose down -v
docker-compose up -d db
# Attendre 5 secondes
docker-compose exec api python manage.py migrate
docker-compose exec api python manage.py load_nutritional_data
docker-compose exec api python manage.py load_products
docker-compose exec api python manage.py setup_rbac

# Créer superuser
docker-compose exec api python manage.py create_superuser_from_env

# Ou interactif
docker-compose exec api python manage.py createsuperuser
```

### Performance & Monitoring

```bash
# Ressources utilisées par services
docker stats

# Nettoyer images non utilisées
docker image prune -a

# Nettoyer volumes non utilisés
docker volume prune

# Vérifier espace disque Docker
docker system df

# Nettoyer tout (images, containers, volumes)
docker system prune -a --volumes
```

---

## 📱 Commandes Frontend (Référence Complète)

### Development

```bash
# Démarrer Expo Go (auto-détecte backend IP)
npm start

# Démarrer avec clear cache (requis après .env change)
npm start -- --clear

# Démarrer avec tunnel (si pas de connexion LAN)
npm start -- --tunnel

# Build production (EAS Build, non utilisé actuellement)
# eas build --platform android
# eas build --platform ios
```

### Testing

```bash
# Tous les tests
npm test

# Watch mode (re-run auto sur changements)
npm run test:watch

# Test d'un fichier spécifique
npm test -- src/features/aquaculture/utils/calculations.test.ts

# Coverage report
npm run test:coverage
# Ouvrir coverage/index.html

# Update snapshots
npm test -- -u

# Verbose output
npm test -- --verbose

# Debug test
node --inspect-brk node_modules/.bin/jest --runInBand
```

### TypeScript

```bash
# Type check (OBLIGATOIRE avant commit)
npx tsc --noEmit
# DOIT afficher 0 erreurs

# Type check avec watch mode
npx tsc --noEmit --watch

# Générer fichiers .d.ts (si nécessaire)
npx tsc --declaration --emitDeclarationOnly
```

### Package Management

```bash
# Installer package (TOUJOURS via expo install)
npx expo install {package-name}

# Exemples :
npx expo install expo-camera
npx expo install date-fns
npx expo install @react-navigation/native

# JAMAIS npm install pour packages React Native
# ❌ npm install react-native-camera  (crash Expo Go)
# ✅ npx expo install expo-camera     (fonctionne)

# Vérifier compatibility AVANT installation
/check-package {package-name}

# Désinstaller package
npm uninstall {package-name}

# Lister packages installés
npm list --depth=0

# Mettre à jour packages (⚠️ tester après)
npx expo install --fix
```

### Bundle Analysis

```bash
# Analyser bundle size
npx expo export --platform android --dump-assetmap

# Source map explorer (identifier gros packages)
npm install -g source-map-explorer
npx expo export --platform android
source-map-explorer output.js --no-border-checks

# Lister tailles packages
npm list --depth=0 --json | jq '.dependencies | to_entries | sort_by(.value.size)'
```

### Translations (i18n)

```bash
# Pas de commande auto pour validation
# Utiliser agent :
i18n-validator

# Ou inclus dans :
/pre-release
```

**Structure i18n :**
```
frontend/src/i18n/
├── index.ts           # Config i18next
├── locales/
│   ├── fr.ts          # Traductions françaises
│   └── en.ts          # Traductions anglaises
```

**Ajouter nouvelle traduction :**
```typescript
// 1. Ajouter dans fr.ts
export default {
  aquaculture: {
    biomass: {
      title: "Calcul de biomasse",
      error: {
        invalidWeight: "Le poids doit être supérieur à 0"
      }
    }
  }
}

// 2. Ajouter dans en.ts (MÊMES keys)
export default {
  aquaculture: {
    biomass: {
      title: "Biomass Calculation",
      error: {
        invalidWeight: "Weight must be greater than 0"
      }
    }
  }
}

// 3. Utiliser dans composant
import { useTranslation } from 'react-i18next';

const BiomassScreen = () => {
  const { t } = useTranslation();
  return <Text>{t('aquaculture.biomass.title')}</Text>;
}
```

---

## 🐛 Debug Guidé

### Si Erreur API (500, 401, 404)

```bash
# Étape 1 : Vérifier logs backend
docker-compose logs -f api

# Chercher traceback Python
# Identifier ligne d'erreur

# Étape 2 : Si besoin, investiguer DB
/db-debug "user avec phone +237652000000 ne peut pas se connecter"

# Claude va :
# - Query PostgreSQL (accounts_user table)
# - Vérifier existence user, is_active, password hash
# - Proposer fix (ex: reset password, activer compte)

# Étape 3 : Si bug complexe, workflow systématique
/fix-bug

# Suivre 6 phases guidées (Understand → Diagnose → Plan → Implement → Verify → Document)
```

**Erreurs API communes :**

| Erreur | Cause Probable | Fix |
|--------|----------------|-----|
| 500 Internal Server Error | Exception Python non catchée | Vérifier logs : `docker-compose logs api` |
| 401 Unauthorized | JWT token expiré ou invalide | Refresh token ou re-login |
| 404 Not Found | URL incorrecte ou objet n'existe pas | Vérifier endpoint + UUID |
| 400 Bad Request | Serializer validation échoue | Vérifier payload JSON, fields requis |
| 403 Forbidden | Permissions manquantes | Vérifier RBAC roles (`setup_rbac`) |

### Si Erreur Frontend (Crash, Undefined)

```bash
# Étape 1 : Vérifier console Expo Go
# Regarder Metro bundler terminal
# Red screen error message

# Étape 2 : Vérifier TypeScript
cd frontend
npx tsc --noEmit

# Si erreurs TypeScript → corriger TOUTES

# Étape 3 : Vérifier defensive coding
# Chercher accès à properties sans fallback

# ❌ WRONG
if (farmProfile.total_area_m2 > 0)

# ✅ CORRECT
if ((farmProfile.total_area_m2 || 0) > 0)

# Étape 4 : Si bug complexe
/fix-bug
```

**Erreurs Frontend communes :**

| Erreur | Cause | Fix |
|--------|-------|-----|
| `undefined is not an object` | Accès property sans check | Defensive coding `(value || default)` |
| `Cannot read property 'map' of undefined` | Array undefined | Fallback `(array || []).map()` |
| `Network request failed` | Backend down ou mauvaise IP | Vérifier Docker up, .env API_URL |
| `Invariant Violation` | Navigation params typés incorrects | Vérifier RootStackParamList |
| `Cannot find module` | Import path incorrect | Vérifier alias `@/` ou path relatif |

### Si Erreur Traductions (Texte Manquant)

```bash
# Lancer validator
i18n-validator

# Ou inclus dans
/pre-release

# Résultat :
# ❌ Missing in en.ts: aquaculture.biomass.title
# ❌ Missing in fr.ts: commerce.cart.emptyMessage

# Corriger dans fr.ts et en.ts
# Re-run validator pour confirmer
```

**Pattern de fix :**
```bash
# 1. Identifier keys manquantes (output i18n-validator)
# 2. Ajouter dans les deux fichiers
git add frontend/src/i18n/locales/fr.ts
git add frontend/src/i18n/locales/en.ts

# 3. Commit
git commit -m "fix(i18n): add missing translation keys

- Added aquaculture.biomass.title (FR + EN)
- Added commerce.cart.emptyMessage (FR + EN)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
```

### Si Erreur Offline Sync

```bash
# Symptôme : Data créée offline ne sync pas

# Étape 1 : Vérifier model a UUID PK
docker-compose exec api python manage.py shell
>>> from apps.aquaculture.models import CycleLog
>>> CycleLog._meta.pk.get_internal_type()
'UUIDField'  # ✅ Correct

# Étape 2 : Vérifier client_uuid existe
>>> log = CycleLog.objects.first()
>>> log.client_uuid
UUID('...')  # ✅ Present

# Étape 3 : Vérifier deduplication backend
# apps/aquaculture/views.py ou services/
# Doit avoir logique :
# if client_uuid and Model.objects.filter(client_uuid=client_uuid).exists():
#     return existing_object
# else:
#     create new

# Étape 4 : Run agent
offline-sync-checker

# Identifie models sans UUID PK ou client_uuid manquant
```

### Si Tests Échouent

```bash
# Backend tests
docker-compose exec api pytest apps/aquaculture/tests/test_biomass.py -vv

# Lire traceback carefully
# Erreurs communes :

# 1. Missing @pytest.mark.django_db
# Fix : Ajouter decorator sur test function

# 2. Field required error
# Fix : Ajouter ALL required fields dans test data

# 3. IntegrityError (UNIQUE constraint)
# Fix : Utiliser UUID uniques, cleanup test data

# 4. Assertion mismatch
# Fix : Vérifier expected vs actual, debugger avec print()

# Frontend tests
npm test -- src/features/aquaculture/utils/calculations.test.ts

# Erreurs communes :

# 1. Snapshot mismatch
# Fix : Update snapshot avec `npm test -- -u` si intentionnel

# 2. Mock not working
# Fix : Vérifier jest.mock() path correct

# 3. Async timeout
# Fix : Increase timeout ou await async operations
```

---

## 🚨 Règles d'Or (Ne JAMAIS Oublier)

### Backend

1. ✅ **Toujours** utiliser UUID comme PK
   ```python
   id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
   ```

2. ✅ **Toujours** client_uuid pour offline entities
   ```python
   client_uuid = models.UUIDField(unique=True, null=True, blank=True)
   ```

3. ✅ **Toujours** business logic dans services/
   ```python
   # ❌ WRONG : Logic in views.py
   # ✅ CORRECT : Logic in services/aquaculture.py
   ```

4. ✅ **Toujours** >50% coverage
   ```bash
   pytest --cov=apps --cov-fail-under=50
   ```

5. ✅ **Toujours** migrations + load data
   ```bash
   migrate && load_nutritional_data && load_products && setup_rbac
   ```

### Frontend

6. ✅ **Toujours** utiliser `t('key')` pour UI text
   ```typescript
   // ❌ WRONG
   <Text>Statut juridique</Text>

   // ✅ CORRECT
   <Text>{t('legalStatus')}</Text>
   ```

7. ✅ **Toujours** MAVECAM colors uniquement
   ```typescript
   // ❌ WRONG
   backgroundColor: '#28a745'  // Custom green

   // ✅ CORRECT
   backgroundColor: colors.GREEN_PRIMARY  // #059669
   ```

8. ✅ **Toujours** defensive coding
   ```typescript
   // ❌ WRONG
   if (farmProfile.total_area_m2 > 0)

   // ✅ CORRECT
   if ((farmProfile.total_area_m2 || 0) > 0)
   ```

9. ✅ **Toujours** `npx expo install` (jamais `npm install`)
   ```bash
   npx expo install expo-camera  # ✅
   npm install react-native-camera  # ❌ Crash Expo Go
   ```

10. ✅ **Toujours** TypeScript 0 erreurs
    ```bash
    npx tsc --noEmit  # MUST show 0 errors
    ```

### General

11. ❌ **Jamais** commit .env
    ```bash
    git status  # Vérifier .env pas stagé
    ```

12. ❌ **Jamais** console.log() en prod
    ```bash
    # Retirer avant commit
    grep -r "console.log" src/
    ```

13. ❌ **Jamais** `git status -uall`
    ```bash
    # ❌ Crashe sur gros repos
    git status -uall

    # ✅ Utiliser
    git status
    ```

14. ❌ **Jamais** hardcoded secrets
    ```python
    # ❌ WRONG
    SECRET_KEY = "django-insecure-123456"

    # ✅ CORRECT
    SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')
    ```

---

## 🔧 Troubleshooting Rapide

| Problème | Solution | Commande |
|----------|----------|----------|
| **Expo Go crash au start** | Clear cache Metro bundler | `npm start -- --clear` |
| **Tests backend échouent** | Docker down, migrations | `docker-compose down && docker-compose up -d && docker-compose exec api python manage.py migrate` |
| **TypeScript erreurs** | Lire message, defensive coding | `npx tsc --noEmit`, ajouter `|| default` ou `?.` |
| **Traductions manquantes** | Ajouter keys FR + EN | Éditer `fr.ts` ET `en.ts`, run `i18n-validator` |
| **401 Unauthorized** | Token JWT expiré | Re-login, vérifier `expo-secure-store` |
| **Offline sync échoue** | Vérifier client_uuid unique | `offline-sync-checker` agent |
| **Build Docker fail** | Rebuild from scratch | `docker-compose down && docker-compose up -d --build` |
| **CI tests fail** | Reproduire localement | `pytest --cov-fail-under=50` |
| **Migrations conflict** | Reset migrations (⚠️ dev only) | `find . -path "*/migrations/*.py" -not -name "__init__.py" -delete` puis `makemigrations` |
| **Port 8000 déjà utilisé** | Kill process ou change port | `lsof -ti:8000 \| xargs kill -9` (Mac/Linux) ou `docker-compose down` |
| **Expo Go connection fail** | Vérifier même réseau WiFi | Device + PC sur même LAN, ou utiliser `--tunnel` |
| **Memory leak app** | Profile avec React DevTools | Ouvrir DevTools, onglet Profiler, chercher re-renders |
| **List scroll jank** | Remplacer par FlashList | `npx expo install @shopify/flash-list` |
| **Bundle size >5MB** | Analyser avec source-map-explorer | `npx expo export --dump-assetmap && source-map-explorer output.js` |

---

## 🌐 MCP Servers Disponibles

AquaCare a accès à plusieurs MCP (Model Context Protocol) servers configurés au niveau global de Claude Code.

### postgres-mcp - Query Base de Données

**Quand l'utiliser :** Investigation avancée PostgreSQL (alternative à `/db-debug`)

**Exemples d'usage :**

```sql
-- Vérifier données utilisateur
SELECT * FROM accounts_user WHERE phone_number = '+237652000000';

-- Stats de production
SELECT
  COUNT(*) as total_cycles,
  AVG(final_harvest_kg) as avg_biomass,
  AVG(fcr_achieved) as avg_fcr
FROM aquaculture_productioncycle
WHERE status = 'completed';

-- Logs offline non synchronisés
SELECT * FROM aquaculture_cyclelog
WHERE created_offline = true AND synced_at IS NULL
ORDER BY created_at DESC LIMIT 20;

-- Vérifier doublons client_uuid
SELECT client_uuid, COUNT(*) as count
FROM aquaculture_cyclelog
WHERE client_uuid IS NOT NULL
GROUP BY client_uuid
HAVING COUNT(*) > 1;

-- Analyser performance feeding plans
SELECT
  fp.id,
  fp.cycle_id,
  COUNT(fe.id) as total_feedings,
  SUM(fe.quantity_kg) as total_feed_kg,
  fp.created_at
FROM aquaculture_feedingplan fp
LEFT JOIN aquaculture_feedingevent fe ON fe.feeding_plan_id = fp.id
GROUP BY fp.id
ORDER BY fp.created_at DESC;
```

### context7 - Lookup Documentation

**Quand l'utiliser :** Chercher documentation officielle d'une bibliothèque/framework

**Exemples d'usage :**
- "Comment utiliser Django signals pour post_save ?"
- "React Navigation navigation.navigate() avec paramètres typés"
- "Celery periodic tasks avec DatabaseScheduler"
- "Expo SecureStore API pour stocker tokens JWT"
- "Django REST Framework nested serializers"
- "Redux Toolkit createAsyncThunk error handling"

**Note :** Context7 cherche documentation à jour (2026) des libs officielles.

### greptile - Code Understanding Avancé

**Quand l'utiliser :** Code reviews avancés, custom context, PR comments

**Fonctions disponibles :**

```bash
# Lister PRs ouvertes
list_pull_requests

# Obtenir détails PR spécifique
get_merge_request(owner, repo, pr_number)

# Lister commentaires review
list_merge_request_comments(owner, repo, pr_number)

# Search custom context
search_custom_context(query)

# Lister code reviews
list_code_reviews

# Trigger code review
trigger_code_review(owner, repo, pr_number)
```

**Note :** Greptile analyse PR GitHub et fournit contexte sur le code.

### github - Opérations GitHub

**Quand l'utiliser :** Opérations GitHub avancées (alternative à `gh` CLI)

**Exemples d'usage :**

```python
# Créer PR
create_pull_request(
  owner="owner",
  repo="AquaCare",
  title="feat(aquaculture): add biomass calculator",
  head="feature/biomass-calculator",
  base="main",
  body="## Summary\n- Added calculator\n..."
)

# Merger PR
merge_pull_request(
  owner="owner",
  repo="AquaCare",
  pull_number=45,
  merge_method="squash"
)

# Créer issue
create_issue(
  owner="owner",
  repo="AquaCare",
  title="Bug: Offline sync fails for logs",
  body="Repro steps:\n1. Create log offline\n...",
  labels=["bug", "backend"]
)

# Search code
search_code(query="validate_cameroon_phone_number repo:AquaCare")

# Obtenir fichiers modifiés dans PR
get_pull_request_files(owner="owner", repo="AquaCare", pull_number=45)
```

### playwright - Browser Automation

**Quand l'utiliser :** Tester UI web (moins pertinent pour AquaCare mobile-first)

**Note :** AquaCare est mobile-first, playwright rarement utilisé. Utile si admin web ajouté.

**Exemples d'usage :**
```javascript
// Navigate to admin
browser_navigate("http://localhost:8000/admin/")

// Fill login form
browser_fill_form([
  { name: "username", type: "textbox", value: "admin" },
  { name: "password", type: "textbox", value: "password123" }
])

// Click login button
browser_click("Login button")

// Take screenshot
browser_take_screenshot("admin-dashboard.png")
```

---

## ⚡ Optimisation Performance React Native

Le skill **react-native-best-practices** s'applique automatiquement et fournit 14 fichiers de référence pour optimiser performance mobile.

### Quand ce Skill S'applique

- Debug slow/janky UI ou animations
- Investigation memory leaks
- Optimisation startup time (TTI)
- Réduction bundle size
- Profiling performance React Native
- **Travail sur listes** (cycles, logs, produits) ← **CRITIQUE pour AquaCare**

### 14 Références Disponibles

#### JavaScript/React (js-*) - 9 fichiers

1. **js-lists-flatlist-flashlist.md** (CRITICAL)
   - Remplacer ScrollView par listes virtualisées
   - FlashList vs FlatList comparison
   - Optimisations getItemLayout, keyExtractor

2. **js-profile-react.md** (MEDIUM)
   - React DevTools profiling
   - Identifier re-renders inutiles
   - Flame chart analysis

3. **js-measure-fps.md** (HIGH)
   - FPS monitoring tools
   - Performance.now() measurements
   - 60 FPS target

4. **js-memory-leaks.md** (MEDIUM)
   - Hunting JS memory leaks
   - Event listeners cleanup
   - Closure pitfalls

5. **js-atomic-state.md** (HIGH)
   - Jotai/Zustand patterns
   - Atomic state updates
   - Avoid Redux over-fetching

6. **js-concurrent-react.md** (HIGH)
   - useDeferredValue, useTransition
   - Priority-based rendering
   - Non-blocking UI updates

7. **js-react-compiler.md** (HIGH)
   - Automatic memoization
   - Compiler optimizations
   - useMemo/useCallback replacement

8. **js-animations-reanimated.md** (MEDIUM)
   - Reanimated worklets
   - Native thread animations
   - 60 FPS smooth animations

9. **js-uncontrolled-components.md** (HIGH)
   - TextInput optimization
   - Avoid controlled re-renders
   - onEndEditing pattern

#### Bundling (bundle-*) - 5 fichiers

1. **bundle-barrel-exports.md** (CRITICAL)
   - Éviter barrel imports (index.ts re-exporting)
   - Tree-shaking issues
   - Direct imports best practice

2. **bundle-analyze-js.md** (CRITICAL)
   - JS bundle visualization
   - source-map-explorer usage
   - Identify bloated packages

3. **bundle-tree-shaking.md** (HIGH)
   - Dead code elimination
   - ES modules vs CommonJS
   - sideEffects: false in package.json

4. **bundle-library-size.md** (MEDIUM)
   - Evaluate dependencies size
   - Alternatives to heavy libs
   - Import cost analysis

### Mapping Problème → Skill

| Problème | Commencer par | Ensuite |
|----------|---------------|---------|
| App feels slow/janky | `js-measure-fps.md` | `js-profile-react.md` |
| Too many re-renders | `js-profile-react.md` | `js-react-compiler.md` |
| Slow startup (TTI) | `bundle-analyze-js.md` | `bundle-barrel-exports.md` |
| Large app size | `bundle-analyze-js.md` | `bundle-tree-shaking.md` |
| Memory growing | `js-memory-leaks.md` | `js-atomic-state.md` |
| Animation drops frames | `js-animations-reanimated.md` | `js-measure-fps.md` |
| List scroll jank | `js-lists-flatlist-flashlist.md` | `js-profile-react.md` |
| TextInput lag | `js-uncontrolled-components.md` | `js-profile-react.md` |

### Patterns AquaCare Critiques

#### 1. Listes à Optimiser (PRIORITÉ HAUTE)

```typescript
// ❌ INCORRECT - Re-renders entire list on state change
const [cycles, setCycles] = useState<Cycle[]>([]);

<ScrollView>
  {cycles.map(c => <CycleCard key={c.id} cycle={c} />)}
</ScrollView>

// ✅ CORRECT - Virtualized with FlashList
import { FlashList } from "@shopify/flash-list";

<FlashList
  data={cycles}
  renderItem={({ item }) => <CycleCard cycle={item} />}
  estimatedItemSize={100}
  keyExtractor={(item) => item.id}
/>
```

**Listes à optimiser dans AquaCare :**
- Production cycles list (dashboard) ← **CRITIQUE**
- Daily logs history ← **CRITIQUE**
- Product catalog (commerce)
- Notifications list

#### 2. Barrel Export Issue (CRITICAL pour bundle size)

```typescript
// ❌ INCORRECT - Imports ALL constants even if unused
import { COLORS } from '@/constants';

// ✅ CORRECT - Direct import
import { COLORS } from '@/constants/colors';

// ❌ WRONG - Barrel export re-exports everything
// constants/index.ts
export * from './colors';
export * from './aquaculture';
export * from './cameroon';

// ✅ CORRECT - No barrel exports, direct imports
// Import directly from source file
import { GREEN_PRIMARY } from '@/constants/colors';
```

#### 3. Bundle Analysis Commands

```bash
# Analyser bundle Expo
cd frontend
npx expo export --platform android --dump-assetmap

# Source map explorer (identifier gros packages)
npx source-map-explorer output.js --no-border-checks

# Identifier gros packages
npm list --depth=0 --json | jq '.dependencies | to_entries | sort_by(.value.size)'

# Alternative : bundlesize package
npm install -g bundlesize
bundlesize
```

#### 4. FPS Monitoring

```bash
# Ouvrir React Native DevTools
# Dans Metro bundler : appuyer sur 'j'
# Ou secouer device → "Open DevTools"

# Activer FPS monitor
# DevTools → Performance → Enable FPS Monitor

# Target : 60 FPS consistent
# Warning : <50 FPS → Investigate jank
# Critical : <30 FPS → Major performance issue
```

### Quand Lancer Optimisation Performance

**Checklist de déclenchement :**
- [ ] Scroll de liste laggy (FPS < 60)
- [ ] App startup > 3 secondes (TTI)
- [ ] Bundle size > 5 MB
- [ ] Memory leaks détectés (app ralentit après usage prolongé)
- [ ] Animations drop frames (FPS drops during animation)

**Workflow d'optimisation :**

1. **Mesurer d'abord**
   ```bash
   # Bundle size
   npx expo export --dump-assetmap

   # FPS monitoring
   # Activer dans DevTools
   ```

2. **Identifier bottleneck**
   - FPS monitor pour jank
   - React DevTools Profiler pour re-renders
   - source-map-explorer pour bundle bloat

3. **Appliquer fix**
   - Référencer skill approprié du tableau mapping ci-dessus
   - Implémenter fix (FlashList, tree-shaking, memoization)

4. **Re-mesurer**
   - Vérifier amélioration quantifiable
   - FPS devrait être 60 FPS stable
   - Bundle size réduit
   - TTI amélioré

---

## 📚 Ressources et Références

### Documentation Projet

| Fichier | Contenu |
|---------|---------|
| `CLAUDE.md` | Guide complet pour Claude Code (architecture, commands, patterns) |
| `ARCHITECTURE.md` | Patterns backend/frontend, services layer, domain calculators |
| `DESIGN_SYSTEM.md` | MAVECAM colors, spacing, typography, components |
| `DONT_DO.md` | Antipatterns à éviter (git -uall, hardcoded text, etc.) |
| `PROJECT_CONTEXT.md` | Changelog, historique features, roadmap |
| `.claude/ADDICTION_STRATEGY.md` | Vision produit, retention hooks, gamification |
| `.claude/commands/README.md` | 8 custom commands documentation |
| `.claude/skills/react-native-best-practices/` | 14 références performance RN |

### URLs Production

| Service | URL |
|---------|-----|
| API Production | http://77.237.241.223/api |
| Admin Django Production | http://77.237.241.223/admin |
| GitHub Repository | https://github.com/{owner}/AquaCare |
| GitHub Actions CI/CD | https://github.com/{owner}/AquaCare/actions |
| Docker Registry | ghcr.io/{owner}/aquacare-api |

### CI/CD

| Workflow | Trigger | Actions |
|----------|---------|---------|
| `pull-request-tests.yml` | PR to main | Run pytest backend tests |
| `deploy.yml` | Push to main | Build Docker → Push ghcr.io → Deploy VPS → Migrate → Restart |

---

## 🧪 Hypothèses du Workflow

Les hypothèses suivantes ont été faites lors de la création de ce workflow :

1. **Pas de linting configuré**
   - Pas de black/flake8/isort (backend)
   - Pas de ESLint/Prettier (frontend)
   - → Checklist manuelle à l'étape 5

2. **Pas de pre-commit hooks**
   - Pas de husky/pre-commit
   - → Validation manuelle TypeScript/tests avant commit

3. **gh CLI disponible**
   - Commandes `gh pr create` et `gh pr merge` supposent gh CLI installé
   - → Alternative : GitHub Web UI

4. **Docker + Node installés**
   - Pré-requis pour stack backend/frontend
   - → Setup initial obligatoire

5. **Expo Go sur mobile**
   - Workflow suppose dev avec Expo Go (pas EAS Build)
   - → Limitation : packages sans native code uniquement

6. **VPS production accessible**
   - Déploiement auto via GitHub Actions vers 77.237.241.223
   - → Nécessite credentials SSH configurés dans GitHub Secrets

---

## 🎯 Résumé : Boucle de Développement Complète

```
1. Choisir feature/bug (backlog, issues GitHub)
   ↓
2. Créer branche (git checkout -b feature/...)
   ↓
3. Concevoir (acceptance criteria, identifier command)
   ↓
4. Implémenter (/create-backend-feature ou /create-frontend-feature ou /fix-bug)
   ↓
5. Tester (pytest + npm test + npx tsc --noEmit)
   ↓
6. Vérifier qualité (checklist manuelle, /check-package si nouveau package)
   ↓
7. Commit (format type(scope): description)
   ↓
8. Push (git push origin feature/...)
   ↓
9. Créer PR (gh pr create ou GitHub Web)
   ↓
10. Review (/review-pr {numero})
    ↓
11. Corriger issues review (git commit + push)
    ↓
12. Merge (gh pr merge --squash --delete-branch)
    ↓
13. Deploy auto (GitHub Actions → VPS production)
    ↓
14. Vérifier production (curl http://77.237.241.223/api/health/)
```

**Avant release majeure :** Run `/pre-release` (7 phases validation)

**Après merge :** Update changelog avec `/update-changelog`

---

## ✅ Checklist Développeur Quotidienne

### Matin (Démarrage)

- [ ] `git pull origin main` (sync avec team)
- [ ] `cd backend && docker-compose up -d` (start stack)
- [ ] `docker-compose logs -f api` (vérifier services UP)
- [ ] `cd frontend && npm start` (start Expo Go)
- [ ] Scan QR code (tester app fonctionne)

### Pendant Dev

- [ ] Tests backend passent (`pytest`)
- [ ] Tests frontend passent (`npm test`)
- [ ] TypeScript 0 erreurs (`npx tsc --noEmit`)
- [ ] Pas de console.log() oublié
- [ ] Traductions FR + EN ajoutées

### Avant Commit

- [ ] `git status` (vérifier pas de .env stagé)
- [ ] `npx tsc --noEmit` (MUST be 0 errors)
- [ ] Commit message format correct (type(scope): description)

### Avant PR

- [ ] Tous tests passent localement
- [ ] Coverage >50% backend
- [ ] Documentation mise à jour si nécessaire
- [ ] `/review-pr` si possible (self-review)

### Soir (Fin de journée)

- [ ] Push commits (`git push`)
- [ ] Créer PR si feature complète
- [ ] Update PROJECT_CONTEXT.md si feature majeure (`/update-changelog`)
- [ ] `docker-compose down` (libérer ressources)

---

**Fin du WORKFLOW.md**

*Ce document est un guide opérationnel vivant. Si vous identifiez des améliorations, mettez-le à jour et commitez les changements.*

*Généré avec Claude Code - Dernière mise à jour : 2026-01-22*
