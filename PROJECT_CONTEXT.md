# PROJECT_CONTEXT.md

Journal chronologique des modifications et decisions techniques du projet MAVECAM AquaCare.

## Format des Entrees

Chaque entree contient :
- **Date** : Date de la modification (YYYY-MM-DD)
- **Type** : `Feature` | `Fix` | `Refactor` | `Docs` | `Perf` | `Test` | `Chore`
- **Module** : `Backend` | `Frontend` | `Both` | `DevOps` | `Docs`
- **Commit Hash** : Hash git pour reference
- **Description** : Courte description
- **Details** : Changements detailles (Added/Changed/Fixed/Removed)
- **Decisions Techniques** : Pourquoi X plutot que Y (optionnel)
- **Impact Metier** : Benefices utilisateurs (optionnel)

---

## Changelog (Ordre Chronologique)

### [2025-08-25] - Initial Commit - Architecture Complete Backend + Frontend
**Type:** `Feature` | **Module:** `Both` | **Commit:** `6ba8b0d`

#### Added
**Backend Complete :**
- Module **accounts** complet avec authentification JWT
  - Custom User Model avec telephone comme identifiant unique
  - FarmProfile (one-to-one avec User)
  - Validation telephone Cameroun (+237)
  - JWT tokens (access 15min, refresh 7 jours)
  - Middleware custom pour gestion sessions
  - Admin Django personnalise
- Module **aquaculture** complet
  - ProductionCycle, CycleLog, CycleMetrics
  - FeedingPlan, SanitaryLog, HarvestAction
  - Calculators sophistiques (FCR, biomasse, densite, projections)
  - Signals pour automation (notifications, calculs auto)
  - Validators metier (parametres eau, poids, mortalite)
  - Fixtures guides nutritionnels (8 guides MAVECAM)
  - Management command `load_nutritional_data`
- Tests unitaires complets (pytest)
  - 287 lignes tests accounts
  - 466 lignes tests aquaculture models
  - 648 lignes tests signals
  - 753 lignes tests views
  - Coverage 80%+
- Configuration production-ready
  - Settings Django optimises
  - Support i18n (FR/EN)
  - Timezone Africa/Douala
  - CORS, JWT, REST Framework

**Frontend Complete :**
- Architecture React Native + Expo
  - Navigation (Auth + Main avec tabs)
  - Redux Toolkit pour state management
  - i18next pour bilinguisme FR/EN
- Ecrans authentification
  - LoginScreen (434 lignes)
  - RegisterScreen (592 lignes)
- Ecrans profil
  - ProfileScreen (839 lignes)
  - FarmProfileScreen (580 lignes)
  - SettingsScreen (487 lignes)
- Services
  - authService avec JWT auto-refresh
  - api.ts avec Axios interceptors
  - SecureStore pour tokens offline
- Dashboard initial (237 lignes)
- TypeScript strict complet

#### Technical Decisions
**Pourquoi Custom User avec telephone ?**
- Cible Cameroun : telephone plus accessible qu'email
- Validation format +237 integree
- Backend custom authentication

**Pourquoi offline-first ?**
- Zones rurales Cameroun avec reseau intermittent
- UUID client-generated pour creation offline
- Sync metadata (created_offline, synced_at, client_uuid)

**Pourquoi Redux Toolkit ?**
- State complexe (auth, cycles, notifications)
- DevTools pour debugging
- Pattern mature et scalable

#### Impact Metier
- Fondations solides pour tout le projet
- Architecture professionnelle et scalable
- Tests garantissant fiabilite
- Bilinguisme natif (marche anglophone/francophone)

**Fichiers crees :** 103 fichiers, +31,729 lignes

---

### [2025-09-02] - Ameliorations UX + Traductions Completes
**Type:** `Refactor` | **Module:** `Frontend` | **Commit:** `55b6d7a`

#### Added
- Endpoint backend `/auth/user-profile/` pour profil complet
- 115 nouvelles cles traduction FR
- 115 nouvelles cles traduction EN
- Amelioration hook `useAuth` avec gestion erreurs robuste

#### Changed
- Refactorisation ProfileScreen (212 lignes → plus lisible)
- Refactorisation FarmProfileScreen (176 lignes optimisees)
- Refactorisation SettingsScreen (324 lignes optimisees)
- DashboardScreen simplifie (75 lignes enlevees)
- LoadingScreen avec meilleure UX
- i18n.ts avec fallback ameliore

#### Removed
- Code duplique dans ecrans profil
- Logique auth dispersee (centralisee dans useAuth)

#### Technical Decisions
**Pourquoi refactoriser si tot ?**
- Detection code smell apres premiers tests
- Centralisation logique auth pour maintenabilite
- Preparation ajout fonctionnalites aquaculture

#### Impact Metier
- UX amelioree pour onboarding pisciculteurs
- Maintenance facilitee pour evolutions futures

**Fichiers modifies :** 19 fichiers, +767 lignes, -605 lignes

---

### [2025-09-12] - Configuration Geographique Cameroun
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `95224aa`

#### Added
- Fichier `constants/cameroon.ts` avec toutes regions/departements (903 lignes)
  - 10 regions completes
  - 58 departements
  - Structure hierarchique pour pickers
- Component `CustomPicker` reutilisable (224 lignes)
- Champ `activity_type` enrichi backend (migration 0002)

#### Changed
- RegisterScreen avec pickers regions/departements
- ProfileScreen avec edition localisation
- Backend constants avec nouveau type activite

#### Technical Decisions
**Pourquoi donnees Cameroun statiques ?**
- Pas de changement frequent regions/departements
- Performance : pas d'API call
- Offline-first : disponible sans reseau
- Source fiable : donnees officielles gouvernement

**Pourquoi CustomPicker component ?**
- Reutilisabilite (regions, departements, especes, etc.)
- UX consistante sur toute l'app
- Style MAVECAM uniforme

#### Impact Metier
- Precision geographique pour analytics regionaux futurs
- Facilite onboarding (pas de saisie manuelle)
- Preparation statistiques par region

**Fichiers modifies :** 15 fichiers, +1,521 lignes, -123 lignes

---

### [2025-09-XX] - Optimisations UI Profil
**Type:** `Refactor` | **Module:** `Frontend` | **Commit:** `70a38e5`

#### Changed
- Modifications presentation ecrans profil
- Ameliorations visuelles mineures

---

### [2025-09-XX] - Simplification UX Profil Personnel
**Type:** `Refactor` | **Module:** `Frontend` | **Commit:** `de2bb54`

#### Removed
- Icons superflus section informations personnelles
- Icons section localisation (simplification UI)

#### Technical Decisions
**Pourquoi enlever icons ?**
- Feedback utilisateurs : interface trop chargee
- Cible peu alphabetisee prefere texte clair
- Gain espace ecran mobile

---

### [2025-09-XX] - Edition Nom Ferme
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `8d8e04f`

#### Added
- Edition nom ferme dans FarmProfileScreen
- Validation donnees ferme

---

### [2025-10-XX] - Dashboard Connecte API
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `6c88b48`

#### Added
- Dashboard connecte backend Django
- Metriques temps reel (cycles actifs, biomasse, FCR moyen)
- Gestion erreurs et etats chargement

#### Impact Metier
- Vision globale exploitation en 1 ecran
- Decisions basees donnees reelles vs intuition

---

### [2025-10-XX] - Commit Intermediaire
**Type:** `Chore` | **Module:** `Both` | **Commit:** `8b8516e`

#### Changed
- Commit de sauvegarde travaux en cours

---

### [2025-10-XX] - Creation Cycle via Frontend
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `1cdbe4b`

#### Added
- Formulaire creation cycle complet
- Validation donnees avant soumission
- Connexion API `/production-cycles/`

#### Impact Metier
- Autonomie pisciculteurs (pas besoin technicien)
- Demarrage cycle immediat → gain temps

---

### [2025-10-XX] - Saisie du Jour & Historique
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `3821bf8`

#### Added
- Ecran saisie quotidienne (mortalite, croissance, parametres eau)
- Ecran historique des saisies avec graphiques
- Connexion API backend complete

#### Impact Metier
- Suivi quotidien simplifie → adoption terrain
- Visualisation tendances → detection anomalies rapide

---

### [2025-10-XX] - Ecran Journal Sanitaire
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `348827a`

#### Added
- Connexion SanitaryScreen au backend Django
- Upload photos evenements sanitaires
- Geolocalisation evenements

#### Impact Metier
- Tracabilite sante poissons
- Support decision veterinaire a distance (photos)
- Detection precoce maladies

---

### [2025-10-XX] - Recolte de Cycle & Historique
**Type:** `Feature` | **Module:** `Both` | **Commit:** `08fa851`

#### Added
- **Modal de Recolte** : Saisie detaillee recolte avec calculs automatiques
- **CycleHistoryScreen** : Historique complet cycles recoltes
- **Calculs automatiques** : FCR reel, taux survie, biomasse finale, ROI
- Migration Django : Nouveaux champs `CycleMetrics` pour metriques finales
- Comparaisons cycles (meilleur/pire performance)
- Filtrage par espece et periode

#### Changed
- Dashboard : Bouton "Recolter" pour cycles actifs
- Modele `CycleMetrics` enrichi avec champs recolte
- `frontend/.gitignore` : Ajout patterns Expo/React Native

#### Removed
- 90 lignes obsoletes dans CLAUDE.md (nettoyage)

#### Technical Decisions
**Pourquoi modal au lieu d'ecran dedie ?**
- Action critique necessitant focus utilisateur
- Moins de navigation → UX simplifiee
- Validation immediate avant soumission
- Pattern mobile standard pour actions importantes

#### Impact Metier
- **Tracabilite complete** performances aquaculture
- **Aide decision** basee sur historique reel
- **Certification MAVECAM** facilitee par donnees
- **ROI visible** → motivation pisciculteurs

**Fichiers modifies :** 13 fichiers, +1,492 lignes, -99 lignes

---

### [2025-10-XX] - Ecran Notifications Frontend
**Type:** `Feature` | **Module:** `Frontend` | **Commit:** `878a35e`

#### Added
- **NotificationsScreen** : Interface complete gestion notifications
- Filtrage par type (info, warning, critical, success)
- Marquage lu/non-lu avec compteur badge
- Suppression notifications traitees
- Redux slice `notificationSlice` pour etat global
- Synchronisation temps reel avec backend

#### Changed
- Dashboard enrichi avec bouton notifications + badge compteur
- CLAUDE.md mis a jour avec etat avancement module Aquaculture

#### Technical Decisions
**Pourquoi Redux pour notifications ?**
- Etat partage entre Dashboard, NotificationsScreen, Badge
- Synchronisation automatique sur actions utilisateur
- Persistence locale possible (SecureStore) pour offline
- Pattern standard Redux Toolkit (maintenabilite)

#### Impact Metier
- Visibilite immediate alertes critiques
- Amelioration reactivite pisciculteurs
- Tracabilite actions prises sur notifications

**Fichiers modifies :** 11 fichiers, +1,096 lignes

---

### [2025-10-XX] - Plan d'Alimentation Automatise
**Type:** `Feature` | **Module:** `Both` | **Commit:** `d40b22f`

#### Added
- **FeedingPlanScreen** : Generation automatique plans alimentation
- Calculs rations selon poids/espece/temperature/age
- Calendriers personnalises par cycle avec recommandations quotidiennes
- Estimation couts alimentaires et ROI previsionnels
- Interface selection cycle intuitive

#### Changed
- Refactorisation `aquacultureService.ts` pour meilleure organisation
- Ajout 24 nouvelles cles traduction FR/EN

#### Technical Decisions
**Pourquoi calculs cote frontend ET backend ?**
- **Frontend** : Retour immediat interface utilisateur (UX)
- **Backend** : Source de verite pour recommandations officielles MAVECAM
- **Compromis** : Validation backend + calculs locaux pour offline

#### Impact Metier
- Objectif FCR : **3.5 → 1.8** (economie 50% aliments)
- Planification scientifique vs approximative
- Professionnalisation pratiques aquaculture

**Fichiers modifies :** 8 fichiers, +766 lignes

---

### [2025-10-XX] - Notifications Alimentation Intelligentes
**Type:** `Feature` | **Module:** `Backend` | **Commit:** `95c166f`

#### Added
- Systeme notifications proactives pour alimentation
- Algorithme detection anomalies (sous-alimentation, sur-alimentation)
- Suggestions optimisation FCR basees sur donnees reelles

#### Changed
- `backend/apps/aquaculture/views.py` : Logique notifications enrichie (+79 lignes)

#### Technical Decisions
**Pourquoi generer notifications cote backend ?**
- Calculs complexes (FCR, biomasse) necessitent acces base complete
- Coherence donnees multi-dispositifs
- Decharge batterie mobile
- Permet evolution vers ML/IA predictive

#### Impact Metier
- Alertes proactives → prevention problemes alimentation
- Economie aliments → reduction couts 15-20%
- Amelioration FCR ciblee par notification

**Fichiers modifies :** 1 fichier, +79 lignes

---

### [2025-01-XX] - Guide Nutritionnel MAVECAM
**Type:** `Feature` | **Module:** `Both` | **Commit:** `79f8f7c`

#### Added
- **NutritionalGuidesScreen** : Acces offline aux 8 guides nutritionnels MAVECAM
- **StatisticsScreen** : Analytics avancees sur cycles recoltes
- Base de donnees nutritionnelle locale (4 Tilapia + 4 Clarias)
- Recherche par espece et texte libre
- Interface expansion/contraction des details techniques
- Catalogue PDF `CATALOGUE ALIMENT POISSONS.pdf` integre

#### Changed
- `backend/apps/aquaculture/views.py` : Endpoint `/nutritional-guides/`
- Ajout 57 nouvelles cles traduction FR/EN
- Navigation principale enrichie avec 2 nouveaux ecrans

#### Technical Decisions
**Pourquoi fixtures JSON plutot qu'API externe ?**
- **Offline-first** : Pas de dependance reseau (zones rurales Cameroun)
- **Performance** : Pas de latence reseau
- **Simplicite** : `python manage.py load_nutritional_data`
- **Controle** : Donnees MAVECAM validees et versionnees

#### Impact Metier
- Acces instantane aux recommandations MAVECAM en zone rurale
- Reduction erreurs alimentation → meilleur FCR attendu
- Autonomie pisciculteurs meme sans connexion internet

**Fichiers modifies :** 11 fichiers, +1,538 lignes

---

### [2025-01-11] - Reorganisation Documentation Projet
**Type:** `Docs` | **Module:** `Docs` | **Commit:** `En cours`

#### Added
- Creation `PROJECT_CONTEXT.md` pour changelog structure chronologique
- Creation `ARCHITECTURE.md` pour documentation architecture technique (a venir)
- Creation `DESIGN_SYSTEM.md` pour charte graphique et styles (a venir)
- Creation `DEPLOYMENT.md` pour configuration production (a venir)
- Creation `DONT_DO.md` pour memoire des erreurs/echecs (a venir)
- Creation commandes personnalisees `.claude/commands/` pour workflow optimise

#### Changed
- CLAUDE.md recentre uniquement sur regles pour Claude Code
- Structure documentation separee par domaine

#### Technical Decisions
**Pourquoi separer la documentation ?**
- CLAUDE.md trop volumineux (496 lignes) → difficulte maintenance
- Meilleure organisation avec fichiers specialises par domaine
- Facilite onboarding nouveaux developpeurs
- Permet versioning changelog independant
- Ameliore collaboration avec Claude Code (regles vs contexte vs historique)

**Inspiration Reddit Best Practices :**
- Context7 pour packages matures et maintenus
- Git diff review avant commits
- Changelog apres validation features
- Commandes personnalisees pour taches repetitives
- Regle "Fix sans rien changer d'autre"
- Agents distincts front/back
- Commits atomiques apres chaque feature
- Fichier DONT_DO.md pour memoire echecs

---

## Statistiques Projet

### Resume Commits
- **Total commits** : 16
- **Commits features majeures** : 12
- **Commits refactoring** : 3
- **Commits docs** : 1

### Lignes de Code (estimation)
- **Backend** : ~15,000 lignes (accounts + aquaculture + tests)
- **Frontend** : ~10,000 lignes (screens + services + navigation)
- **Total ajoutees** : ~35,000+ lignes sur 5 mois

### Modules Implementes
| Module | Etat | Fonctionnalites | Tests |
|--------|------|-----------------|-------|
| **accounts** | 100% | Auth JWT, User, FarmProfile | 635 lignes tests |
| **aquaculture** | 100% | Cycles, Logs, Plans, Recolte | 2,250+ lignes tests |
| **notifications** | 100% | Filtrage, Marquage, Redux | - |
| **guides** | 100% | 8 guides offline, Recherche | - |
| **statistics** | 100% | Analytics, KPIs, Comparaisons | - |
| **commerce** | 0% | A developper (Phase 2) | - |
| **support** | 0% | A developper (Phase 2) | - |

---

## Decisions Techniques Majeures

### 1. Architecture Offline-First
**Decision :** UUID client-side + sync metadata
**Pourquoi :** Zones rurales Cameroun avec connexion intermittente
**Impact :** Utilisabilite 100% offline, sync automatique au retour reseau

### 2. Fixtures JSON pour Donnees Reference
**Decision :** Guides nutritionnels en fixtures Django
**Pourquoi :** Performance + offline + controle version
**Impact :** Chargement instant, pas de dependance API externe

### 3. Redux Toolkit pour Etat Global
**Decision :** Redux plutot que Context API
**Pourquoi :** Ecrans complexes (Dashboard, Stats), DevTools, Pattern mature
**Impact :** Debugging facilite, scalabilite assuree

### 4. TypeScript Strict
**Decision :** `strict: true` dans tsconfig.json
**Pourquoi :** Prevention bugs runtime, auto-completion IDE
**Impact :** Qualite code, maintenance et inspection facile par AI

### 5. Django REST Framework
**Decision :** DRF plutot que Django vanilla ou FastAPI
**Pourquoi :** Serializers robustes, auth JWT mature, doc auto, framework mature
**Impact :** API professionnelle et evolutive

### 6. Phone-Based Authentication
**Decision :** Telephone comme identifiant unique (pas email)
**Pourquoi :** Penetration mobile 90%+ au Cameroun vs email ~30%
**Impact :** Accessibilite maximale pour pisciculteurs ruraux

### 7. Tests Unitaires Systematiques
**Decision :** Pytest avec coverage 80%+ obligatoire
**Pourquoi :** Calculs metier critiques (FCR, biomasse, ROI)
**Impact :** Fiabilite donnees, confiance utilisateurs, maintenance facilitee

---

## Conventions Projet

### Commit Messages
```
<type>(<scope>): <description courte>

<details optionnels>
<breaking changes si applicable>
```

**Types :** feat, fix, refactor, docs, perf, test, chore
**Scopes :** backend, frontend, api, ui, auth, aquaculture, etc.

---

## Roadmap

### Phase 0 : Module Accounts (COMPLETE)
- [x] Custom User Model (telephone +237)
- [x] Authentification JWT (access 15min, refresh 7j)
- [x] FarmProfile (one-to-one avec User)
- [x] Gestion Profils Utilisateur & Ferme
- [x] Configuration Geographique Cameroun
- [x] Bilinguisme FR/EN complet
- [x] Offline-First avec SecureStore
- [x] Tests unitaires (635 lignes)

### Phase 1 : Module Aquaculture Core (COMPLETE)
- [x] Dashboard Intelligent temps reel
- [x] Gestion Cycles Production complete
- [x] Saisie Quotidienne & Historique
- [x] Journal Sanitaire avec photos
- [x] Plan Alimentation automatise
- [x] Notifications Proactives
- [x] Guides Nutritionnels Offline (8 guides)
- [x] Statistiques & Analytics avancees
- [x] Recolte & Historique cycles
- [x] Tests unitaires (2,250+ lignes)

### Phase 2 : Commerce (EN ATTENTE)
- [ ] Catalogue produits MAVECAM
- [ ] Gestion commandes aliments

### Phase 3 : Support Technique (EN ATTENTE)
- [ ] Chat technicien MAVECAM temps reel
- [ ] Systeme tickets support

---

**Derniere mise a jour :** 2025-01-11
**Maintenu par :** Djoko Christian
**Version :** 1.0
