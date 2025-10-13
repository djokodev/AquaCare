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

## Workflow Recommande

### 1. Avant d'installer un package:
```
/check-package nom-du-package
```

### 2. Apres validation feature complete:
```
/update-changelog
```

---

## Regles de Commit Atomiques

**OBLIGATION :** Commiter apres CHAQUE fonctionnalite qui marche

**Exemples de commits atomiques:**
- ✅ "feat: Add NutritionalGuidesScreen with species filtering"
- ✅ "fix: Secure optional properties in StatisticsScreen"
- ✅ "refactor: Extract feeding calculation to utils"

**Eviter commits massifs:**
- ❌ "feat: Complete aquaculture module" (trop large)
- ❌ "fix: Various bugs" (non descriptif)

---

## Best Practices Implementees

1. ✅ **Context7** - Recherche packages matures + doc officielle
2. ✅ **Changelog** - Mise a jour PROJECT_CONTEXT.md systematique
3. ✅ **Commandes personnalisees** - Workflow automatise
4. ✅ **"Fix sans tout casser"** - Modifications limitees au scope
5. ✅ **Commits atomiques** - Feature par feature
6. ✅ **DONT_DO.md** - Memoire erreurs passees
7. ✅ **Expo-first** - Verification compatibilite packages

---

## References

- **CLAUDE.md** : Regles developpement globales
- **PROJECT_CONTEXT.md** : Changelog + roadmap
- **DONT_DO.md** : Erreurs a ne plus repeter
- **ARCHITECTURE.md** : Architecture technique complete
- **DESIGN_SYSTEM.md** : Systeme design UI/UX

---

**Derniere mise a jour :** 2025-10-13
**Maintenu par :** Djoko Christian
