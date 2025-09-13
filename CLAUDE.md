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

5. **Toujours analyser la code base actuelle lors d'une nouvelle requette dans un nouveau chat et pour chaque fonctionnalites developper, tu dois mettre cela a jour dans ce fichier afin que la comprehension par n nouveau chat soit parfaite, donc toujours mettre ce fichier a jour en fonction de l'avancement actuel (apres ma confirmation biensur)**

### **Interdictions Strictes**
- ❌ Écrire du code sans consulter la documentation officielle
- ❌ Utiliser des patterns obsolètes ou non-officiels  
- ❌ Solutions "qui marchent" mais non-conformes aux standards
- ❌ Code basé uniquement sur la mémoire ou des exemples non-officiels


## Project Overview

MAVECAM AquaCare is a comprehensive aquaculture management platform consisting of:
- **Django REST API Backend** (`backend/`) - Aquaculture production tracking system
- **React Native/Expo Frontend** (`frontend/`) - Mobile application for field data collection

This is a French-language application targeting aquaculture farmers in Cameroon, featuring offline-first architecture with multilingual support (French/English).


## **État d'Avancement du Projet** 

### **ANALYSE CAHIER DES CHARGES vs RÉALISÉ**

#### **5.1 TABLEAU DE BORD** *(Objectif MVP)*
- ✅ **Modèles Backend** : ProductionCycle, CycleLog (saisie poissons, poids, mortalité)
- ✅ **Calculs Auto** : biomasse, FCR, courbes de croissance (CycleMetrics)
- ✅ **Historique** : cycles avec indexation optimisée
- ❌ **Interface Mobile** : Screens créés mais pas connectés aux APIs
- ❌ **Saisie Fonctionnelle** : Formulaires à implémenter
- **AVANCEMENT : 60%** *(Backend OK, Frontend à connecter)*

#### **5.2 PLANIFICATEUR D'ALIMENTATION** *(Objectif MVP)*
- ✅ **Modèles Backend** : FeedingPlan, NutritionalGuide avec calculs automatiques
- ✅ **Guides Nutritionnels** : Par espèce/stade (fixtures prêtes)
- ✅ **Système Notifications** : Modèle Notification implémenté
- ❌ **Interface Mobile** : Planificateur à développer
- ❌ **Notifications Push** : Pas encore configurées
- **AVANCEMENT : 50%** *(Base solide, UI manquante)*

#### **5.3 COMMANDE D'INTRANTS** *(Objectif MVP)*
- ❌ **Module Commerce** : Pas encore développé (Phase 3 prévue)
- ❌ **Catalogue Produits** : À créer
- ❌ **Système Commandes** : À développer
- **AVANCEMENT : 0%** *(Module prévu Phase 3)*

#### **5.4 ASSISTANCE TECHNIQUE** *(Objectif MVP)*
- ❌ **Module Support** : Pas encore développé (Phase 4 prévue)
- ❌ **Chat Technicien** : À créer
- ❌ **Système Tickets** : À développer
- **AVANCEMENT : 0%** *(Module prévu Phase 4)*

#### **5.5 JOURNAL SANITAIRE** *(Objectif MVP)*
- ✅ **Modèles Backend** : SanitaryLog avec support photos
- ✅ **Types d'Événements** : Constants définis (maladies, traitements)
- ✅ **Upload Photos** : Modèle prêt avec compression
- ❌ **Interface Mobile** : Formulaires sanitaires à créer
- ❌ **Alertes Sanitaires** : Logique à connecter
- **AVANCEMENT : 70%** *(Backend complet, UI manquante)*

#### **5.6 ESPACE PERSONNEL** *(Objectif MVP)*
- ✅ **Authentification** : JWT + téléphone Cameroun (+237)
- ✅ **Profils Utilisateurs** : User + FarmProfile complets
- ✅ **Statut Certification** : "éleveur suivi MAVECAM" implémenté
- ✅ **Écrans Mobile** : ProfileScreen, SettingsScreen, FarmProfileScreen
- ❌ **Historique Commandes** : Module commerce pas encore fait
- **AVANCEMENT : 80%** *(Quasi-complet)*


### **BILAN GLOBAL MVP**

#### ✅ **POINTS FORTS (Ce qui fonctionne)**
- **Architecture Solide** : Offline-first avec UUID + sync metadata
- **Backend Aquaculture** : Modèles complets et bien pensés
- **Authentification Robuste** : JWT + validation téléphone Cameroun
- **i18n Configurée** : FR/EN prêt pour l'Afrique centrale
- **Sélection Géographique** : LocationSelector optimisé avec sélection cascade Cameroun
- **UX/UI Améliorée** : Interface MAVECAM avec modales intuitives pour sélection localisation
- **Tests Framework** : pytest configuré

#### 🔄 **EN COURS (Partiellement fait)**
- **Tableau de Bord** : Backend OK, Frontend à connecter (60%)
- **Planificateur** : Modèles OK, notifications à activer (50%)
- **Journal Sanitaire** : Backend OK, UI à créer (70%)
- **Espace Personnel** : Quasi-complet avec sélection géographique optimisée (85%)

#### ❌ **MANQUANT (À développer)**
- **Module Commerce** : Commande intrants (0% - Phase 3)
- **Module Support** : Chat + tickets (0% - Phase 4)
- **API Views** : Endpoints aquaculture pas tous exposés
- **Intégration Mobile** : Connexion Frontend ↔ Backend
- **Tests E2E** : Validation complète du flux utilisateur


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
python manage.py loaddata apps/aquaculture/fixtures/nutritional_guides.json

# Run development server
python manage.py runserver

# Testing (pytest with coverage)
pytest
pytest --cov=apps --cov-report=html

# Load nutritional data
python manage.py load_nutritional_data
```

### Frontend (React Native/Expo)
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

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
```

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