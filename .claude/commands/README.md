# Commandes Personnalisees MAVECAM AquaCare

Ce repertoire contient les commandes personnalisees pour optimiser le workflow de developpement avec Claude Code.

## Commandes Disponibles

### 📦 `/check-package` - Verification Package avec Context7
**Utilisation:** AVANT d'installer un nouveau package (frontend ou backend)

**Cas d'usage:**
- Installation package React Native (verification Expo Go compatible)
- Installation package backend Python
- Recherche alternatives matures

**Actions executees:**
1. **Verification Expo (CRITIQUE pour frontend):**
   - Consultation https://reactnative.directory/
   - Verification tag "Expo Go compatible"
   - Verification presence dans https://docs.expo.dev/versions/latest/

2. **Recherche Context7:**
   - Consultation documentation officielle
   - Verification maturite package (maintenance, stars, issues, doc)

3. **Alternatives Expo-first:**
   - Recherche alternatives officielles si package non-Expo

4. **Decision:**
   - Installer si Expo-compatible + mature
   - Bloquer si non-Expo (sauf validation utilisateur)
   - Proposer alternative si disponible

**Verification:**
- ✅ Package Expo-compatible (frontend)
- ✅ Tag "Expo Go" sur https://reactnative.directory/
- ✅ Maintenance active + maturite (stars, issues, doc)
- ✅ Utilisation `expo install` au lieu de `npm install`

**CRITIQUE:** Evite erreurs type package non-Expo cassant l'app mobile

**Reference:** CLAUDE.md ligne 63-93, DONT_DO.md ligne 31-68

---

### 📋 `/update-changelog` - Mise a Jour PROJECT_CONTEXT.md
**Utilisation:** Apres validation d'une feature complete

**Cas d'usage:**
- Feature nouvelle implementee et testee
- Bug fixe avec impact significatif
- Refactoring majeur

**Actions executees:**
1. **Recuperer informations commit:**
   - Derniers commits avec hash, message, date
   - Changements dans git diff

2. **Analyser changements:**
   - Fichiers modifies
   - Modules concernes (accounts, aquaculture, etc.)
   - Type de changement (Feature, Fix, Refactor, Docs, Tests)

3. **Ajouter nouvelle entree changelog:**
   - Format chronologique obligatoire
   - Structure: Date, Type, Module, Commit hash
   - Sections: Added/Changed/Fixed, Tests

4. **Mettre a jour statistiques:**
   - Total lignes de code
   - Nombre fonctionnalites
   - Etat roadmap

**Verification:**
- ✅ Format chronologique respecte
- ✅ Aucun accent dans texte
- ✅ Type commit correct (Feature/Fix/Refactor)
- ✅ Module identifie (accounts/aquaculture/both)

**NB:** Ne pas utiliser pour commits mineurs (typo, formatting)

**Reference:** PROJECT_CONTEXT.md structure existante

---

### 🔧 `/create-backend-feature` - Creation Feature Backend Complete
**Utilisation:** Developper une nouvelle fonctionnalite backend Django/DRF

**Cas d'usage:**
- Nouveau module backend (API endpoints, models, serializers)
- Extension module existant (nouvelles fonctionnalites aquaculture, accounts)
- Refactoring backend avec nouvelle architecture

**Actions executees:**
1. **Analyse prerequis:**
   - Lecture CLAUDE.md (regles projet)
   - Lecture ARCHITECTURE.md (architecture actuelle)
   - Lecture PROJECT_CONTEXT.md (progression projet)
   - Lecture DESIGN_SYSTEM.md (si impact UI/UX)
   - Lecture DONT_DO.md (erreurs a eviter)

2. **Planification (Deep Think):**
   - Architecture proposee (models, serializers, views)
   - Integration avec modules existants
   - Gestion offline-first (UUIDs, sync metadata)
   - Schema base de donnees (migrations)
   - Endpoints API (routes, permissions)
   - **Rapport detaille pour validation utilisateur**

3. **Implementation:**
   - Creation models Django avec UUIDs
   - Serializers DRF avec validation
   - ViewSets/APIViews avec permissions
   - Migrations base de donnees
   - Integration signals si necessaire
   - Documentation code (docstrings)

4. **Tests unitaires (Coverage >90%):**
   - Tests models (validation, contraintes)
   - Tests serializers (serialization/deserialization)
   - Tests API endpoints (permissions, responses)
   - Fixtures factories (backend/tests/fixtures/factories.py)

5. **Validation:**
   - Execution pytest avec coverage
   - Verification migrations
   - Test API avec curl/Postman
   - **Feedback utilisateur pour iteration**

**Verification:**
- ✅ Architecture respectee (Clean Architecture, DRY)
- ✅ Offline-first (UUIDs, sync metadata)
- ✅ Tests coverage >90%
- ✅ Documentation complete (docstrings, README)
- ✅ Migrations Django propres
- ✅ Permissions API securisees

**Workflow:**
1. Description fonctionnalite (utilisateur)
2. Deep think + rapport planification (Claude)
3. Validation plan (utilisateur)
4. Implementation + tests (Claude)
5. Validation finale (utilisateur)

**Reference:** [create-backend-feature.md](.claude/commands/create-backend-feature.md)

---

### ⚛️ `/create-frontend-feature` - Creation Feature Frontend Complete
**Utilisation:** Developper une nouvelle fonctionnalite frontend React Native/Expo

**Cas d'usage:**
- Nouvel ecran mobile (aquaculture, commerce, support)
- Nouveau composant reutilisable (UI/UX)
- Refactoring frontend avec nouvelle architecture

**Actions executees:**
1. **Analyse prerequis:**
   - Lecture CLAUDE.md (regles projet)
   - Lecture ARCHITECTURE.md (architecture actuelle)
   - Lecture PROJECT_CONTEXT.md (progression projet)
   - Lecture DESIGN_SYSTEM.md (charte graphique MAVECAM)
   - Lecture DONT_DO.md (erreurs a eviter)

2. **Planification (Deep Think):**
   - Architecture proposee (screens, components, navigation)
   - Integration Redux Toolkit (slices, thunks)
   - Services API (axios, offline sync)
   - Gestion erreurs et states (loading, error, success)
   - Traductions i18next (FR/EN)
   - Charte graphique MAVECAM (#059669)
   - **Rapport detaille pour validation utilisateur**

3. **Implementation:**
   - Screens React Native avec TypeScript
   - Composants reutilisables
   - Redux slices + thunks
   - Services API avec gestion offline
   - Traductions FR/EN (i18n/locales/)
   - Navigation React Navigation 6
   - Charte graphique respectee

4. **Verification TypeScript:**
   - `npx tsc --noEmit` apres chaque modification
   - Gestion types optionnels (null/undefined)
   - Props React correctes
   - Imports complets

5. **Tests:**
   - Test compilation TypeScript
   - Test navigation entre ecrans
   - Test changement langue FR/EN
   - Test offline/online sync
   - **Validation utilisateur finale**

**Verification:**
- ✅ TypeScript strict (zero erreur tsc)
- ✅ Traductions FR/EN completes
- ✅ Charte MAVECAM respectee (#059669)
- ✅ Offline-first (sync metadata)
- ✅ Navigation fluide
- ✅ Gestion erreurs defensive
- ✅ Aucun console.log de debug restant

**Workflow:**
1. Description fonctionnalite (utilisateur)
2. Deep think + rapport planification (Claude)
3. Validation plan (utilisateur)
4. Implementation + verification TS (Claude)
5. Validation finale (utilisateur)

**Reference:** [create-frontend-feature.md](.claude/commands/create-frontend-feature.md)

---

## Workflow Recommande

### 1. Avant d'installer un package:
```
/check-package nom-du-package
```

### 2. Developper nouvelle fonctionnalite backend:
```
/create-backend-feature
```

### 3. Developper nouvelle fonctionnalite frontend:
```
/create-frontend-feature
```

### 4. Apres validation feature complete:
```
/update-changelog
```

---


**Derniere mise a jour :** 2025-10-27
**Maintenu par :** Djoko Christian
