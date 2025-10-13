# DONT_DO.md

Memoire des erreurs et echecs a NE PLUS repeter dans le projet MAVECAM AquaCare.

## Objectif

Ce fichier documente TOUTES les erreurs commises pendant le developpement pour :
- Eviter de repeter les memes erreurs
- Gagner du temps en consultation rapide

---

## Format des Entrees

Chaque erreur contient :
- **Date** : Date de l'erreur
- **Categorie** : Frontend | Backend | Ops | Architecture | Packages etc..
- **Erreur** : Description courte du probleme
- **Impact** : Consequences (temps perdu, bugs, rollback)
- **Cause** : Pourquoi ca a echoue
- **Solution** : Comment on a corrige
- **Regle** : Regle a TOUJOURS appliquer maintenant
- **Reference** : Lien commit/issue si applicable

---

## Erreurs Documentees

### [EXEMPLE] - Package Non-Expo Installe
**Date :** 2025-XX-XX
**Categorie :** `Packages` | **Severite :** Critique

#### Erreur
Installation de `react-native-camera` au lieu de `expo-camera`

#### Impact
- App crash au demarrage Expo Go
- 2h de debug pour identifier le probleme
- Rollback npm install necessaire
- Perte de confiance equipe

#### Cause
- Package trouve sur npm sans verifier compatibilite Expo
- Pas consulte https://reactnative.directory/
- Pas verifie tag "Expo Go compatible"

#### Solution
```bash
# Desinstaller package problematique
npm uninstall react-native-camera

# Installer version Expo
expo install expo-camera

# Verifier package.json ne contient QUE packages Expo-compatible
```

#### Regle ABSOLUE
**JAMAIS installer package React Native sans :**
1. Verifier sur https://reactnative.directory/ tag "Expo Go"
2. Consulter https://docs.expo.dev/versions/latest/
3. Utiliser `expo install` au lieu de `npm install`
4. Si package non-Expo requis a` Documenter + Validation utilisateur

---

### [EXEMPLE] - TypeScript Optional Chaining Oublie
**Date :** 2025-XX-XX
**Categorie :** `Frontend` | **Severite :** Majeure

#### Erreur
Acces direct `farmProfile.total_area_m2` sans verification undefined

#### Impact
- Crash app mobile en production
- 5 rapports utilisateurs bugs identiques
- Correction urgente en hotfix
- Perte donnees saisie utilisateur

#### Cause
- TypeScript `strict: false` initialement
- Props optionnelles non verifiees
- Pas de defensive programming

#### Solution
```typescript
// Avant (INCORRECT)
if (farmProfile.total_area_m2 > 0) {
  // ...
}

// Apres (CORRECT)
if ((farmProfile.total_area_m2 || 0) > 0) {
  // ...
}

// Ou avec optional chaining
if (farmProfile?.total_area_m2 && farmProfile.total_area_m2 > 0) {
  // ...
}
```

#### Regle ABSOLUE
**TOUJOURS verifier proprietes optionnelles :**
- Utiliser `||` pour valeurs par defaut
- Utiliser `?.` pour chaining securise
- Utiliser `??` pour nullish coalescing
- Activer `strict: true` dans tsconfig.json

**Reference :** CLAUDE.md ligne 297-332

---

### [A DOCUMENTER] - Texte Hardcode au lieu de t()
**Date :** 2025-XX-XX
**Categorie :** `Frontend` | **Severite :** Mineure

#### Erreur
Texte francais hardcode dans composant au lieu de traduction i18next

#### Impact
- Application non traduisible en anglais
- Utilisateurs anglophones bloques
- Refactoring necessaire apres coup

#### Cause
- Oubli d'utiliser hook `t()` de i18next
- Rapidite developpement sans verification
- Pas de check systematique des PR

#### Solution
```typescript
// Avant (INCORRECT)
<Text>Statut juridique *</Text>

// Apres (CORRECT)
<Text>{t('legalStatus')} *</Text>
```

Puis ajouter dans `fr.ts` et `en.ts` :
```typescript
// fr.ts
legalStatus: "Statut juridique"

// en.ts
legalStatus: "Legal status"
```

#### Regle ABSOLUE
**AUCUN texte hardcode autorise :**
- Utiliser TOUJOURS `t('key')` pour textes utilisateur
- Verifier `fr.ts` ET `en.ts` apres chaque ajout
- Tester changement langue avant commit
- Review PR doit bloquer si texte hardcode detecte

**Reference :** CLAUDE.md ligne 272-295

---

### [A DOCUMENTER] - Console.log de Debug Non Supprimes
**Date :** 2025-XX-XX
**Categorie :** `Frontend` | **Severite :** Mineure

#### Erreur
Console.log temporaires laisses dans code production

#### Impact
- Pollution console utilisateur
- Performance mobile degradee
- Informations sensibles exposees (tokens, donnees)
- Code non-professionnel

#### Cause
- Debug rapide sans nettoyage
- Pas de verification avant commit
- Oubli pendant resolution bugs

#### Solution
```typescript
// Avant commit, chercher et supprimer TOUS les console.log temporaires
// Garder uniquement logs metier essentiels

// SUPPRIMER
console.log('DEBUG user data:', user)
console.log('token:', token)

// GARDER (logs metier)
console.error('API Error:', error.message)
```

#### Regle ABSOLUE
**Avant CHAQUE commit :**
1. Chercher tous `console.log` ajoutes
2. Supprimer logs de debug temporaires
3. Garder uniquement logs metier (errors, analytics)
4. Utiliser debugger Chrome/React Native Debugger au lieu de console.log

**Reference :** CLAUDE.md ligne 254-270

---

### [A DOCUMENTER] - Migration Django Sans Backup
**Date :** 2025-XX-XX
**Categorie :** `Backend` | **Severite :** Critique

#### Erreur
Execution `makemigrations` + `migrate` sans backup base donnees

#### Impact
- Schema corrompu irrecuperable
- Perte donnees utilisateurs
- Rollback impossible
- Restauration depuis ancien commit difficile

#### Cause
- Migration teste uniquement en dev
- Pas de backup automatique configure
- Confiance excessive schema Django

#### Solution
```bash
# TOUJOURS faire backup avant migration production
python manage.py dumpdata > backup_$(date +%Y%m%d_%H%M%S).json

# Ou backup SQLite
cp db.sqlite3 db.sqlite3.backup_$(date +%Y%m%d_%H%M%S)

# Puis migration
python manage.py makemigrations
python manage.py migrate

# En cas d'erreur, restaurer
python manage.py loaddata backup_20250111_143000.json
```

#### Regle ABSOLUE
**Avant TOUTE migration production :**
1. Backup complet base donnees
2. Tester migration sur copie base
3. Verifier schema apres migration
4. Documenter changements schema dans PROJECT_CONTEXT.md
5. Conserver backups 30 jours minimum

**Reference :** A ajouter dans DEPLOYMENT.md

---

### [A DOCUMENTER] - Commit Sans Tests
**Date :** 2025-XX-XX
**Categorie :** `Backend` | **Severite :** Majeure

#### Erreur
Commit fonctionnalite critique sans tests unitaires

#### Impact
- Bug production non detecte
- Calculs FCR incorrects
- Perte confiance utilisateurs MAVECAM
- Rollback urgent necessaire

#### Cause
- Deadline serree
- Confiance excessive code manuel
- Tests considers "optionnels"

#### Solution
```bash
# Backend : TOUJOURS executer tests avant commit
cd backend
pytest --cov=apps --cov-report=term

# Frontend : TOUJOURS verifier TypeScript
cd frontend
npx tsc --noEmit --pretty
```

#### Regle ABSOLUE
**AUCUN commit autorise sans :**
- Tests unitaires pour code metier (FCR, biomasse, ROI)
- Coverage 80%+ maintenu
- `npx tsc --noEmit` passe sans erreur
- Verification manuelle feature fonctionne

**Reference :** CLAUDE.md ligne 49-54, 304-317

---


### [A DOCUMENTER] - API Key Commitee dans Git
**Date :** 2025-XX-XX
**Categorie :** `DevOps` | **Severite :** Critique

#### Erreur
Fichier `.env` avec API keys commite dans Git

#### Impact
- Cles exposees publiquement (si GitHub public)
- Risque securite acces base donnees
- Rotation cles necessaire urgente
- Cout potentiel si API payante

#### Cause
- `.env` pas dans `.gitignore`
- Commit rapide sans verification
- Manque sensibilisation securite

#### Solution
```bash
# Ajouter .env dans .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env.production" >> .gitignore

# Supprimer .env de l'historique Git
git rm --cached .env
git commit -m "Remove .env from Git history"

# Rotation immediate des cles exposees
```

#### Regle ABSOLUE
**JAMAIS committer :**
- `.env` ou `.env.*`
- `credentials.json`
- Fichiers contenant tokens, passwords, API keys
- Fichiers `*secret*`, `*password*`, `*key*`

**TOUJOURS :**
- Verifier `.gitignore` avant premier commit
- Utiliser variables environnement
- Documenter format `.env.example` sans valeurs reelles

**Reference :** A ajouter dans CLAUDE.md + DEPLOYMENT.md

---


## Checklist Pre-Commit (Anti-Erreurs)

Avant CHAQUE commit, verifier :

### Frontend
- [ ] `npx tsc --noEmit` passe sans erreur
- [ ] Aucun `console.log` temporaire present
- [ ] Tous textes utilisent `t('key')`
- [ ] Traductions FR + EN a jour
- [ ] Props optionnelles verifiees (`||`, `?.`)
- [ ] Packages utilises sont Expo-compatible

### Backend
- [ ] `pytest` passe avec coverage 80%+
- [ ] Migrations testees sur copie base
- [ ] Aucun secret/API key dans code
- [ ] Serializers valides tous champs
- [ ] Signals ne causent pas boucles infinies

### Git
- [ ] Message commit descriptif (`feat:`, `fix:`, etc.)
- [ ] Fichiers `.env` ignores
- [ ] Pas de `--force` sur main
- [ ] Commit < 500 lignes (sinon decouper)

### Documentation
- [ ] `PROJECT_CONTEXT.md` mis a jour si feature
- [ ] `DONT_DO.md` mis a jour si erreur
- [ ] `CLAUDE.md` mis a jour si nouvelle regle

---

## Ressources Prevention Erreurs

### Outils Recommandes
- **ESLint** : Detection erreurs JS/TS automatique
- **Prettier** : Formatage code uniforme
- **Husky** : Git hooks pre-commit automatiques
- **Jest** : Tests unitaires frontend
- **Pytest** : Tests unitaires backend
- **TypeScript strict** : Prevention bugs runtime

### Documentation Externe
- Expo Packages : https://docs.expo.dev/versions/latest/
- React Native Directory : https://reactnative.directory/
- TypeScript Handbook : https://www.typescriptlang.org/docs/
- Django Best Practices : https://docs.djangoproject.com/

---

**Derniere mise a jour :** 2025-01-11
**Maintenu par :** Djoko Christian

**Note :** Ce fichier DOIT etre mis a jour IMMEDIATEMENT apres chaque erreur significative.
