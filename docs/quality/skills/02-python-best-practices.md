# Skill 02 - python-best-practices

## Etat
- Statut: demarre
- Skill source: `.agents/skills/python-best-practices/`

## Audit initial
- Le module `accounts` contient plusieurs frontieres Python a faible precision:
  - signatures non typees dans `managers.py`, `backends.py`, `middleware.py`, `permissions.py`
  - exceptions trop larges dans le middleware de rate limiting et dans les commandes de management
  - service applicatif `account_deletion_service.py` robuste fonctionnellement, mais avec nettoyages annexes peu explicites
  - serializers avec propagation d'erreurs non contextualisee sur certains chemins
- Le module comporte aussi plusieurs gros fichiers, mais pour ce skill on cible d'abord les contrats Python et la propagation d'erreurs, pas un decoupage architectural complet.

## Scope retenu pour cette premiere passe
- Garder la progression module par module comme pour `python-code-style`.
- Commencer par `backend/apps/accounts/`.
- Renforcer d'abord:
  - signatures et retours explicites
  - `TypedDict`/types utilitaires la ou des payloads dict sont manipules
  - exceptions ciblees et chainees aux frontieres
  - helpers internes plus explicites quand ils reduisent les etats implicites

## Avancement du bloc `accounts`
- Renforcement des contrats Python sur:
  - `managers.py`
  - `backends.py`
  - `validators.py`
  - `permissions.py`
  - `middleware.py`
  - `serializers.py`
  - `services/account_deletion_service.py`
  - `management/commands/create_superuser_from_env.py`
  - `management/commands/setup_rbac.py`
- Changements notables:
  - signatures et retours explicites ajoutes sur les frontieres clefs du module
  - `EndpointRateLimitConfig` et `LoginRequestPayload` introduits dans le middleware
  - nettoyage des `except Exception` non necessaires dans le service de suppression et les commandes
  - preservation du comportement API du middleware avec prise en charge explicite de `RawPostDataException`
  - propagation d'erreurs serializer contextualisee avec `raise ... from err`
- Verifications executees:
  - `python3 -m ruff check backend/apps/accounts`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests tests/unit/test_rbac.py`
- Resultat: bloc `accounts` vert pour `python-best-practices`.

## Avancement du bloc `chat`
- Renforcement des contrats Python sur:
  - `domain/value_objects.py`
  - `services/conversation_service.py`
  - `services/message_service.py`
  - `services/auto_response_service.py`
  - `permissions.py`
  - `serializers.py`
  - `views.py`
  - `tasks.py`
- Changements notables:
  - aliases metier explicites (`MessageLanguage`, `MediaKind`, `SenderKind`) dans les value objects
  - signatures, retours et helpers de validation explicites dans les services de conversation et message
  - propagation d'erreurs domaine avec chainage lors de la validation contenu/media
  - `TypedDict` ajoute pour l'aperçu du dernier message cote serializer
  - views et permissions typees pour clarifier les frontieres DRF
- Verifications executees:
  - `python3 -m ruff check backend/apps/chat`
  - `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests`
- Resultat: bloc `chat` vert pour `python-best-practices`.

## Prochain bloc
## Avancement du bloc `commerce`
- Renforcement des contrats Python sur:
  - `domain/growth_calculator.py`
  - `domain/validators.py`
  - `services/product_service.py`
  - `services/order_service.py`
  - `services/cycle_simulation_service.py`
  - `services/feeding_suggestion_service.py`
  - `serializers.py`
  - `views.py`
- Changements notables:
  - `TypedDict` introduits pour les payloads de commande, snapshots d'adresse, previews de livraison, phases de simulation et suggestions d'aliments
  - signatures et retours explicites ajoutes sur les services `order`, `product`, `cycle_simulation` et `feeding_suggestion`
  - types metier reutilisables exposes dans le domaine (`DeliveryMethod`, `OrderItemPayload`, `WeightProgressionEntry`, `FeedingPhase`)
  - serializers et views DRF alignes sur ces contrats avec casts limites aux frontieres et erreurs contextualisees
  - propagation contextualisee de `ProductNotFoundError` depuis `ProductService.get_product_by_id`
- Verifications executees:
  - `python3 -m ruff check backend/apps/commerce`
  - `cd backend && python3 -m pytest apps/commerce/tests`
- Resultat: bloc `commerce` vert pour `python-best-practices`.

## Prochain bloc
## Avancement du bloc `notifications`
- Renforcement des contrats Python sur:
  - `services.py`
  - `serializers.py`
  - `views.py`
  - `tasks.py`
- Changements notables:
  - aliases metier explicites pour les canaux, priorites et metadonnees JSON des notifications
  - services types avec retours explicites pour creation unitaire, bulk, lecture et suppression
  - filtrage des canaux factorise pour eviter les etats implicites entre preferences globales et type-specifiques
  - payloads Celery explicites pour l'email et Expo Push, avec helpers dedies pour persister les erreurs neutres
  - views et serializers DRF types pour clarifier les frontieres et les payloads exposes
- Verifications executees:
  - `python3 -m ruff check backend/apps/notifications`
  - `cd backend && python3 -m pytest apps/notifications/tests`
- Resultat: bloc `notifications` vert pour `python-best-practices`.

## Prochain bloc
## Avancement du bloc `aquaculture`
- Renforcement des contrats Python sur:
  - `services/base.py`
  - `services/cycle_service.py`
  - `services/log_service.py`
  - `services/analytics_service.py`
  - `services/report_service.py`
  - `views/report_views.py`
  - zones ciblees de `serializers.py` (bulk logs et rapports)
- Changements notables:
  - aliases et `TypedDict` introduits pour les payloads de creation de cycle, sync bulk de logs, statistiques analytiques et snapshots de rapports
  - signatures et retours explicites ajoutes sur les services `cycle`, `log`, `analytics` et `report`
  - frontiere DRF des rapports typee pour clarifier les payloads de generation, validation et partage
  - service de rapports aligne sur des structures de snapshot explicites (`report_meta`, `farm`, `summary`, `cycles`)
  - `safe_divide` du service de base resserre sur des entrees numeriques explicites
- Verifications executees:
  - `python3 -m ruff check backend/apps/aquaculture`
  - `cd backend && python3 -m pytest apps/aquaculture/tests`
- Resultat: coeur du bloc `aquaculture` vert pour `python-best-practices`, sans regression sur la suite complete du module.

## Prochain bloc
## Avancement du bloc `common`
- Renforcement des contrats Python sur:
  - `admin_mixins.py`
- Changements notables:
  - signatures explicites ajoutees sur les mixins admin et leurs retours
  - helper de verification de groupe extrait pour reduire la duplication des mixins RBAC
  - remplacement du `except Exception` par `FieldDoesNotExist` sur la detection de champs readonly proteges
- Verifications executees:
  - `python3 -m ruff check backend/apps/common`
- Resultat: bloc `common` vert pour `python-best-practices`.

## Avancement du bloc `mavecam_api`
- Renforcement des contrats Python sur:
  - `urls.py`
  - `celery.py`
  - `settings/__init__.py`
  - `settings/base.py`
  - `settings/development.py`
  - `settings/production.py`
  - `settings/staging.py`
  - `settings/test.py`
- Changements notables:
  - selection explicite du module de settings avec prise en charge claire de `staging`
  - helpers simples et types explicites pour les lectures d'environnement critiques dans `settings/base.py`
  - `health_check` resserre sur `DatabaseError` au lieu d'un `except Exception`
  - normalisation des listes CSV d'hosts pour les environnements `development`, `production` et `staging`
  - nettoyage de la configuration de tests avec helper dedie pour neutraliser PostgreSQL avant import de `base.py`
- Verifications executees:
  - `python3 -m ruff check backend/apps/common backend/mavecam_api`
  - `cd backend && python3 -m pytest`
- Resultat: bloc `mavecam_api` vert pour `python-best-practices`.

## Etat du skill backend
- Le skill `python-best-practices` est maintenant couvre sur l'ensemble du backend:
  - `accounts`
  - `chat`
  - `commerce`
  - `notifications`
  - coeur `aquaculture`
  - `common`
  - `mavecam_api`

## Prochaine etape
- Skill 3: `django-security`
- Priorite recommandee: `mavecam_api/settings`, permissions DRF, rate limiting, `AllowAny`, cookies/CSRF/CORS et `except Exception` encore trop larges sur les frontieres HTTP.

## Exclusions volontaires
- Pas de refactor DDD/architecture lourde dans ce skill.
- Pas d'introduction de `mypy`/`pyright` a ce stade.
- Pas de changement contractuel d'API HTTP sans justification metier.
