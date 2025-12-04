# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

### **RÈGLE FONDAMENTALE**
**TOUJOURS consulter et utiliser la documentation officielle de chaque librairie/framework avant d'écrire du code.**

### **Documentations Officielles à Consulter Systématiquement**

#### **Backend Django/Python**
- **Django REST Framework** : https://www.django-rest-framework.org/
- **Django** : https://docs.djangoproject.com/
- **django-simple-jwt** : https://django-rest-framework-simplejwt.readthedocs.io/
- **PostgreSQL + Django** : https://docs.djangoproject.com/en/stable/ref/databases/#postgresql
- **pytest** : https://docs.pytest.org/
- **Pillow (images)** : https://pillow.readthedocs.io/

#### **Frontend React Native/Mobile**
- **React Native** : https://reactnative.dev/docs/
- **Expo** : https://docs.expo.dev/
- **React Navigation** : https://reactnavigation.org/docs/
- **Redux Toolkit** : https://redux-toolkit.js.org/
- **React Redux** : https://react-redux.js.org/
- **Axios** : https://axios-http.com/docs/
- **Expo SecureStore** : https://docs.expo.dev/versions/latest/sdk/securestore/
- **i18next** : https://www.i18next.com/


### **Processus de Développement Obligatoire**

1. **AVANT d'écrire du code** :
   - Utiliser WebFetch ou WebSearch pour consulter la documentation officielle
   - Vérifier les bonnes pratiques actuelles et patterns recommandés
   - Identifier la méthode/approche officiellement recommandée

2. **PENDANT le développement** :
   - Suivre strictement les conventions de la librairie
   - Utiliser les méthodes/composants recommandés dans la doc
   - Respecter la structure de fichiers et patterns suggérés

3. **Format de Requête Documentation** :
```
WebFetch(
  url: "https://docs.officielle.com/section-pertinente",
  prompt: "Comment implémenter [fonctionnalité] selon les bonnes pratiques officielles ?"
)
```

4. **APRÈS chaque modification de fichier** :
   - OBLIGATOIRE: Exécuter `npx tsc --noEmit` pour vérifier les erreurs TypeScript
   - OBLIGATOIRE: Tester la compilation avec `npm run web` pour les modifications critiques
   - OBLIGATOIRE: Ne jamais marquer une tâche comme terminée sans vérification
   - OBLIGATOIRE: Signaler immédiatement toute erreur détectée
   - OBLIGATOIRE: Supprimer TOUS les console.log de débogage après validation du code

5. **Toujours analyser la code base actuelle lors d'une nouvelle requette dans un nouveau chat et pour chaque fonctionnalites developper, tu dois mettre cela a jour dans ce fichier afin que la comprehension par n nouveau chat soit parfaite, donc toujours mettre ce fichier a jour en fonction de l'avancement actuel (apres ma confirmation biensur)**

### **Interdictions Strictes**
- ❌ Écrire du code sans consulter la documentation officielle
- ❌ Utiliser des patterns obsolètes ou non-officiels
- ❌ Solutions "qui marchent" mais non-conformes aux standards
- ❌ Code basé uniquement sur la mémoire ou des exemples non-officiels
- ❌ **CRITIQUE : Utiliser des packages NON compatibles avec Expo et Expo Go**

### **RÈGLE FONDAMENTALE - COMPATIBILITÉ EXPO**

**🚨 CONTRAINTE TECHNIQUE OBLIGATOIRE :**

**TOUS les packages utilisés dans ce projet DOIVENT être compatibles avec Expo et Expo Go.**

#### ✅ Packages autorisés
- Packages officiels Expo (`expo-*`)
- Packages listés dans [Expo SDK Documentation](https://docs.expo.dev/versions/latest/)
- Packages supportés par Expo Go ([vérifier ici](https://docs.expo.dev/workflow/using-libraries/))

#### ❌ Packages interdits
- Packages nécessitant des modifications natives
- Modules React Native non supportés par Expo Go
- Packages avec code natif personnalisé

#### 🔍 Processus de vérification avant ajout de package
```bash
# 1. Consulter https://reactnative.directory/
# 2. Chercher le tag "✅ Expo Go"
# 3. Utiliser : expo install nom-du-package
# 4. Tester sur Expo Go avant validation
# 5. Si non supporté → chercher alternative Expo-compatible
```

#### **Si absolument nécessaire d'utiliser package non-Expo :**
1. **Chercher d'abord une alternative Expo-compatible**
2. **Si impossible, basculer vers EAS Development Builds**
3. **Documenter le changement et obtenir validation utilisateur**


## Project Overview

MAVECAM AquaCare is a comprehensive aquaculture management platform consisting of:
- **Django REST API Backend** (`backend/`) - Aquaculture production tracking system
- **React Native/Expo Frontend** (`frontend/`) - Mobile application for field data collection

This is a French-language application targeting aquaculture farmers in Cameroon, featuring offline-first architecture with multilingual support (French/English).


## Common Development Commands

### Backend (Django)
```bash
cd backend

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Database operations
python manage.py makemigrations
python manage.py migrate

# ⚠️ OBLIGATOIRE : Charger les guides nutritionnels
python manage.py load_nutritional_data

# Run development server
python manage.py runserver

# Testing (pytest with coverage)
pytest
pytest --cov=apps --cov-report=html
```

### ⚠️ Données Nutritionnelles - Étape Critique

**OBLIGATOIRE pour NutritionalGuidesScreen :**
```bash
python manage.py load_nutritional_data
```

Cette commande charge 8 guides MAVECAM depuis :
`backend/apps/aquaculture/fixtures/nutritional_guides.json`

**Sans cette étape, l'écran mobile affichera "0 sur 0 guides" !**

### Frontend (React Native/Expo)
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start

# ⚠️ Si modifications .env ou config environnement : Clear cache
npm start -- --clear
```

### **🔄 Configuration Environnement Automatique**

**Le frontend détecte automatiquement l'environnement (comme Django) !**

```typescript
// frontend/src/config/environment.ts
if (__DEV__) {
  // Développement → Backend Docker local
  API_URL = 'http://172.20.10.2:8000/api'
} else {
  // Production → API en ligne
  API_URL = 'http://77.237.241.223/api'
}
```

**Workflow complet** :
- **DEV** : `npm start` → Se connecte automatiquement au Docker local
- **PROD** : `eas build` → Se connecte automatiquement à l'API en ligne
- **Aucune modification manuelle nécessaire !**

**Documentation complète** : Voir [WORKFLOW_DEV_PROD.md](../WORKFLOW_DEV_PROD.md)

## Core Architecture

### Backend Structure
- **Custom User Model**: Phone-based authentication (`accounts.User`) with Cameroon-specific validation
- **Farm Profile System**: One-to-one relationship with users for aquaculture facility management
- **Production Cycles**: Central entity tracking complete fish farming cycles (60-180 days)
- **Offline-First Design**: UUID-based models with sync metadata for mobile offline support
- **Multilingual**: Django i18n with French/English support, Cameroon timezone (Africa/Douala)

### Key Backend Models
- `accounts.User` - Custom user model with phone authentication
- `accounts.FarmProfile` - Farm facility information
- `aquaculture.ProductionCycle` - Core aquaculture cycle tracking
- `aquaculture.CycleLog` - Daily production logs with offline sync support
- `aquaculture.FeedingPlan` - Automated feeding recommendations
- `aquaculture.SanitaryLog` - Health monitoring with photo support

### Frontend Architecture
- **Redux Toolkit**: State management with auth slice
- **React Navigation 6**: Stack and tab navigation
- **Expo SecureStore**: Token storage for offline authentication
- **i18next**: Internationalization with French/English locales
- **Axios**: API client with automatic token refresh
- **TypeScript**: Full type coverage

### API Authentication
- JWT-based with 15-minute access tokens and 7-day refresh tokens
- Automatic token rotation and blacklisting for security
- Phone number as primary identifier (+237 Cameroon format)

### Offline-First Features
- Client-generated UUIDs for offline data creation
- Sync metadata tracking (`created_offline`, `synced_at`, `client_uuid`)
- Automatic deduplication on sync
- SecureStore for persistent authentication


## 🎨 CHARTE GRAPHIQUE MAVECAM

### **Couleurs Officielles**
```scss
// Couleurs Principales MAVECAM
$mavecam-green-primary: #059669;     // Vert MAVECAM principal
$mavecam-green-light: #10b981;       // Vert clair pour accents
$mavecam-green-dark: #047857;        // Vert foncé pour headers
$mavecam-white: #ffffff;             // Blanc pur
$mavecam-cream: #f8fafc;             // Blanc cassé pour backgrounds
$mavecam-error: #dc2626;             // Rouge pour erreurs
$mavecam-gray-light: #64748b;        // Texte secondaire
$mavecam-gray-dark: #1e293b;         // Texte principal
```

### **Application des Couleurs**
- **Headers/Navigation** : Vert MAVECAM primary
- **Boutons principaux** : Vert MAVECAM primary
- **Backgrounds** : Crème MAVECAM
- **Cartes/Sections** : Blanc avec ombres subtiles
- **Interface optimisée** pour utilisateurs peu alphabétisés (icônes + texte)

## Development Guidelines

### Database Access
- Primary database: SQLite for development (backend/db.sqlite3)
- Use Django ORM with proper migrations for schema changes
- Custom managers for business logic (UserManager in accounts)

### Testing Approach
- Backend: pytest with Django integration (pytest-django)
- Test configuration in `backend/pytest.ini`
- Coverage requirements: 80% minimum
- Test structure: `backend/tests/unit/` and `backend/tests/fixtures/`


### Localization
- Backend: Django i18n with locale files in `backend/locale/`
- Frontend: i18next configuration in `frontend/src/i18n/`
- Primary language: French (Cameroon target market)


## **PROCESSUS DE VÉRIFICATION AUTOMATIQUE**

### **RÈGLE CRITIQUE - VÉRIFICATION POST-MODIFICATION**
**OBLIGATOIRE : Après chaque modification de code, effectuer une vérification complète pour éviter les erreurs TypeScript et les bugs de runtime.**

### **✅ Processus de Vérification Systématique**

#### **1. APRÈS CHAQUE EDIT/MULTIEDIT**
```bash
1. ✅ Read automatique du fichier modifié
2. ✅ Vérification des types TypeScript dans le code
3. ✅ Identification proactive des erreurs potentielles
4. ✅ Correction immédiate si problème détecté
5. ✅ Confirmation par nouvelle lecture
6. ✅ VÉRIFICATION OBLIGATOIRE DE LA TRADUCTION (voir section dédiée)
7. ✅ SUPPRESSION de tous les console.log de débogage ajoutés
```

#### **🧹 RÈGLE CRITIQUE - NETTOYAGE DES LOGS DE DÉBOGAGE**
**OBLIGATION ABSOLUE : Supprimer tous les console.log ajoutés pour le débogage**

**❌ PROBLÈMES DES LOGS DE DÉBOGAGE :**
- Pollution de la console en production
- Performance dégradée sur mobile
- Informations sensibles exposées
- Code non-professionnel

**✅ APRÈS VALIDATION DU CODE :**
1. **Identifier tous les console.log ajoutés** pour débogage
2. **Les supprimer systématiquement** avant finalisation
3. **Garder uniquement** les logs métier essentiels
4. **Vérifier** qu'aucun log temporaire ne reste

**EXCEPTION :** Logs métier permanents (erreurs, analytics) sont autorisés.

#### **🌍 VÉRIFICATION TRADUCTION OBLIGATOIRE**
**RÈGLE ABSOLUE : Notre application doit être PARFAITEMENT bilingue (Français/Anglais)**

**✅ APRÈS CHAQUE NOUVELLE IMPLÉMENTATION :**
1. **Identifier tous les textes affichés** à l'utilisateur
2. **Vérifier que TOUS utilisent t('key')** et non du texte hardcodé
3. **Ajouter les traductions manquantes** dans `frontend/src/i18n/locales/fr.ts` ET `en.ts`
4. **Tester le changement de langue** pour s'assurer que TOUT se traduit
5. **Aucun texte français/anglais hardcodé** ne doit rester dans les composants

**❌ ERREURS À ÉVITER :**
```typescript
// ❌ INTERDIT - Texte hardcodé
<Text>Statut juridique *</Text>

// ✅ OBLIGATOIRE - Traduction
<Text>{t('legalStatus')} *</Text>
```

**FICHIERS DE TRADUCTION :**
- `frontend/src/i18n/locales/fr.ts` : Traductions françaises
- `frontend/src/i18n/locales/en.ts` : Traductions anglaises

**OBJECTIF :** Utilisateur camerounais ET anglophone doivent avoir exactement la même expérience.

#### **2. TYPES D'ERREURS À SURVEILLER**
- **Propriétés optionnelles** : `object.prop` → `(object.prop || defaultValue)`
- **Types undefined** : Vérifier tous les `?` dans les interfaces
- **Imports manquants** : S'assurer que tous les imports sont présents
- **Erreurs de syntax** : Parenthèses, accolades, virgules
- **Props React** : Types corrects et propriétés requises

#### **3. COMMANDES DE VÉRIFICATION DISPONIBLES**
```bash
# Frontend - Vérification TypeScript
cd frontend
npx tsc --noEmit --pretty

# Backend - Vérification Python
cd backend
python -m py_compile apps/module/file.py

# Tests globaux
npm test
pytest
```

#### **4. CORRECTIONS TYPES COURANTES**
```typescript
// ❌ PROBLÉMATIQUE
farmProfile.total_area_m2 > 0

// ✅ SÉCURISÉE  
(farmProfile.total_area_m2 || 0) > 0

// ❌ PROBLÉMATIQUE
user.first_name + " " + user.last_name

// ✅ SÉCURISÉE
`${user.first_name || ''} ${user.last_name || ''}`.trim()
```

### **🎯 ENGAGEMENT QUALITÉ**
- **Zéro erreur TypeScript** tolérée après modification
- **Lecture systématique** de chaque fichier édité
- **Correction proactive** avant passage à la tâche suivante
- **Vérification des types** optionnels et undefined

## **📁 CONFIGURATION PRODUCTION - FICHIERS STATIQUES**

### **🌐 Architecture Production Prévue**

**DÉCISION TECHNIQUE :** Utilisation de **Nginx** pour servir les fichiers statiques et media en production.

#### **📸 Gestion des Photos (Media Files)**
- **Développement** : Django dev server (`settings.DEBUG = True`)
- **Production** : Nginx sert directement `/media/` sans passer par Django
- **Structure** :
  ```
  /var/www/mavecam/
  ├── api/              # Code Django
  ├── media/            # Fichiers uploadés (photos journal sanitaire, etc.)
  │   └── sanitary_logs/
  │       └── 2024/12/  # Photos par année/mois
  └── static/           # CSS, JS, assets Django
  ```

#### **🔧 Configuration Nginx Prévue**
```nginx
server {
    listen 80;
    server_name api.mavecam.com;

    # Servir les fichiers media directement (photos, uploads)
    location /media/ {
        alias /var/www/mavecam/media/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Servir les fichiers static directement (CSS, JS)
    location /static/ {
        alias /var/www/mavecam/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Proxy vers Django pour API uniquement
    location / {
        proxy_pass http://django:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### **⚙️ Settings Django Production**
```python
# settings/production.py
STATIC_URL = '/static/'
STATIC_ROOT = '/var/www/mavecam/static/'

MEDIA_URL = '/media/'
MEDIA_ROOT = '/var/www/mavecam/media/'

# Ne pas servir les fichiers via Django en production
# (Les URLs static() sont uniquement pour DEBUG=True)
```

#### **📊 Avantages Nginx vs Django**
- **Performance** : Nginx sert fichiers 10x+ rapide que Django
- **Ressources** : Django libéré pour traiter API uniquement
- **Cache** : Headers de cache optimisés pour photos
- **Sécurité** : Pas d'exécution Python pour fichiers statiques

#### **🚀 Migration Prévue**
1. **Phase Actuelle** : Django dev server (OK pour développement)
2. **Phase Production** : Docker + Nginx + Volume persistant
3. **Phase Scale** : Optionnel CDN (AWS CloudFront) si besoin global

**Note** : Cette configuration est optimale pour l'infrastructure MAVECAM et compatible avec le contexte camerounais.

## **📈 ÉTAT D'AVANCEMENT ACTUEL (Septembre 2025)**

### **🎯 Fonctionnalités Complètement Implémentées**

#### **🔐 Module Authentification & Profils (100%)**
- ✅ Système d'authentification JWT complet
- ✅ Gestion des profils utilisateur/ferme
- ✅ Support multilingue (FR/EN) avec i18next
- ✅ Configuration géographique Cameroun (régions/départements)
- ✅ Stockage sécurisé offline (Expo SecureStore)

#### **🐟 Module Aquaculture Core (100%)**
- ✅ **Dashboard intelligent** avec métriques temps réel
- ✅ **Gestion complète des cycles** de production (60-180 jours)
- ✅ **Saisie quotidienne** optimisée (mortalité, croissance, paramètres eau)
- ✅ **Journal sanitaire** avec photos et géolocalisation
- ✅ **Actions de récolte** avec calculs FCR/survie/ROI
- ✅ **Historique cycles** avec comparaisons et tendances
- ✅ **Notifications système** complètes (filtrage, marquage, suppression)
- ✅ **Synchronisation offline** robuste avec déduplication UUID
- ✅ **Calculs automatiques** sophistiqués (biomasse, densité, projections)

#### **🎨 Qualité Technique (100%)**
- ✅ **TypeScript** intégral avec types stricts
- ✅ **Redux Toolkit** pour état global optimisé
- ✅ **React Navigation 6** fluide
- ✅ **Charte graphique MAVECAM** respectée (#059669)
- ✅ **Gestion d'erreurs** défensive (null/undefined)
- ✅ **Tests unitaires** backend (pytest + couverture)
- ✅ **Architecture scalable** frontend/backend

### **✅ Fonctionnalités Complètement Finalisées (Septembre 2025)**

#### **🍽️ FeedingPlanScreen - ✅ TERMINÉ**
**Objectif :** Génération automatique de plans d'alimentation optimisés
- ✅ Calcul automatique des rations selon poids/espèce/température
- ✅ Calendriers d'alimentation personnalisés par cycle
- ✅ Optimisation FCR (objectif : passer de 3.5 à 1.8)
- ✅ Estimation coûts alimentaires et ROI
- ✅ Interface intuitive avec cycle selection

#### **📊 StatisticsScreen - ✅ TERMINÉ**
**Objectif :** Analytics avancées et aide à la décision
- ✅ Interface complète pour cycles récoltés
- ✅ KPIs aquaculture (FCR, survie, croissance, rentabilité)
- ✅ Filtrage par espèce et période
- ✅ Métriques détaillées par cycle avec comparaisons
- ✅ Message informatif pour encourager utilisation

#### **📖 NutritionalGuidesScreen - ✅ TERMINÉ**
**Objectif :** Accès aux guides nutritionnels MAVECAM
- ✅ Base de données nutritionnelle locale (8 guides : 4 Tilapia + 4 Clarias)
- ✅ Fiches techniques MAVECAM intégrées avec données précises
- ✅ Recherche par espèce et texte libre
- ✅ Consultation offline pour zones rurales
- ✅ Interface expansion/contraction des détails
- ✅ Données chargées depuis fixtures backend

### **📈 Impact Métier Attendu**
- **Réduction mortalité** : 40% → 15% (économie 25% pertes)
- **Optimisation FCR** : 3.5 → 1.8 (économie 50% aliments)
- **Augmentation survie** : 60% → 85% (+40% revenus)
- **Support technique** : Proactif vs réactif
- **Certification MAVECAM** : Accélérée par données qualité

### **🎯 Module Aquaculture - 100% COMPLET**

**✅ TOUTES les fonctionnalités du cahier des charges sections 5.1-5.2 sont implémentées :**

1. ✅ **Tableau de bord** - Saisie manuelle, affichage automatique, historique
2. ✅ **Planificateur d'alimentation** - Suggestions, notifications, guides nutritionnels
3. ✅ **Journal sanitaire** - Événements, photos, alertes
4. ✅ **Gestion cycles** - Création, suivi, récolte, historique
5. ✅ **Notifications** - Système complet avec filtrage et actions
6. ✅ **Synchronisation offline** - Architecture robuste avec déduplication

### **🛒 Module Commerce - 100% COMPLET**

**✅ TOUTES les fonctionnalités du module Commerce sont implémentées :**

#### **Screens Frontend (6 écrans - 4,295 lignes)**

1. ✅ **ProductCatalogScreen** (592L) - Catalogue 22 produits MAVECAM
   - Filtres espèce/marque/recherche
   - Ajout rapide panier
   - Pull-to-refresh

2. ✅ **ProductDetailScreen** (607L) - Détails produit complets
   - Specs nutritionnelles (protéines, lipides)
   - Sélection quantité
   - Produits similaires
   - Navigation fluide

3. ✅ **CartScreen** (759L) - Panier intelligent
   - Gestion quantités (ajout/suppression)
   - Preview frais livraison temps réel (API)
   - Livraison gratuite Douala >= 20 sacs
   - Choix retrait magasin (Ndokoti/Ndogpasi)
   - Validation commande offline-first (UUID)

4. ✅ **OrdersHistoryScreen** (694L) - Historique commandes
   - Statistiques globales (total dépensé, nb commandes)
   - Détails expandables (items, adresse, montants)
   - Pull-to-refresh

5. ✅ **FeedingSuggestionsScreen** (820L) - ⭐ FEATURE PHARE MAVECAM
   - Analyse automatique cycles actifs (30 jours)
   - Recommandations multi-granulométrie
   - Projection changements taille aliments
   - Score confiance qualité données
   - Buffer sécurité +7 jours
   - Ajout panier par produit ou cycle complet

6. ✅ **CycleSimulatorScreen** (655L) - Outil prédictif ROI
   - Simulation cycle complet (60-180 jours)
   - Calcul croissance jour par jour (backend)
   - Estimation FCR vs cible MAVECAM
   - Projection ROI (coûts vs revenus)
   - Phases alimentation automatiques

#### **Architecture Backend Existante**

- ✅ **Models Django** : Product, Order, OrderItem
- ✅ **API Endpoints** (10) : CRUD produits, commandes, suggestions, simulation
- ✅ **Algorithmes** : Recommandations granulométrie, calculs FCR, projections ROI
- ✅ **Règles métier** : Frais livraison MAVECAM, seuils gratuits

#### **Architecture Frontend**

- ✅ **Types TypeScript** : commerce.ts (400L) - Types stricts complets
- ✅ **Redux Slice** : commerceSlice.ts (500L) - 10 thunks async + 9 actions sync
- ✅ **Services API** : commerceApi.ts (300L) - 10 endpoints documentés
- ✅ **Domain Layer** : constants + estimators (Clean Architecture)
- ✅ **Traductions** : FR/EN complètes (+135 clés chacune)

#### **Fonctionnalités Clés**

**Commerce :**
- ✅ Catalogue 22 produits (Aller Aqua + DIBAQ)
- ✅ Filtres avancés (espèce, marque, phase, recherche)
- ✅ Panier temps réel avec preview frais
- ✅ Commandes offline-first (UUID déduplication)
- ✅ Historique avec statistiques

**Intelligence MAVECAM :**
- ✅ Suggestions alimentation adaptatives
- ✅ Simulation ROI cycle complet
- ✅ Recommandations multi-granulométrie
- ✅ Projections croissance/FCR
- ✅ Score confiance données

**UX Optimisée :**
- ✅ Charte MAVECAM (#059669) respectée
- ✅ Bilingue FR/EN parfait
- ✅ États vide/loading/erreur gérés
- ✅ Pull-to-refresh partout
- ✅ Navigation fluide

#### **Qualité Code**
- ✅ 0 erreur TypeScript
- ✅ Clean Architecture stricte
- ✅ Gestion défensive null/undefined
- ✅ Documentation JSDoc exhaustive
- ✅ Aucun console.log temporaire

#### **Navigation Intégrée (100%)**
- ✅ **RootStackParamList** : 6 routes Commerce ajoutées avec types stricts
  - ProductCatalog (catalogue filtrable)
  - ProductDetail (détails + params `productId`)
  - Cart (panier intelligent)
  - OrdersHistory (historique + stats)
  - FeedingSuggestions (recommandations IA)
  - CycleSimulator (prédiction ROI)
- ✅ **MainNavigator.tsx** : Tous les screens Commerce enregistrés
- ✅ **TypeScript Navigation** : Typage strict avec `StackNavigationProp`
- ✅ **Compilation** : 0 erreur TypeScript vérifiée
- ✅ **Exports centralisés** : `@/screens/commerce/index.ts`

**Navigation fluide entre :**
- Dashboard → ProductCatalog → ProductDetail → Cart → OrdersHistory
- Dashboard → FeedingSuggestions (analyse cycles actifs)
- Dashboard → CycleSimulator (prédiction nouveau cycle)

### **🚀 Prochaines Étapes Projet Global**
1. ✅ ~~**Navigation** - Setup CommerceStack dans MainNavigator~~ **TERMINÉ**
2. **Tests utilisateur** avec aquaculteurs pilotes MAVECAM
3. **Module Support (5.4)** - Chat technicien et système tickets
4. **Optimisations** basées sur feedback terrain