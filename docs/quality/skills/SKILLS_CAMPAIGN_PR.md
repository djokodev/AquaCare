# PR - Skills Quality Campaign

## Titre propose

`feat: complete skills-driven quality hardening campaign`

## Resume

Cette PR cloture la campagne d'amelioration qualite pilotee par skills sur AquaCare.

Le chantier couvre:
- 9 skills backend
- 1 skill frontend
- la suppression des warnings backend restants
- la stabilisation des garde-fous de validation

## Changements majeurs

### Backend
- baseline Ruff et garde-fou CI Python
- renforcement des contrats Python et des signatures applicatives
- durcissement securite Django et DRF
- optimisation ORM et performance sur les hotspots metier
- tests renforces sur les frontieres critiques
- clarifications Clean/DDD/Hexagonal sur les modules coeur

### Frontend
- ecrans list-heavy virtualises
- navigation et app shell allegees
- reduction des imports barrel internes
- optimisation de surfaces critiques `main`, `aquaculture`, `commerce`, `chat`

### Hygiene projet
- warnings backend de reference elimines
- suivi de campagne documente dans `docs/quality/skills/`
- contexte projet mis a jour

## Validation

### Backend
- `docker-compose exec api env DJANGO_SETTINGS_MODULE=mavecam_api.settings.test pytest -q`
- resultat: `873 passed`

### Frontend
- `cd frontend && npx tsc --noEmit`
- `cd frontend && npm test -- --watchAll=false`
- resultat: `52 suites passees`, `547 tests passes`

## Risques / attention reviewer

- campagne large mais decoupee en commits thematiques stables
- presence volontaire des skills installes dans le repo pour persistance de l'environnement de travail
- symlinks `.claude/skills/*` -> `.agents/skills/*` suivis dans Git

## Commits principaux

- `bb468fa` style Python backend
- `cbcec7a` best practices Python backend
- `2cd24b4` securite Django backend
- `4790f88` optimisation ORM backend
- `cb05cb8` design patterns backend
- `7f5105c` standardisation DRF backend
- `e177f36`, `8ca6605` campagne tests backend
- `678a858` optimisations performance backend
- `b326f1f` frontieres Clean/DDD backend
- `0c9c514` optimisation React Native frontend
- `ca87b05` elimination des warnings backend

## Post-merge

- merger cette branche vers `develop`
- valider le pipeline CI complet
- merger ensuite `develop` vers `main`
