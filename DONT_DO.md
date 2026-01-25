# DONT_DO.md

Erreurs a ne pas repeter. Consultation rapide avant de coder.

## Frontend

### TypeScript
```typescript
// NON - crash si undefined
if (farmProfile.total_area_m2 > 0)

// OUI - defensive
if ((farmProfile.total_area_m2 || 0) > 0)
```

### Traductions
```typescript
// NON - hardcode
<Text>Statut juridique</Text>

// OUI - i18next
<Text>{t('legalStatus')}</Text>
// + ajouter dans fr.ts ET en.ts
```

### Console.log
```typescript
// NON - laisser en prod
console.log('DEBUG:', data)

// OUI - supprimer avant commit
// Garder uniquement console.error() metier
```

### Packages Expo
```bash
# NON - npm install direct
npm install react-native-camera

# OUI - verifier compatibilite Expo Go
# 1. Chercher sur https://reactnative.directory/ tag "Expo Go"
# 2. expo install expo-camera
```

## Backend

### Tests Django - Lire avant d'ecrire
```python
# NON - deviner les noms
User.objects.create_user(phone="+237...")  # phone_number!
Product(target_species="tilapia")          # species!

# OUI - lire models.py AVANT
# Copier noms exacts : phone_number, species, price_per_package
```

### Tests Django - Champs requis
```python
# NON - oublier champs null=False
Product.objects.create(name="Test", brand="test")
# IntegrityError: NOT NULL constraint failed

# OUI - tous champs requis
Product.objects.create(
    name="Test",
    brand="aller_aqua",
    species="tilapia",
    protein_percentage=32,
    lipid_percentage=10,      # obligatoire!
    package_weight_kg=20,
    price_per_package=30000
)
```

### Tests Django - Decorateur DB
```python
# NON - oublier decorateur
def test_create_product():
    Product.objects.create(...)  # RuntimeError: Database access not allowed

# OUI - marquer acces DB
@pytest.mark.django_db
def test_create_product():
    Product.objects.create(...)
```

### Migrations
```bash
# NON - migrer sans backup prod
python manage.py migrate

# OUI - backup d'abord
python manage.py dumpdata > backup_$(date +%Y%m%d).json
python manage.py migrate
```

## DevOps

### Secrets Git
```bash
# NON - committer .env
git add .env  # JAMAIS

# OUI - ignorer
echo ".env" >> .gitignore
git rm --cached .env
```

### Encodage UTF-8
```python
# NON - accents sans encoding
open('file.py', 'w')  # SyntaxError sur "génération"

# OUI - specifier encoding
open('file.py', 'w', encoding='utf-8')
```

## Regles d'or

1. **Lire avant d'ecrire** - Toujours Read models.py/services.py avant tests
2. **Defensive coding** - Tous les optionnels avec `|| default` ou `?.`
3. **Bilinguisme** - Jamais de texte hardcode, toujours t('key')
4. **Expo Go** - Verifier compatibilite AVANT npm install
5. **Backup prod** - Jamais de migration sans backup

---
*Ajouter ici chaque nouvelle erreur rencontree*
