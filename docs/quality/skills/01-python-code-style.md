# Skill 01 - python-code-style

## Etat
- Statut: baseline backend complete stabilisee
- Skill source: `.agents/skills/python-code-style/`

## Audit initial
- `pyproject.toml` absent a la racine, donc aucun standard Python centralise.
- `ruff` absent des dependances de dev backend.
- Aucun job CI dedie au style Python dans [pull-request-tests.yml](/Users/apple/Desktop/projects/AquaCare/.github/workflows/pull-request-tests.yml).
- Styles heterogenes visibles sur des fichiers exposes:
  - [account_deletion_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/accounts/services/account_deletion_service.py)
  - [value_objects.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/chat/domain/value_objects.py)
- Plusieurs tres gros fichiers Python existent dans `aquaculture`, mais ils sont hors scope de ce premier passage pour eviter un reformatage massif a risque.

## Scope retenu pour cette premiere PR
- Ajouter une configuration Ruff minimale et reproductible.
- Declarer `ruff` en dependance de developpement backend.
- Brancher un job CI bloquant sur les principaux modules backend.
- Avancer module par module jusqu'a couvrir les blocs metier backend.

## Avancement du bloc `accounts`
- Auto-fix Ruff applique sur l'ensemble du module.
- Residu manuel traite sur:
  - `tests/conftest.py`
  - `tests/test_api_endpoints.py`
  - `tests/test_middleware.py`
  - `views.py`
- Le job CI `python-code-style` cible maintenant `backend/apps/accounts`.
- Verifications executees:
  - `python3 -m ruff check backend/apps/accounts`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests`
- Resultat: bloc `accounts` vert pour `python-code-style`.

## Avancement du bloc `chat`
- Auto-fix Ruff applique sur l'ensemble du module.
- Residu manuel traite sur:
  - `services/message_service.py`
  - `tests/test_api.py`
  - `tests/test_services.py`
- Verifications executees:
  - `python3 -m ruff check backend/apps/chat`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests`
- Resultat: bloc `chat` vert pour `python-code-style`.

## Avancement du bloc `commerce`
- Auto-fix Ruff applique sur l'ensemble du module.
- Residu manuel traite sur:
  - `admin.py`
  - `services/order_service.py`
  - `tests/test_endpoints.py`
  - `tests/test_views.py`
- Verifications executees:
  - `python3 -m ruff check backend/apps/commerce`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests`
- Resultat: bloc `commerce` vert pour `python-code-style`.

## Avancement du bloc `notifications`
- Auto-fix Ruff applique sur l'ensemble du module.
- Residu manuel traite sur:
  - `tests/test_models.py`
- Verifications executees:
  - `python3 -m ruff check backend/apps/notifications`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests`
- Resultat: bloc `notifications` vert pour `python-code-style`.

## Avancement du bloc `aquaculture`
- Auto-fix Ruff applique sur l'ensemble du module.
- Residu manuel traite sur:
  - `apps.py`
  - `admin.py`
  - `models.py`
  - `serializers.py`
  - `services/analytics_service.py`
  - `services/dashboard_service.py`
  - `services/report_service.py`
  - `signals.py`
  - `tests/conftest.py`
  - `tests/domain/test_calculators.py`
  - `tests/services/test_cycle_service.py`
  - `tests/services/test_feeding_service.py`
  - `tests/services/test_log_service.py`
  - `tests/test_views.py`
- Point de vigilance corrige pendant la validation:
  - `AquacultureConfig.ready()` recharge explicitement les signaux pour conserver la creation de `CycleMetrics`, la mise a jour des cycles et les notifications derivees.
- Verifications executees:
  - `python3 -m ruff check backend/apps/aquaculture`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests`
- Resultat: bloc `aquaculture` vert pour `python-code-style`.

## Avancement du backend support
- Perimetre couvre maintenant:
  - `backend/apps/common/`
  - `backend/mavecam_api/`
  - `backend/tests/`
  - `backend/manage.py`
- Residu manuel traite sur:
  - `apps/common/admin_mixins.py`
  - `mavecam_api/celery.py`
  - `mavecam_api/settings/base.py`
  - `mavecam_api/settings/development.py`
  - `mavecam_api/settings/production.py`
  - `mavecam_api/urls.py`
  - `tests/conftest.py`
  - `tests/fixtures/__init__.py`
  - `tests/fixtures/factories.py`
  - `tests/unit/test_rbac.py`
- Exceptions Ruff documentees dans `pyproject.toml` pour les settings Django a `import *`:
  - `mavecam_api/settings/__init__.py`
  - `mavecam_api/settings/development.py`
  - `mavecam_api/settings/production.py`
  - `mavecam_api/settings/staging.py`
  - `mavecam_api/settings/test.py`
- Verifications executees:
  - `python3 -m ruff check backend/manage.py backend/apps backend/mavecam_api backend/tests`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest`
- Resultat: couverture `python-code-style` complete sur tout le backend Python.

## Etat CI actuel
- Le job `python-code-style` couvre maintenant:
  - `backend/manage.py`
  - `backend/apps/`
  - `backend/mavecam_api/`
  - `backend/tests/`

## Phase suivante recommandee
- Le skill `python-code-style` est termine sur l'ensemble du backend Python.
- La suite logique de la campagne est le skill `python-best-practices`.

## Bloc d'execution retenu
- Bloc 1: `backend/apps/accounts/`
- Bloc 2: `backend/apps/chat/`
- Bloc 3: `backend/apps/commerce/`
- Bloc 4: `backend/apps/notifications/`
- Bloc 5: `backend/apps/aquaculture/`
- Bloc 6: `backend/apps/common/ + backend/mavecam_api/ + backend/tests/ + backend/manage.py`

Rationale:
- `accounts` est plus compact et tres expose.
- `aquaculture` est de loin le plus gros bloc et doit arriver apres stabilisation de la baseline.

## Exclusions volontaires
- Pas de reformatage global du backend en une seule passe.
- Pas d'activation de `mypy`/`pyright` a ce stade.
- Pas de modification comportementale liee a la logique metier.

## Changement attendu apres cette PR
- AquaCare dispose d'une baseline Python de style outillee.
- Le repo peut etendre progressivement le perimetre `ruff` sans re-partir de zero.
- Les prochains skills peuvent s'appuyer sur un socle de conventions stable.
