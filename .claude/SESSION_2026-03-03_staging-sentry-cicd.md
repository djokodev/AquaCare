# Session 2026-03-03 — Staging, Sentry & CI/CD

## Objectif de départ

Préparer AquaCare pour publication sur App Store / Google Play.
Avant de soumettre une app sur les stores, la procédure standard est :
1. Tester sur un environnement **staging** (copie isolée de la prod)
2. Faire une **beta privée** (TestFlight iOS / Google Play Internal Testing)
3. Publier progressivement en **production**

L'application n'avait que deux environnements : dev local et production.
Il manquait le **staging** côté backend et côté mobile.

---

## Ce qui a été fait

### 1. Backend — Staging sur le VPS

**Fichiers créés :**
- `backend/mavecam_api/settings/staging.py` — hérite de production.py, connexion directe DB (CONN_MAX_AGE=60), logs DEBUG, ALLOWED_HOSTS staging
- `backend/docker-compose.staging.yml` — stack simplifiée, port interne 8081
- `backend/.env.staging.example` — template complet des variables pour le serveur

**Résultat :**
- `https://api-staging.aquacare.tech` → stack staging ✅ (7 containers séparés de la prod)
- `https://api.aquacare.tech` → stack production ✅ (inchangée)
- SSL Let's Encrypt couvre les 4 domaines (aquacare.tech, www, api, api-staging)

---

### 2. Sentry — Monitoring des erreurs

**Fichier modifié :** `backend/mavecam_api/settings/base.py`

Sentry s'initialise automatiquement si `SENTRY_DSN` est défini dans l'environnement :
```python
_SENTRY_DSN = os.getenv('SENTRY_DSN', '')
if _SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        traces_sample_rate=0.1,
        environment=os.getenv('DJANGO_ENVIRONMENT', 'production'),
    )
```

**Package ajouté :** `sentry-sdk[django]` dans `requirements/production.txt`

**DSN backend :** déjà configuré dans `.env.staging.example` et dans les GitHub Secrets.
**DSN frontend (mobile) :** `https://213bdf7e8dde80596d43414ad1861152@o4510971830468608.ingest.de.sentry.io/4510981104402512`
Projet Sentry : `aquacare / frontend-aquacare`

---

### 3. CI/CD — Correction de la pipeline GitHub Actions

La pipeline `deploy.yml` échouait à chaque merge sur `main`. Cascade de 6 bugs corrigés :

| # | Problème | Fix |
|---|---------|-----|
| 1 | nginx port 80:80 → conflit avec nginx hôte | `127.0.0.1:8080:80` |
| 2 | Health check URL `localhost` → ne répondait pas | `127.0.0.1:8080` |
| 3 | `crypto.randomUUID` absent dans Jest/jsdom | Polyfill dans `jest.setup.js` |
| 4 | Tag pgbouncer `1.21.0` inexistant | `1.21.0-p2` |
| 5 | PostgreSQL `shared_buffers=3GB` → crash kernel | Suppression tuning |
| 6 | Test `test_pdf_service.py` non-déterministe | Reset `_pdf_patched` via monkeypatch |
| 7 | `celery_worker` bloqué dans `entrypoint.sh` (migrations = 3-5 min) | `entrypoint: []` + wait TCP minimal |
| 8 | **pgbouncer inutile et cassé** (port par défaut 5432 ≠ 6432 attendu) | **Suppression complète de pgbouncer** |

**Décision architecturale :** pgbouncer a été supprimé.
- Charge MVP (~50 connexions simultanées max) bien en dessous de la limite PostgreSQL (100)
- Connexion directe Django → PostgreSQL, plus simple et plus fiable
- `CONN_MAX_AGE: 60` dans production.py (Django réutilise ses connexions)

---

### 4. Frontend — Préparation builds EAS

#### `environment.ts` — Détection du mode staging

```typescript
export type Environment = 'development' | 'staging' | 'production';

export function getEnvironment(): Environment {
  if (__DEV__) return 'development';                                    // Expo Go local
  if (process.env.EXPO_PUBLIC_APP_ENV === 'staging') return 'staging'; // EAS internal build
  return 'production';                                                  // EAS store build
}
```

URLs par environnement :
- `development` → `http://{IP_EXPO}:8000/api` (auto-détectée)
- `staging`     → `https://api-staging.aquacare.tech/api`
- `production`  → `https://api.aquacare.tech/api`

#### `eas.json` — Profils de build EAS

```json
{
  "build": {
    "development": { "developmentClient": true, "distribution": "internal", "env": { "EXPO_PUBLIC_APP_ENV": "development" } },
    "staging":     { "distribution": "internal", "env": { "EXPO_PUBLIC_APP_ENV": "staging" }, "android": { "buildType": "apk" } },
    "production":  { "distribution": "store",    "env": { "EXPO_PUBLIC_APP_ENV": "production" } }
  }
}
```

#### `@sentry/react-native` — Monitoring mobile

**Installation :** `npx expo install @sentry/react-native`
**Plugin ajouté** dans `app.json` automatiquement.

**Initialisation dans `App.tsx` :**
```typescript
const isExpoGo = Constants.appOwnership === 'expo';
if (!__DEV__ && !isExpoGo) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
    environment: getEnvironment(), // 'staging' ou 'production'
    tracesSampleRate: 0.1,
  });
}
```

Le composant `App` est enveloppé avec `Sentry.wrap(App)` pour capturer les crashs natifs.

**Comportement :**
- Expo Go (développement) → Sentry désactivé, aucun impact sur le dev workflow
- Build EAS staging → Sentry actif, events envoyés au projet Sentry avec `environment: "staging"`
- Build EAS production → Sentry actif, events envoyés avec `environment: "production"`

---

## Infrastructure finale (côté serveur)

```
VPS 77.237.241.223
│
├── Nginx hôte (80 + 443, SSL wildcard aquacare.tech)
│   ├── api.aquacare.tech         → 127.0.0.1:8080 (PROD)
│   └── api-staging.aquacare.tech → 127.0.0.1:8081 (STAGING)
│
├── Stack PROD  (7 containers, port 8080)
│   db + redis_cache + redis_broker + api + celery_worker + celery_beat + nginx
│
└── Stack STAGING (7 containers, port 8081)
    db + redis_cache + redis_broker + api + celery_worker + celery_beat + nginx
```

---

## Ce qui reste à faire (prochaine session)

### Avant les builds EAS
1. Créer un projet **"AquaCare Mobile"** sur sentry.io → récupérer le DSN mobile
2. Ajouter `EXPO_PUBLIC_SENTRY_DSN` dans le `.env` EAS (ou directement dans `eas.json` → `env`)
3. Lancer `eas init` dans `frontend/` pour obtenir le `projectId` et remplacer `REMPLACER_PAR_EAS_PROJECT_ID` dans `app.json`

### Builds EAS
```bash
# Build staging (APK Android + IPA iOS interne)
eas build --profile staging --platform all

# Distribuer aux bêta-testeurs via TestFlight (iOS) et lien direct APK (Android)

# Build production (App Store + Google Play)
eas build --profile production --platform all
eas submit --platform all
```

---

## Commandes utiles

```bash
# Vérifier les deux environments en ligne
curl https://api.aquacare.tech/api/health/
curl https://api-staging.aquacare.tech/api/health/

# Tests locaux avant commit
cd frontend && npx tsc --noEmit       # 0 erreurs TypeScript
cd frontend && npm test -- --watchAll=false  # 542 tests

# Build EAS staging (quand prêt)
cd frontend && eas build --profile staging --platform android
```
