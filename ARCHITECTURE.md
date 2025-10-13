# ARCHITECTURE.md

Documentation technique complete de l'architecture MAVECAM AquaCare.

---

## Table des Matieres

1. [Vue d'Ensemble](#vue-densemble)
2. [Architecture Backend (Django)](#architecture-backend-django)
3. [Architecture Frontend (React Native/Expo)](#architecture-frontend-react-nativeexpo)
4. [Flux de Donnees](#flux-de-donnees)
5. [Synchronisation Offline](#synchronisation-offline)
6. [Securite et Authentification](#securite-et-authentification)
7. [Base de Donnees](#base-de-donnees)
8. [API REST](#api-rest)
9. [Decisions Techniques](#decisions-techniques)

---

## Vue d'Ensemble

### Stack Technique

**Backend :**
- Django 4.2+ avec Django REST Framework
- SQLite (dev) / PostgreSQL (prod prevu)
- django-simple-jwt pour authentification
- pytest + pytest-django (coverage >80%)
- Python 3.10+

**Frontend :**
- React Native avec Expo SDK 51+
- TypeScript strict mode
- Redux Toolkit pour etat global
- React Navigation 6 (Stack + Tabs)
- i18next (FR/EN)
- Axios avec intercepteurs JWT
- Expo SecureStore pour tokens

**Infrastructure :**
- Nginx pour fichiers statiques (prod)
- Git pour versionning
- Contenerisation Docker prevu pour l'API

---

## Architecture Backend (Django)

### Structure du Projet

```
backend/
   mavecam_api/            # Configuration principale Django
                           Contient settings.py (config globale)
                           Contient urls.py (routage API)
                           Contient wsgi.py et asgi.py (serveurs)

   apps/                   # Applications Django modulaires
      accounts/            # Authentification et gestion profils
                           Gestion User personnalise (phone_number)
                           Gestion FarmProfile (OneToOne avec User)
                           Serializers DRF pour API
                           ViewSets avec permissions
                           Validators metier (phone Cameroun)
                           Constants (regions, departements)
                           Managers (UserManager custom)
                           Middleware (langues, timezones)
                           Backends auth personnalises

      aquaculture/         # Coeur metier aquaculture
                           Models : ProductionCycle, CycleLog, FeedingPlan, SanitaryLog, NutritionalGuide
                           Serializers DRF complexes avec read-only fields
                           ViewSets avec filtrage par utilisateur
                           Signals pour calculs automatiques (metriques cycles)
                           Calculators : logique metier FCR, biomasse, densite
                           Validators metier aquaculture
                           Constants : especes, stades, sources eau

         fixtures/         # Donnees initiales JSON
                           Guides nutritionnels MAVECAM (8 guides)
                           Chargement via management commands

         management/       # Commandes Django personnalisees
            commands/      # load_nutritional_data.py pour charger fixtures

         migrations/       # Historique schema base donnees
                           Migrations incrementales Django ORM

   locale/                 # Internationalization backend
      fr/LC_MESSAGES/      # Traductions francais
      en/LC_MESSAGES/      # Traductions anglais

   media/                  # Fichiers uploades utilisateurs
      sanitary_logs/       # Photos journal sanitaire
         2025/             # Organisation par annee/mois

   tests/                  # Tests automatises
      unit/                # Tests unitaires pytest
      fixtures/            # Donnees test
      utils/               # Helpers pour tests

   manage.py               # CLI Django
   requirements.txt        # Dependances Python
   pytest.ini              # Configuration tests
   db.sqlite3              # Base SQLite developpement
```

### Organisation Modulaire

**Principe :** Architecture Django par apps independantes et reutilisables.

**Module accounts :**
- Responsabilite : Gestion utilisateurs, authentification JWT, profils ferme
- Modeles : User (custom AbstractUser avec phone_number), FarmProfile (OneToOne)
- Specifique Cameroun : Validation phone +237, regions/departements locaux
- Authentication backends personnalises pour phone_number au lieu d'email

**Module aquaculture :**
- Responsabilite : Coeur metier production aquacole
- Modeles : ProductionCycle (cycles 60-180 jours), CycleLog (saisie quotidienne), FeedingPlan (recommandations), SanitaryLog (evenements sanitaires), NutritionalGuide (base donnees locale)
- Calculs automatiques : Signals Django recalculent metriques apres chaque log (mortalite cumul, biomasse, FCR, survie)
- Validators metier : Coherence stocking_density, pond_area_m2, species vs growth_stage
- Calculators : Logique metier isolee pour FCR, densite, projections croissance

**Dossier mavecam_api :**
- Responsabilite : Configuration globale projet Django
- Fichier settings.py : Base donnees, apps installes, middleware, JWT config, i18n, timezone Africa/Douala
- Fichier urls.py : Routage API vers apps (api/accounts/, api/aquaculture/)
- Fichiers wsgi/asgi : Serveurs production

**Dossier tests :**
- Responsabilite : Tests automatises backend
- Organisation : Tests unitaires par module, fixtures partagees, utils helpers
- Framework : pytest avec pytest-django
- Couverture : Objectif >80% sur apps/

**Dossier locale :**
- Responsabilite : Traductions backend Django
- Structure : fr/LC_MESSAGES/ et en/LC_MESSAGES/
- Usage : Messages Django admin, erreurs API multilingues

**Dossier media :**
- Responsabilite : Stockage fichiers uploades (photos)
- Organisation : sanitary_logs/ avec sous-dossiers annee/mois
- Production : Servie par Nginx directement sans passer par Django

### Modeles Cles

#### Module accounts

**User (Custom AbstractUser) :**
- Identifiant unique : phone_number (+237 Cameroun) au lieu d'email
- Types compte : individual (personne physique) ou company (entreprise)
- Champs conditionnels selon account_type :
  - Individual : first_name, last_name, age_group
  - Company : business_name, legal_status, promoter_name
- Geolocalisation complete : region, department, district, city, neighborhood
- Validation metier dans clean() : Coherence champs selon type compte
- Normalisation automatique phone_number dans save()

**FarmProfile (OneToOne avec User) :**
- UUID primary key pour synchronisation offline
- Certification MAVECAM : certification_status (pending/certified/suspended/rejected)
- Informations ferme : farm_name, total_ponds, total_area_m2, water_source, main_species, annual_production_kg
- Soft delete : is_deleted pour compatibilite sync mobile
- Creation automatique via signal post_save sur User

#### Module aquaculture

**ProductionCycle :**
- UUID client genere cote mobile pour offline-first
- Cycle production aquacole typique : 60-180 jours
- Especes supportees : tilapia, clarias
- Stades croissance : alevin, juvenile, croissance, finition
- Calculs automatiques via signals Django :
  - total_fish_remaining (empoissonnement - mortalite cumul)
  - total_mortality_count, mortality_rate
  - current_biomass_kg, density_per_m2
  - total_feed_distributed_kg, fcr (Feed Conversion Ratio)
  - survival_rate, roi_percentage
- Actions recolte : harvest_quantity_kg, harvest_revenue, harvest_date
- Statut : active (en cours), completed (recolte), archived

**CycleLog (Journal quotidien) :**
- UUID client pour offline-first
- Metadata synchronisation : created_offline, synced_at, client_uuid
- Donnees quotidiennes saisies :
  - mortality_count, weight_sample_g, fish_count_sample
  - feed_distributed_kg, feed_type, feed_cost
  - water_temperature, ph_level, dissolved_oxygen
- Deduplication : client_uuid unique constraint evite doublons sync
- Relation FK vers ProductionCycle

**FeedingPlan :**
- Calcul automatique selon poids moyen, espece, stade, temperature
- Planning alimentaire : meals_per_day, recommended_feed_kg_per_day
- Optimisation FCR : Objectif passer de 3.5 a 1.8
- Genere pour chaque cycle actif

**SanitaryLog :**
- Evenements sanitaires : maladie, traitement, vaccination, mortalite massive
- Support upload photos : sanitary_image stocke dans media/sanitary_logs/
- Geolocalisation : latitude, longitude pour tracabilite
- Relation FK vers ProductionCycle

**NutritionalGuide :**
- Base donnees locale : 8 guides MAVECAM (4 Tilapia + 4 Clarias)
- Recherche par espece et stade croissance
- Donnees : produits recommandes, FCR attendu, notes alimentation
- Chargement via fixture JSON et management command

### Signals Django

**Principe :** Calculs automatiques et actions declenchees apres operations base donnees.

**apps/accounts/signals.py :**
- Signal post_save sur User cree automatiquement FarmProfile a l'inscription
- Garantit chaque utilisateur a un profil ferme associe

**apps/aquaculture/signals.py :**
- Signal post_save sur CycleLog recalcule metriques ProductionCycle apres chaque log quotidien
- Mise a jour automatique : total_mortality_count, current_biomass_kg, fcr, density_per_m2, survival_rate
- Maintient coherence donnees sans intervention manuelle

### Validations Metier

**Principe :** Toutes validations metier dans methode clean() des modeles Django.

**Exemples validations :**
- User : Champs conditionnels selon account_type (business_name requis si company)
- User : Hierarchie geographique coherente (region � department � district � city)
- FarmProfile : total_ponds > 0 si production declaree
- ProductionCycle : stocking_density coherent avec pond_area_m2 et stocking_count
- CycleLog : mortality_count ne peut pas depasser total_fish_remaining

---

## Architecture Frontend (React Native/Expo)

### Structure du Projet

```
frontend/
   src/                    # Code source application
      navigation/          # Navigation React Navigation
                           MainNavigator.tsx : Configuration Stack + Tabs
                           Types navigation TypeScript

      screens/             # Ecrans application organises par module
         auth/             # Authentification
                           LoginScreen, RegisterScreen

         main/             # Ecrans principaux
                           DashboardScreen (tableau bord aquaculture)

         profile/          # Gestion profils utilisateur
                           ProfileScreen (profil utilisateur)
                           FarmProfileScreen (profil ferme)
                           SettingsScreen (parametres app)

         aquaculture/      # Module aquaculture complet
                           NewCycleScreen : Creation nouveaux cycles
                           DailyLogScreen : Saisie quotidienne
                           DailyLogHistoryScreen : Historique logs
                           SanitaryLogScreen : Journal sanitaire avec photos
                           CycleHistoryScreen : Historique cycles recoltes
                           NotificationsScreen : Notifications systeme
                           FeedingPlanScreen : Plans alimentation automatiques
                           StatisticsScreen : Analytics et KPIs
                           NutritionalGuidesScreen : Guides nutritionnels MAVECAM

         LoadingScreen.tsx : Ecran chargement initial

      store/               # Redux Toolkit state management
         store.ts          : Configuration Redux store globale
         slices/           : Redux slices modulaires
            authSlice.ts : Authentification, user, farmProfile, tokens
            aquacultureSlice.ts : Cycles, logs, donnees aquaculture
            notificationSlice.ts : Notifications avec unreadCount

      services/            # Services externes
         api.ts            : Client Axios avec intercepteurs JWT
                           Gestion automatique refresh token
                           Ajout auto token dans headers

      i18n/                # Internationalisation
         index.ts          : Configuration i18next
         locales/          : Fichiers traductions
            fr.ts          : Traductions francais (langue principale)
            en.ts          : Traductions anglais

      components/          # Composants reutilisables
         common/           : Composants generiques
                           CustomPicker : Selecteur personnalise
                           LocationSelector : Selecteur regions/departements Cameroun
         modals/           : Composants modales

      types/               # Definitions TypeScript
         models.ts         : Interfaces User, FarmProfile, ProductionCycle, etc.

      constants/           # Constantes application
         api.ts            : URLs API, configuration
         colors.ts         : Palette couleurs MAVECAM

      hooks/               # Custom React hooks
                           Hooks reutilisables pour logique partagee

   assets/                 # Assets statiques
                           Images, icons, fonts

   App.tsx                 # Point entree application
   package.json            # Dependances npm
   tsconfig.json           # Configuration TypeScript strict mode
   app.json                # Configuration Expo
   babel.config.js         # Configuration Babel
   metro.config.js         : Configuration Metro bundler
```

### Organisation par Modules

**Principe :** Architecture React Native modulaire par fonctionnalites metier.

**Dossier screens/ :**
- Organisation par domaine metier : auth, main, profile, aquaculture
- Chaque screen est composant React autonome avec logique locale
- Acces Redux via hooks useSelector et useDispatch
- Navigation typee avec TypeScript

**Dossier screens/aquaculture/ :**
- Module complet gestion aquaculture (9 screens)
- Couvre cycle complet : creation cycle, saisie quotidienne, recolte, analytics
- Ecrans specialises : alimentation, sanitaire, statistiques, guides
- Interface optimisee pour utilisateurs peu alphabetises (icones + texte)

**Dossier store/ :**
- Redux Toolkit pour state management global
- Slices modulaires : auth, aquaculture, notifications
- Actions asynchrones (thunks) pour appels API
- Persist state avec AsyncStorage pour offline

**Dossier services/ :**
- Client API Axios centralise dans api.ts
- Intercepteur requete : Ajoute automatiquement token JWT
- Intercepteur reponse : Gere refresh token automatique sur 401
- Timeout 10000ms, baseURL configurable

**Dossier i18n/ :**
- Internationalisation complete FR/EN avec i18next
- Fichiers traductions separes par langue
- Support interpolation, pluralization
- Changement langue dynamique dans SettingsScreen

**Dossier components/ :**
- Composants reutilisables partages entre screens
- common/ : Composants generiques (pickers, selectors)
- modals/ : Composants modales reutilisables
- Respect charte graphique MAVECAM

**Dossier types/ :**
- Definitions TypeScript centralisees
- Interfaces models alignees avec backend Django
- Types navigation pour React Navigation
- Garantit type safety dans toute l'app

**Dossier navigation/ :**
- Configuration React Navigation centralisee
- Stack Navigator principal avec Tab Navigator imbrique
- Types navigation TypeScript pour securite compile-time
- Gestion authentification (screens conditionnels)

### Navigation

**Architecture :**
- RootStack : Stack Navigator principal
  - Screens auth : Login, Register (si non authentifie)
  - MainTabs : Tab Navigator (si authentifie)
    - Tab Dashboard : DashboardScreen
    - Tab Profile : ProfileStack (Stack imbrique)
  - Screens modales : DailyLog, NewCycle, Notifications, etc.

**Type Safety :**
- Types navigation definis dans RootStackParamList
- Navigation typee avec TypeScript pour securite compile-time
- Autocompletion IDE sur navigation.navigate()

### Redux Store

**Structure State Global :**
- auth slice : user, farmProfile, token, isAuthenticated, loading
- aquaculture slice : cycles, currentCycle, logs, loading
- notifications slice : items, unreadCount

**Actions Asynchrones (Thunks) :**
- authSlice : loginUser (POST /api/accounts/login/, stocke tokens SecureStore)
- aquacultureSlice : fetchCycles, createCycle, createLog
- Gestion erreurs avec rejected state

**Persistence :**
- Redux persist avec AsyncStorage
- Stocke state local pour offline
- Tokens JWT dans SecureStore separes (securite)

### Service API (Axios)

**Configuration Client :**
- Client Axios avec baseURL vers backend Django
- Timeout 10000ms pour zones rurales
- Headers par defaut : Content-Type application/json

**Intercepteur Requete :**
- Ajoute automatiquement token JWT dans header Authorization
- Recupere access_token depuis SecureStore
- Format : "Bearer {access_token}"

**Intercepteur Reponse :**
- Gere refresh token automatique sur erreur 401
- Recupere refresh_token depuis SecureStore
- POST /api/accounts/token/refresh/ pour obtenir nouveau access_token
- Retry requete originale avec nouveau token
- Logout automatique si refresh echoue

---

## Synchronisation Offline

### Principe Offline-First

**Objectif :** Utilisateurs camerounais en zones rurales sans connexion stable.

**Strategie :**
1. UUID client genere cote mobile avant sync
2. Stockage local immediate Redux + AsyncStorage
3. Deduplication serveur via client_uuid unique constraint
4. Metadata sync : created_offline, synced_at

### Schema UUID

**Backend (CycleLog model) :**
- Champ client_uuid de type UUIDField
- Contrainte unique pour deduplication
- Nullable et blank (optionnel)
- Genere cote client pour sync offline

**Frontend (creation log) :**
- Utilise librairie uuid v4 pour generer UUID unique
- Cree objet log avec client_uuid avant POST API
- Stockage local immediate dans Redux
- Tentative sync immediate vers API
- Si succes : marque log comme synced
- Si erreur : reste en attente sync ulterieure

### Gestion Conflits

**Scenario 1 : Doublon UUID**
- Backend serializer verifie existence client_uuid avant creation
- Si client_uuid existe deja : retourne objet existant au lieu d'erreur
- Evite creation doublons lors syncs repetees

**Scenario 2 : Sync retardee**
- Frontend maintient queue de sync (logs en attente)
- Hook useEffect surveille statut connexion
- Si online ET queue non-vide : tente sync tous les logs pendants
- Si succes : retire log de queue
- Si erreur : log reste en attente prochain sync

---

## Securite et Authentification

### JWT Tokens

**Configuration Backend :**
- Localisation : mavecam_api/settings.py avec SIMPLE_JWT
- ACCESS_TOKEN_LIFETIME : 15 minutes
- REFRESH_TOKEN_LIFETIME : 7 jours
- ROTATE_REFRESH_TOKENS : True (rotation automatique)
- BLACKLIST_AFTER_ROTATION : True (securite)
- ALGORITHM : HS256

**Endpoints :**
- POST /api/accounts/login/ : Retourne access, refresh, user, farm_profile
- POST /api/accounts/token/refresh/ : Retourne nouveau access token
- POST /api/accounts/logout/ : Blacklist refresh token

### Stockage Securise Mobile

**Expo SecureStore :**
- Module : expo-secure-store
- Operations : setItemAsync, getItemAsync, deleteItemAsync
- Stockage : access_token et refresh_token separes
- Chiffrement hardware : Keychain iOS, Keystore Android
- Persistence offline garantie
- Plus securise que AsyncStorage classique

### Permissions API

**Backend DRF :**
- Permission class : IsAuthenticated sur tous ViewSets
- Filtrage automatique queryset par utilisateur authentifie
- ProductionCycleViewSet filtre par farm_profile__user=request.user
- Isolation complete : chaque utilisateur voit uniquement SES donnees

---


## API REST

### Endpoints Principaux

**Authentification :**
- POST /api/accounts/register/ : Inscription
- POST /api/accounts/login/ : Connexion
- POST /api/accounts/token/refresh/ : Refresh JWT
- POST /api/accounts/logout/ : Deconnexion
- GET /api/accounts/profile/ : Profil utilisateur

**Aquaculture :**
- GET /api/aquaculture/cycles/ : Liste cycles utilisateur
- POST /api/aquaculture/cycles/ : Creer cycle
- GET /api/aquaculture/cycles/{uuid}/ : Detail cycle
- PATCH /api/aquaculture/cycles/{uuid}/ : Modifier cycle
- POST /api/aquaculture/cycles/{uuid}/harvest/ : Action recolte
- GET /api/aquaculture/logs/ : Liste logs
- POST /api/aquaculture/logs/ : Creer log quotidien
- GET /api/aquaculture/feeding-plans/ : Plans alimentation
- GET /api/aquaculture/nutritional-guides/ : Guides nutritionnels

### Serializers DRF

**Pattern ProductionCycleSerializer :**
- Herite de ModelSerializer
- Champs read-only calcules : total_fish_remaining, current_biomass_kg, fcr
- Meta fields : '__all__'
- Read-only fields : id, created_at, updated_at
- Validations metier dans methode validate()

### Filtrage et Pagination

**ViewSet ProductionCycleViewSet :**
- Herite de ModelViewSet
- Permission : IsAuthenticated
- Filter backends : SearchFilter, OrderingFilter
- Search fields : cycle_name, species
- Ordering fields : stocking_date, created_at
- Pagination : PageNumberPagination
- Queryset filtre par farm_profile__user=request.user
- Ordre decroissant par stocking_date

---



## Glossaire Technique

**FCR (Feed Conversion Ratio) :** Ratio aliment distribue / gain poids poisson. Objectif <1.8.

**Offline-First :** Architecture privilegiant fonctionnement sans connexion, sync posterieure.

**UUID Client :** Identifiant unique genere cote mobile pour deduplication sync.

**Defensive Programming :** Verification systematique proprietes optionnelles.

**Signal Django :** Hook declencheur automatique apres save/delete model.

**Thunk Redux :** Action asynchrone Redux.

**SecureStore :** Stockage chiffre Expo pour tokens sensibles.

---

**Derniere mise a jour :** 2025-10-13
**Maintenu par :** Djoko Christian
