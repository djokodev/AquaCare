# AGENTS.md

Guide rapide pour Codex sur le projet AquaCare. Lis ce fichier avant toute tache.

## Objectif et workflow
- Role de Codex: proposer un plan, appliquer les modifications, signaler ce qui reste a valider (tests, build, assets), creer des fonctionnalites, resoudre des bugs etc.
- Toujours verifier les docs projet avant de coder (CLAUDE.md, ARCHITECTURE.md, DESIGN_SYSTEM.md, PROJECT_CONTEXT.md, DONT_DO.md).
- Demander validation utilisateur avant toute action a risque (install deps, changement infra, acces reseau).

## Contexte projet
- Stack: backend Django 4.2+ / DRF (Clean Architecture + DDD), frontend React Native Expo SDK 51+ TypeScript strict, Redux Toolkit, React Navigation 6, i18next FR/EN, Axios avec interceptors JWT, SecureStore.
- Modules: Auth/Profils, Aquaculture (cycles, logs, feeding plans, sanitary logs, analytics), Commerce (catalogue, panier, commandes, suggestions, simulation). Etat annonce: modules core completes.
- CI/CD: GitHub Actions `pull-request-tests.yml` (pytest backend, npm test, tsc) et `deploy.yml` (tests backend, build/push images API+Nginx, deploy VPS).

## Arborescence
- backend/: apps Django (accounts, aquaculture, commerce), mavecam_api settings, tests/, requirements/, nginx/, scripts/.
- frontend/: src/{screens, components, hooks, services, store, navigation, i18n, constants, domain, utils}, App.tsx, package.json, tsconfig.json.
- Docs racine: ARCHITECTURE.md, DESIGN_SYSTEM.md, PROJECT_CONTEXT.md (changelog), DONT_DO.md, CLAUDE.md.
- .claude/: commands/ (templates check-package, create-*feature, update-changelog), fichiers metier PDF (cahier de charge, guides nutrition), settings.local.json.

## Commandes et scripts
- Frontend (depuis `frontend/`): `npm install`; `npm start`; `npm run android|ios|web`; tests `npm test`, `npm test -- --coverage`, typecheck `npx tsc --noEmit --pretty`.
- Backend local (pip): `cd backend`; `pip install -r requirements/development.txt` (ou requirements.txt); `python manage.py makemigrations`; `python manage.py migrate`; `python manage.py runserver`; **critique** `python manage.py load_nutritional_data`; tests `pytest --cov=apps --cov-report=term --cov-report=xml -v` avec `DJANGO_SETTINGS_MODULE=mavecam_api.settings.test`.
- Backend dockerise (local dev): `cd backend`; preparer `.env` a partir de `.env.example` (POSTGRES_*, DJANGO_*); `docker-compose up -d --build`; acces API sur `http://localhost:8000`; pour commandes manage.py: `docker-compose exec api python manage.py load_nutritional_data` puis migrations si besoin.
- Backend dockerise (prod): `docker-compose -f docker-compose.prod.yml up -d` (utilise images GHCR `aquacare-api` et `aquacare-nginx`); requires variables env remplies.
- CI: Pull requests passent `pull-request-tests.yml` (pytest backend, npm test, tsc). `deploy.yml` build/push images API+Nginx vers GHCR puis deploy VPS.
- NativeWind/Babel: preset local `./nativewind-preset` filtre le plugin `react-native-worklets/plugin` (non installe). Babel config utilise `presets: ['babel-preset-expo', './nativewind-preset']` + plugins module-resolver et reanimated (dernier).
- PowerShell: preferer `Set-Location frontend; npx tsc --noEmit` (plutot que `cd frontend && ...`) pour eviter l'erreur de separateur `&&`.
- Encodage: garder les fichiers frontend en UTF-8/ASCII (eviter caracteres speciaux qui s'affichent en �?); privilegier separateurs ASCII (`-`, `|`) au lieu de puces exotiques.
- Git/branche: travailler sur la branche courante `feature/commerce-module`; faire des commits frequents apres chaque bloc de modifs stable (refactor ecran, setup) pour pouvoir revenir a un etat sain.
- Langue reponses: repondre en francais.

## Rappels critiques (frontend)
- Expo/Expo Go only: verifier compatibilite sur https://reactnative.directory/ et preferer `expo install`.
- TypeScript strict, defensive: gerer null/undefined, optional chaining, valeurs par defaut.
- i18n obligatoire: aucun texte hardcode; utiliser `t('key')` et ajouter FR/EN dans `frontend/src/i18n/locales/{fr,en}.ts`.
- Nettoyage et verification: `npx tsc --noEmit`; `npm test -- --watchAll=false` si pertinent.
- Structure: ecrans dans `src/screens/...`, composants reutilisables dans `src/components`, logique dans `src/hooks` et `src/store` (Redux Toolkit), services HTTP dans `src/services` (Axios interceptors JWT). Navigation typage strict RootStack/Tab.
- Theming: charte MAVECAM vert (#059669) + declinaisons (voir CLAUDE.md/DESIGN_SYSTEM.md). Respecter styles et accesibilite (public peu technophile).
- Offline-first: UUID client, sync metadata (created_offline, synced_at, client_uuid) deja geree; ne pas casser cette logique.
- Navigation/types: `frontend/src/navigation/MainNavigator.tsx` expose `RootStackParamList`; utiliser `StackNavigationProp<RootStackParamList, 'Route'>` et importer depuis ce fichier.
- Store/Services: slices Redux Toolkit dans `frontend/src/store`; thunks et services HTTP dans `frontend/src/services` (Axios + refresh token). Reutiliser les interceptors existants.
- i18n procedure: nouvelle cle -> ajouter dans `fr.ts` ET `en.ts`, utiliser `t('key')`, tester le toggle langue (Settings).
- Design system (extrait): palette GREEN_PRIMARY #059669, GREEN_LIGHT #10b981, GREEN_DARK #047857, CREAM #f8fafc, GRAY_DARK #1e293b, GRAY_LIGHT #64748b; typo system (SF/Roboto) avec hierarchie h1 32/40 bold, h2 24/32 bold, body 16/24. Voir DESIGN_SYSTEM.md pour espacements/ombres/patterns.

## Rappels critiques (backend)
- Clean Architecture: domain (pure Python) -> services (application) -> infrastructure (Django). Ne pas croiser les dependances a l'envers.
- Auth: JWT (access 15m, refresh 7j), user par telephone +237; FarmProfile 1-1.
- Commande obligatoire pour nutrional guides: `python manage.py load_nutritional_data` (fixtures `apps/aquaculture/fixtures/nutritional_guides.json`) pour alimenter l'ecran NutritionalGuides (via conteneur: `docker-compose exec api python manage.py load_nutritional_data`).
- Tests backend: `pytest --cov=apps --cov-report=term --cov-report=xml` (voir `backend/pytest.ini`). Param env test: `DJANGO_SETTINGS_MODULE=mavecam_api.settings.test`.
- Prod statiques/media: Nginx sert /static et /media (voir CLAUDE.md, backend/nginx/).
- Settings: `backend/mavecam_api/settings/{base,development,production,test}.py`; env locaux via `.env`/`.env.example`.
- Ajouts metier: nouvelle logique -> `apps/aquaculture/domain/*` ou `services/*`; endpoints/serializers/views dans la couche infrastructure en respectant les dependances.

## Taches typiques
- Lecture rapide: utiliser `rg` pour chercher; `Get-Content -Head` pour apercu.
- Avant package RN: `/check-package` (voir .claude/commands) ou procedure Expo Go.
- Nouvelle feature: suivre templates `.claude/commands/create-frontend-feature.md` ou `create-backend-feature.md` (plan -> validation -> implementation -> tests).
- Changelog: apres feature validee, MAJ PROJECT_CONTEXT.md (voir `/update-changelog`).
- Navigation: enregistrer nouveaux ecrans dans MainNavigator/AppNavigator; mettre a jour `RootStackParamList` et les types de navigation.
- Store/API: nouvelle ressource -> creer service HTTP + slice/thunks associes; respecter interceptors JWT et gestion offline si applicable.

## Pendant l'implementation
- Frontend: respecter la structure et le style existants (navigation typage strict, Redux Toolkit, services Axios, i18n, design system MAVECAM). Rester aligné avec le rendu actuel; proposer une amélioration UI/UX seulement si clairement supérieure et validée.
- Backend: suivre l'architecture Clean/DDD (domain -> services -> infrastructure), patterns déjà en place (services, serializers, viewsets). Rester cohérent; si une approche plus solide est identifiée, la proposer pour validation avant de modifier.

## Quand poser des questions
- Specs metier ambigus (voir PDFs .claude: aqua_catfish_handbook.pdf, Ration_alimentaire_croissance.pdf, CATALOGUE ALIMENT POISSONS.pdf, cahier de charge `.claude/cachier_charge_v1.mdc`).
- Choix UI/UX non couverts par DESIGN_SYSTEM.md.
- Installation de package non-expo ou changement schema DB/migrations majeurs.

## Checklists rapides
- Avant de coder: lire demande + fichiers touches, identifier impact i18n/design/offline, consulter doc officielle si nouvelle lib.
- Pendant: aucun texte hardcode, aucun console.log final, types stricts (null/undefined), compatibilite Expo, navigation typage strict.
- Apres: `npx tsc --noEmit` (frontend); `npm test` si logique critique; `pytest` si backend change; traductions FR/EN ajoutees; proposer MAJ PROJECT_CONTEXT.md/README si besoin.
- Erreur courante PowerShell: `Get-Content` sur un dossier retourne "Access denied". Pour lister un dossier, utiliser `Get-ChildItem path` ou `ls path`; pour lire un fichier, cibler le fichier directement.

## Definition of done (projet)
- Code conforme TypeScript/Python, zero console.log debug, i18n complet, respect charte MAVECAM.
- Tests proposes (tsc, npm test, pytest) avec instructions si non executes.
- Documentation mise a jour si impact (PROJECT_CONTEXT.md, README.md, CLAUDE.md si regles changent).
