# Skill 08 - python-performance-optimization

## Audit initial

### Bloc 1 - accounts
- le module `backend/apps/accounts/` n'expose pas de hotspot CPU evident: pas de boucle lourde, pas de traitement batch volumineux, pas de calcul repetitif sensible
- les chemins qui meritent une vraie verification perf sont surtout des frontieres HTTP tres sollicitees:
  - `POST /api/accounts/register/`
  - `POST /api/accounts/login/`
  - `GET /api/accounts/profile/`
  - `GET /api/accounts/farm/`
- l'audit du code montre que la plupart des acces ORM critiques etaient deja cadres par les skills precedents:
  - `login` charge deja `farm_profile` via `User.objects.get_by_login_name()` / `get_by_natural_key()`
  - `profile` et `farm_profile` utilisent deja `select_related(...)`
  - l'admin `accounts` evite deja les N+1 sur ses listes principales
- le seul cout ORM clairement evitable trouve a ce stade est sur `register`:
  - l'utilisateur et son `farm_profile` etaient recrees puis relus par une requete supplementaire uniquement pour preparer la reponse JSON
- exclusions volontaires de ce bloc:
  - pas d'optimisation speculative du middleware de rate limit tant qu'aucune mesure ne montre un cout reel
  - pas de changement sur `AccountDeletionService`, flux rare et non critique en latence a ce stade
  - pas de sous-classe globale de `JWTAuthentication` pour l'instant, car le gain du bloc `accounts` n'exige pas encore une modification transversale du backend

## Plan d'execution

### Bloc 1 - accounts
- supprimer la relecture ORM superflue apres inscription reussie
- conserver l'objet `farm_profile` en cache sur l'instance `User` retournee par le manager
- verrouiller les budgets de requetes sur les endpoints critiques:
  - `register`
  - `login`
  - `profile`
  - `farm_profile`
- relancer la suite du module `accounts` pour verifier qu'aucune regression fonctionnelle n'est introduite

## Execution

### Bloc 1 - accounts
- `UserManager._create_farm_profile()` retourne maintenant l'instance creee et alimente le cache relationnel `user.farm_profile`
- la creation automatique du `FarmProfile` passe par un `save(validate=False)` uniquement sur ce chemin interne controle par le manager, ce qui evite trois verifications ORM d'unicite redondantes
- `RegisterView.create()` ne relit plus l'utilisateur en base apres `serializer.save()`
- des tests de budget de requetes ont ete ajoutes sur les endpoints critiques du module:
  - inscription reussie
  - connexion par `login_name`
  - consultation du profil utilisateur
  - consultation du profil ferme

## Etat courant
- bloc `accounts` valide
- bloc `aquaculture` valide
- bloc `commerce` valide
- bloc `notifications` valide
- bloc `chat` valide
- surfaces support `common` et `mavecam_api` auditees sans hotspot justifiant un refactor
- conclusion du bloc:
  - `login`, `profile` et `farm_profile` etaient deja correctement bornes en nombre de requetes
  - le gain retenu sur `register` combine deux reductions:
    - suppression de la relecture ORM de l'utilisateur juste apres creation
    - suppression des validations d'unicite redondantes lors de l'auto-creation du `FarmProfile`
  - budgets verrouilles:
    - `register`: `4` requetes
    - `login` par `login_name`: `2` requetes (lookup utilisateur + persistence `OutstandingToken`)
    - `profile`: `1` requete
    - `farm_profile`: `1` requete
- sur `aquaculture`, le gain retenu porte sur la construction du dashboard et des analytics:
  - pre-calcul des buckets de logs par cycle dans `DashboardService`
  - reutilisation de buckets memoises dans `AnalyticsService`
  - suppression des rescans repetes des memes `prefetched_logs` / `analytics_logs`
- sur `commerce`, le gain retenu porte sur les suggestions d'aliments:
  - chargement des cycles actifs une seule fois
  - chargement des logs bornes une seule fois par cycle
  - reutilisation d'une liste unique de produits disponibles par espece
  - suppression des `count()`, `aggregate()` et filtres ORM repetes a l'interieur des boucles de phase
  - budget verrouille sur le flux simple `get_feeding_suggestions()`: `3` requetes
- sur `notifications`, le gain retenu porte sur les taches async email/push et le scheduling:
  - chargement `Notification + user` en une seule requete sur les tasks
  - persistance des erreurs via `UPDATE` direct au lieu de `get() + save()`
  - chargement minimal des tokens push actifs
  - scheduling borne sur un chargement partiel `id + channels`
  - budgets verrouilles:
    - `send_email_notification_task` succes: `2` requetes
    - `send_push_notification_task` succes: `4` requetes
- sur `chat`, le gain retenu porte sur la coordination conversation/messages:
  - suppression de la relecture inutile dans `get_or_create_conversation()`
  - remplacement des `save()` de coordination par des `UPDATE` directs sur `last_message_at`, `updated_at` et les compteurs unread
  - suppression du surcout des transactions imbriquees pour ces helpers unitaires
  - budgets verrouilles:
    - `get_or_create_conversation()` sur conversation existante: `1` requete
    - `update_last_message_timestamp()`: `1` requete
    - `increment_unread_count()`: `1` requete
    - `reset_unread_count()`: `1` requete
- audit support:
  - `backend/apps/common/` et `backend/mavecam_api/` ne montrent pas de flux chaud backend justifiant une optimisation a ce stade
  - aucune optimisation speculative retenue sur l'admin RBAC ou le parsing settings
- backend complet pour ce skill

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests`

## Verification blocs suivants
- `python3 -m ruff check backend/apps/aquaculture/services/dashboard_service.py`
- `python3 -m ruff check backend/apps/aquaculture/services/analytics_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/test_views.py -k dashboard`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/services/test_analytics_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/test_views.py -k statistics`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests`
- `python3 -m ruff check backend/apps/commerce`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests/test_services.py -k feeding_suggestions`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests/test_views.py -k feeding_suggestions`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests`
- `python3 -m ruff check backend/apps/notifications`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests/test_tasks.py -k "two_queries or four_queries or send_push_notification_task_success or send_email_notification_task_success"`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests`
- `python3 -m ruff check backend/apps/chat backend/apps/notifications`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests/test_services.py -k "single_query or update_last_message_timestamp or increment_unread_count_user or reset_unread_count_user"`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests`
- `python3 -m ruff check backend/apps/common backend/mavecam_api`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest`
