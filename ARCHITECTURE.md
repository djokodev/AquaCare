# ARCHITECTURE.md

Ou trouver quoi et quel pattern suivre.

## Stack

```
Backend : Django 5.1 + DRF + PostgreSQL + Celery + Redis
Frontend: React Native + Expo 53 + Redux Toolkit + TypeScript
```

## Structure Backend

```
backend/
├── aquacare_api/
│   ├── settings/          # Config Django (base, dev, prod, test)
│   └── urls.py             # Routes API
│
├── apps/
│   ├── accounts/           # Auth + profils
│   │   ├── models.py       # User (phone-based), FarmProfile
│   │   ├── validators.py   # Validation +237
│   │   └── constants.py    # Regions Cameroun
│   │
│   ├── aquaculture/        # Coeur metier
│   │   ├── domain/         # Logique metier PURE (pas de Django)
│   │   │   ├── calculators.py   # Formules FCR, biomasse, densite
│   │   │   ├── validators.py    # Regles metier
│   │   │   └── exceptions.py    # Erreurs metier
│   │   ├── services/       # Use cases (create_cycle, harvest, etc.)
│   │   ├── models.py       # ORM Django
│   │   ├── views.py        # HTTP handlers (delegue aux services)
│   │   ├── serializers.py  # Validation API
│   │   └── fixtures/       # nutritional_guides.json
│   │
│   ├── commerce/           # E-commerce
│   │   ├── domain/         # Calculateurs ROI, suggestions
│   │   ├── services/       # OrderService, ProductService
│   │   └── fixtures/       # products.json
│   │
│   ├── notifications/      # Alertes systeme
│   └── chat/               # Support technicien
│
└── docker-compose.yml      # Stack dev (db + api + redis + celery)
```

## Structure Frontend

```
frontend/src/
├── features/               # Feature-sliced design
│   ├── auth/               # Login, Register
│   ├── aquaculture/        # Cycles, logs, plans, stats
│   ├── commerce/           # Catalogue, panier, commandes
│   ├── profile/            # Profil, ferme, settings
│   ├── notifications/      # Alertes
│   └── onboarding/         # Hormozi screens
│
├── store/                  # Redux Toolkit
│   └── slices/             # auth, aquaculture, commerce, notifications
│
├── services/               # API calls
│   ├── api.ts              # Axios + intercepteurs JWT
│   └── offlineService.ts   # Sync UUID
│
├── navigation/             # React Navigation
│   └── MainNavigator.tsx   # Types dans RootStackParamList
│
├── constants/
│   ├── colors.ts           # AquaCare #059669
│   ├── aquaculture.ts      # Prix FCFA, FCR baseline
│   └── cameroon.ts         # Regions/departements
│
├── i18n/locales/           # fr.ts, en.ts
└── types/                  # TypeScript interfaces
```

## Pattern Backend : Views → Services → Domain

```
HTTP Request
    ↓
views.py          # Validation serializer, auth
    ↓
services/         # Logique metier, transactions
    ↓
domain/           # Calculs purs (testables sans Django)
    ↓
models.py         # Persistence ORM
```

**Nouvelle feature backend :**
1. Creer service dans `services/`
2. Mettre calculs dans `domain/calculators.py`
3. View delegue au service (pas de logique dans view)

## Pattern Frontend : Backend = Verite

```
User Input
    ↓
Screen            # Estimations temporaires (UX feedback)
    ↓
services/api.ts   # POST vers backend
    ↓
Backend           # Calculs officiels
    ↓
Redux Store       # Stocke reponse backend (ecrase estimations)
    ↓
Screen            # Affiche donnees backend
```

**Regle :** Frontend ne calcule JAMAIS de logique metier definitive. Backend = source de verite.

## Offline-First

```typescript
// Frontend genere UUID avant sync
const log = {
  client_uuid: uuid.v4(),  // Genere cote mobile
  cycle: cycleId,
  mortality_count: 5,
  // ...
}

// Backend deduplique via client_uuid (unique constraint)
// Si UUID existe deja → retourne existant au lieu d'erreur
```

## Auth Flow

```
Login → JWT access (15min) + refresh (7j)
        ↓
SecureStore (Expo)
        ↓
Axios interceptor ajoute "Bearer {token}"
        ↓
401 → Auto refresh → Retry request
```

## Infrastructure

### Docker (Dev)
```
backend/
├── docker-compose.yml     # docker-compose up -d
├── Dockerfile.dev         # Image dev avec hot-reload
├── Dockerfile             # Image prod optimisee
└── nginx/
    ├── nginx.conf         # Reverse proxy + static files
    └── Dockerfile         # Image Nginx
```

### CI/CD (GitHub Actions)
```
.github/workflows/
├── pull-request-tests.yml  # Tests sur PR → main
└── deploy.yml              # Push main → Build + Deploy GHCR
```

**Flux :**
```
PR → main     : Tests backend (pytest)
Push → main   : Build Docker → Push ghcr.io → Deploy serveur
```

### Production
- **API** : `http://77.237.241.223/api`
- **Registry** : `ghcr.io/{owner}/aquacare-api`
- **Nginx** : Sert `/static/` et `/media/`, proxy vers Django

---

## Nouvelles features - Checklist

### Backend
- [ ] Service dans `apps/{module}/services/`
- [ ] Calculs dans `domain/calculators.py`
- [ ] Tests dans `apps/{module}/tests/`
- [ ] View delegue au service

### Frontend
- [ ] Screen dans `features/{module}/screens/`
- [ ] Types dans `types/{module}.ts`
- [ ] Redux thunk si besoin
- [ ] Traductions fr.ts + en.ts
