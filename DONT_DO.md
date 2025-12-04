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

## ⚠️ ERREURS RÉELLES - MODULE COMMERCE (Janvier 2025)

### 1. Encodage UTF-8 avec Accents Français
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Bloquante

#### Erreur
```
SyntaxError: (unicode error) 'utf-8' codec can't decode byte 0xe9 in position 30
```

#### Impact
- Fichier Python non exécutable
- Impossible de créer `FeedingSuggestionService`
- 20 minutes perdues à identifier problème encodage

#### Cause
- Outil Write créait fichiers en encoding incorrect
- Commentaires français avec accents : "générer", "aliments", "élevage"
- Windows utilisant parfois latin-1 par défaut

#### Solution
```python
# Option 1 : Créer fichier avec Python directement
python -c "
with open('file.py', 'w', encoding='utf-8') as f:
    f.write(content)
"

# Option 2 : Supprimer accents temporairement
# "générer" → "generer"
# "élevage" → "elevage"
```

#### Règle ABSOLUE
**TOUJOURS spécifier encoding UTF-8 :**
- Utiliser `encoding='utf-8'` dans tous `open()`
- Vérifier `.editorconfig` contient `charset = utf-8`
- Tester fichiers Python avec accents : `python -m py_compile file.py`

**Référence :** `backend/commerce/services/feeding_suggestion_service.py`

---

### 2. Noms de Champs Incorrects dans Tests
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Majeure

#### Erreur
```
TypeError: UserManager.create_user() missing 1 required positional argument: 'phone_number'
TypeError: Product() got unexpected keyword arguments: 'target_species', 'unit_price'
```

#### Impact
- 14/36 tests échouent
- Coverage tombe à 36% au lieu de 80%+
- Obligation refactoring complet fixtures tests

#### Cause
- **N'a PAS lu `models.py` avant d'écrire tests**
- Noms devinés : `phone` au lieu de `phone_number`
- Noms devinés : `target_species` au lieu de `species`
- Noms devinés : `unit_price` au lieu de `price_per_package`

#### Solution
```python
# ❌ INCORRECT (deviné sans vérifier)
user = User.objects.create_user(phone="+237123456789")
product = Product(target_species="tilapia", unit_price=30000)

# ✅ CORRECT (après lecture models.py)
user = User.objects.create_user(phone_number="+237123456789")
product = Product(species="tilapia", price_per_package=30000)
```

#### Règle ABSOLUE
**AVANT d'écrire tests :**
1. **LIRE** le fichier `models.py` complet
2. **IDENTIFIER** tous les champs requis (required=True, null=False)
3. **COPIER** noms exacts depuis modèle
4. **VÉRIFIER** types de champs (CharField, DecimalField, etc.)
5. NE JAMAIS deviner noms de champs

**Référence :** `backend/commerce/tests/test_models.py` lignes 15-30

---

### 3. Champs Requis Manquants dans Fixtures
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Majeure

#### Erreur
```
django.db.utils.IntegrityError: NOT NULL constraint failed: commerce_product.lipid_percentage
django.core.exceptions.ValidationError: {'first_name': ['required'], 'last_name': ['required'], 'age_group': ['required']}
```

#### Impact
- 8/36 tests échouent sur contraintes DB
- Migrations bloquées si données existantes
- Temps debug 30 minutes

#### Cause
- Créé objets sans lire contraintes `null=False`
- Oublié champs requis : `lipid_percentage`, `first_name`, `last_name`, `age_group`
- N'a pas vérifié définition `User.objects.create_user()`

#### Solution
```python
# ❌ INCORRECT - Champs manquants
product = Product.objects.create(
    name="ALLER AQUA TILAPIA 3MM 20KG",
    brand="aller_aqua",
    species="tilapia",
    # ⚠️ lipid_percentage MANQUANT !
)

# ✅ CORRECT - Tous champs requis présents
product = Product.objects.create(
    name="ALLER AQUA TILAPIA 3MM 20KG",
    brand="aller_aqua",
    species="tilapia",
    lipid_percentage=10,  # ✅ Ajouté
    protein_percentage=32.0,
    package_weight_kg=20.0,
    price_per_package=30000.00
)
```

#### Règle ABSOLUE
**Identifier champs requis :**
```python
# Dans models.py, chercher :
# 1. Champs sans null=True, blank=True
# 2. Validators requis (MinValueValidator, etc.)
# 3. Méthode create_user() custom avec paramètres requis

# Créer checklist :
# - [ ] name (required)
# - [ ] species (required)
# - [ ] lipid_percentage (required, null=False)
# - [ ] price_per_package (required)
```

**Référence :** `backend/commerce/models.py` lignes 70-75

---

### 4. Noms de Méthodes Services Incorrects
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Moyenne

#### Erreur
```
AttributeError: type object 'ProductService' has no attribute 'get_products_by_species'
AttributeError: type object 'OrderService' has no attribute 'calculate_delivery_fee'
```

#### Impact
- 3 tests échouent sur méthodes inexistantes
- Confusion API services
- Temps debug 15 minutes

#### Cause
- **N'a PAS lu fichier services avant tests**
- Deviné nom `calculate_delivery_fee()` au lieu de `calculate_delivery_fee_preview()`
- Supposé méthode `get_products_by_species()` existe

#### Solution
```python
# ❌ INCORRECT (méthode n'existe pas)
fee = OrderService.calculate_delivery_fee(100000, "home")

# ✅ CORRECT (nom exact depuis services.py)
fee = OrderService.calculate_delivery_fee_preview(100000, "home")
```

#### Règle ABSOLUE
**Avant tests services :**
1. **LIRE** `services/*.py` complets
2. **LISTER** toutes méthodes @staticmethod
3. **COPIER** signatures exactes avec paramètres
4. **VÉRIFIER** return types documentés
5. NE JAMAIS deviner noms méthodes

**Référence :** `backend/commerce/services/order_service.py` ligne 88

---

### 5. Django Settings Non Configuré pour Pytest
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Bloquante

#### Erreur
```
django.core.exceptions.ImproperlyConfigured: Requested setting INSTALLED_APPS, but settings are not configured
```

#### Impact
- **TOUS** les tests échouent immédiatement
- Pytest ne peut pas importer modèles Django
- Bloque complètement CI/CD

#### Cause
- Créé tests Django sans initialiser Django
- Manque `django.setup()` avant imports
- Pytest ne sait pas quel settings utiliser

#### Solution
```python
# Créer backend/commerce/tests/conftest.py
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mavecam_api.settings.test')
django.setup()
```

#### Règle ABSOLUE
**TOUJOURS créer conftest.py pour tests Django :**
1. Créer `conftest.py` dans répertoire racine tests
2. Configurer `DJANGO_SETTINGS_MODULE`
3. Appeler `django.setup()` AVANT tous imports
4. Tester avec `pytest --collect-only` avant exécution

**Référence :** `backend/commerce/tests/conftest.py`

---

### 6. Bash Heredoc avec Quotes Complexes
**Date :** 2025-01-11
**Catégorie :** `DevOps` | **Sévérité :** Mineure

#### Erreur
```
/usr/bin/bash: -c: line 326: unexpected EOF while looking for matching `''
```

#### Impact
- Impossible créer fichier DONT_DO.md avec bash
- Syntaxe heredoc cassée par quotes Python imbriquées
- 10 minutes perdues debugging bash

#### Cause
- Utilisé `cat << EOF` avec code Python contenant `'`, `"`, `'''`
- Bash confond délimiteurs heredoc et quotes Python
- Échappement complexe impossible à maintenir

#### Solution
```bash
# ❌ INCORRECT - Heredoc avec code complexe
cat > file.md << 'EOF'
Content avec Python:
```python
text = '''multi
line'''
```
EOF
# ⚠️ Bash confond ''' de Python avec délimiteur

# ✅ CORRECT - Utiliser Python directement
python -c "
content = '''
Content avec Python OK
'''
with open('file.md', 'w', encoding='utf-8') as f:
    f.write(content)
"
```

#### Règle ABSOLUE
**Pour fichiers complexes :**
- **NE JAMAIS** utiliser bash heredoc si contenu contient code avec quotes
- **TOUJOURS** préférer Python/Node pour écriture fichiers
- Utiliser heredoc uniquement pour texte simple sans imbrication
- Si besoin bash, utiliser `cat > file` avec echo ligne par ligne

**Référence :** Tentative création `DONT_DO.md` initiale

---

### 7. Write Tool sur Fichier Non-Lu
**Date :** 2025-01-11
**Catégorie :** `Tooling` | **Sévérité :** Mineure

#### Erreur
```
Error: File has not been read yet. Read it first before writing to it.
```

#### Impact
- Impossible modifier fichier existant
- Obligation workflow Read → Write
- Perte temps 5 minutes

#### Cause
- Tenté Write directement sans Read préalable
- Méconnaissance contrainte outil Write
- Optimisation prématurée éviter Read

#### Solution
```python
# ❌ INCORRECT - Write direct
Write("file.py", new_content)  # ❌ ERREUR

# ✅ CORRECT - Read puis Write
Read("file.py")  # Obligatoire d'abord
Write("file.py", new_content)  # OK maintenant

# Alternative : Nouveau fichier
Bash("touch file.py")  # Créer vide
Read("file.py")  # Lire (vide)
Write("file.py", content)  # OK
```

#### Règle ABSOLUE
**Avant Write :**
1. **TOUJOURS** Read fichier d'abord si existe
2. Si nouveau fichier, `touch` puis `Read`
3. Ne jamais supposer contenu fichier sans Read
4. Préférer Edit pour modifications partielles

**Référence :** Documentation outil Write

---

### 8. Tests Sans Décorateur @pytest.mark.django_db
**Date :** 2025-01-11
**Catégorie :** `Backend` | **Sévérité :** Moyenne

#### Erreur
```
RuntimeError: Database access not allowed, use the "django_db" mark
```

#### Impact
- Tests Django échouent sur accès DB
- Coverage incorrecte
- CI/CD bloquée

#### Cause
- Oublié `@pytest.mark.django_db` sur tests utilisant ORM
- Pytest isole DB par défaut pour performance
- Tests modèles/services touchent DB

#### Solution
```python
# ❌ INCORRECT - Pas de décorateur
def test_create_product():
    product = Product.objects.create(...)  # ❌ DB access denied

# ✅ CORRECT - Avec décorateur
@pytest.mark.django_db
def test_create_product():
    product = Product.objects.create(...)  # ✅ OK

# Ou pour toute la classe
@pytest.mark.django_db
class TestProductModel:
    def test_create(self):
        product = Product.objects.create(...)  # ✅ OK
```

#### Règle ABSOLUE
**Tests Django :**
- **TOUJOURS** `@pytest.mark.django_db` si ORM utilisé
- Appliquer sur classe entière si tous tests DB
- Vérifier pytest.ini contient `DJANGO_SETTINGS_MODULE`
- Utiliser fixtures avec `db` marker si setup complexe

**Référence :** `backend/commerce/tests/test_models.py`

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
- [ ] Aucun import inutilise dans les fichiers

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

**Derniere mise a jour :** 2025-01-11 (Module Commerce - 8 erreurs documentées)
**Maintenu par :** Djoko Christian + Claude Code

**Note :** Ce fichier DOIT etre mis a jour IMMEDIATEMENT apres chaque erreur significative.

---

## 📊 Statistiques Erreurs Module Commerce

**Développement Module Commerce (Janvier 2025) :**
- **Total erreurs documentées** : 8
- **Temps debug total estimé** : ~2 heures
- **Catégories** :
  - Backend : 6 erreurs (75%)
  - DevOps : 1 erreur (12.5%)
  - Tooling : 1 erreur (12.5%)
- **Sévérité** :
  - Bloquante : 2 erreurs
  - Majeure : 3 erreurs
  - Moyenne : 2 erreurs
  - Mineure : 1 erreur

**Leçon principale** : TOUJOURS lire les fichiers `models.py`, `services.py` AVANT d'écrire tests ou utiliser API.

**Économie temps future** : ~1.5 heures par module similaire si règles respectées.
