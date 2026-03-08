# Skill 09 - clean-ddd-hexagonal

## Audit initial

### Bloc 1 - accounts
- le module `backend/apps/accounts/` est globalement sain mais reste encore trop centre sur la couche HTTP pour certains flux
- le domaine reste simple:
  - `User` et `FarmProfile` portent deja des regles metier directes
  - `AccountDeletionService` joue deja un vrai role applicatif
- l'ecart principal avec une separation clean/hexagonale utile se situe sur la frontiere application/infrastructure:
  - `views.py` portait encore la construction des payloads auth JWT
  - `views.py` faisait directement les lectures ORM `User/FarmProfile` pour les profils
  - la logique de logout connaissait directement `RefreshToken` et `TokenError` dans l'adapter HTTP
- exclusions volontaires:
  - pas d'introduction de repository abstrait sur `accounts`, car le domaine reste encore trop simple pour justifier cette couche
  - pas de refonte du modele `User` en aggregate plus complexe
  - pas de CQRS artificiel

### Bloc 2 - chat
- le module `backend/apps/chat/` avait deja des services metier utiles, mais la frontiere applicative restait encore trop diffuse
- l'ecart principal etait partage entre deux endroits:
  - `views.py` orchestrait directement des use cases applicatifs (`get_or_create`, envoi de message, marquage lu, chargement du feed)
  - `signals.py` decidait encore la politique metier des effets post-message (acknowledgment, notification user/admin)
- le domaine et les services existants etaient suffisants:
  - pas besoin d'introduire un repository ou un port artificiel sur ce module
  - pas besoin de transformer `Conversation` en aggregate plus lourd
- exclusions volontaires:
  - pas de CQRS artificiel pour les lectures de conversation
  - pas de redecoupage des services `ConversationService` / `MessageService` tant qu'ils gardent une responsabilite claire

### Bloc 3 - commerce
- le module `backend/apps/commerce/` etait fonctionnellement solide, mais sa frontiere applicative restait diluee entre views et serializers
- l'ecart principal se trouvait a deux niveaux:
  - `views.py` orchestrait encore directement plusieurs use cases catalogue/simulation
  - `serializers.py` declenchait encore des cas d'usage (`create`, `preview_delivery_fee`) au lieu de rester sur la validation des entrees
- les services metier existants etaient deja bien poses:
  - `OrderService`, `ProductService`, `FeedingSuggestionService` et `CycleSimulationService` n'avaient pas besoin d'etre remplaces
  - le besoin reel etait d'ajouter une couche applicative explicite par-dessus
- exclusions volontaires:
  - pas d'introduction de repository ou d'unit of work artificiels
  - pas de CQRS separe pour lecture/commande
  - pas de refonte des aggregates `Order` / `Product`

### Bloc 4 - notifications
- le module `backend/apps/notifications/` avait une bonne base metier, mais la couche API continuait a porter des use cases applicatifs explicites
- l'ecart principal se trouvait dans `views.py`:
  - politique de propriete sur `mark_read` et `destroy`
  - aggregation de statistiques inbox
  - enregistrement/mise a jour des tokens push
  - chargement et mise a jour des preferences utilisateur
- le fichier `services.py` restait utile comme service metier transverse de creation/diffusion
- le besoin reel n'etait pas de le decouper, mais d'ajouter une couche applicative dediee au-dessus
- exclusions volontaires:
  - pas de redecoupage de `services.py` en package complet
  - pas de changement de la logique Celery ou du dispatch infra
  - pas de port/adapter artificiel pour les preferences ou push tokens

### Bloc 5 - aquaculture
- le module `backend/apps/aquaculture/` portait encore une couche applicative trop eparpillee dans ses vues
- l'ecart principal n'etait plus seulement `report_views.py`, mais l'ensemble des frontieres HTTP custom:
  - `sync_views.py` normalisait le payload, pilotait la validation et decidait le code HTTP
  - `cycle_views.py` orchestrait encore les use cases `create`, `harvest`, `statistics`, `comparison`
  - `log_views.py` gerait l'upsert par date et le recalcul de cycles affectes
  - `feeding_views.py` pilotait le chargement du cycle et la generation multi-semaines
  - `sanitary_views.py` portait encore l'orchestration des resolutions et regroupements
  - `dashboard_views.py` hydratait lui-meme le payload de presentation
  - `report_views.py` portait encore le workflow des rapports
- exclusions volontaires:
  - pas d'introduction de repositories artificiels sur `ProductionCycle`, `CycleLog` ou `SanitaryLog`
  - pas de CQRS separe pour lectures/commandes du bounded context aquaculture
  - pas de changement des signatures Celery ni des services metier bas niveau (`SyncService`, `ReportService`, etc.)

## Plan d'execution

### Bloc 1 - accounts
- extraire l'orchestration auth dans un service applicatif dedie
- extraire les lectures de profil dans un service applicatif dedie
- laisser les vues comme adapters HTTP fins:
  - validation serializer
  - delegation au use case/service applicatif
  - mapping de la reponse DRF
- verifier que tous les endpoints `register/login/logout/profile/farm_profile` gardent exactement le meme contrat observable

### Bloc 2 - chat
- extraire un service applicatif dedie aux use cases exposes par l'API chat
- conserver `ConversationService` et `MessageService` comme services metier / coordination de plus bas niveau
- laisser `views.py` comme adapter HTTP fin:
  - auth / permission / serializer
  - delegation au service applicatif
  - mapping des reponses DRF
- extraire la politique applicative des effets post-message pour que `signals.py` ne decide plus lui-meme des regles metier
- verifier les contrats observables:
  - `GET /conversations/`
  - `GET /conversations/me/`
  - `GET /conversations/{id}/messages/`
  - `POST /conversations/{id}/send_message/`
  - `POST /conversations/{id}/mark_read/`

### Bloc 3 - commerce
- introduire deux services applicatifs explicites:
  - un pour le catalogue / recommandations / suggestions / simulations
  - un pour les commandes / preview livraison / statistiques / confirmation reception
- faire redevenir les serializers de simples frontieres de validation
- laisser `views.py` comme adapter HTTP fin:
  - validation DRF
  - delegation au use case applicatif
  - mapping des erreurs HTTP
- verifier les contrats observables:
  - `GET /products/`
  - `GET /products/featured/`
  - `GET /products/for_cycle/{cycle_id}/`
  - `GET /products/recommended/`
  - `GET /products/feeding_suggestions/`
  - `POST /products/cycle_simulation/`
  - `POST /orders/`
  - `GET /orders/statistics/`
  - `POST /orders/{id}/confirm_receipt/`
  - `POST /orders/preview_delivery_fee/`

### Bloc 4 - notifications
- extraire un service applicatif inbox:
  - filtres de lecture
  - ownership policy
  - statistiques
  - enregistrement du token push
- extraire un service applicatif preferences:
  - get-or-create
  - update partielle/complete
- laisser `views.py` comme adapter HTTP fin:
  - validation DRF
  - delegation au use case applicatif
  - mapping des erreurs 403 et des reponses de mutation
- verifier les contrats observables:
  - `GET /notifications/`
  - `POST /notifications/{id}/mark_read/`
  - `DELETE /notifications/{id}/`
  - `POST /notifications/mark_all_read/`
  - `POST /notifications/delete_all_read/`
  - `GET /notifications/stats/`
  - `POST /notifications/register_push_token/`
  - `GET/PUT/PATCH /notification-preferences/`

### Bloc 5 - aquaculture
- extraire une couche applicative complete pour les cas d'usage exposes par `aquaculture`
- laisser les services metier existants comme coeur de coordination/decision:
  - `ProductionCycleService`
  - `CycleLogService`
  - `FeedingPlanService`
  - `SanitaryService`
  - `DashboardService`
  - `SyncService`
  - `ReportService`
- introduire des services applicatifs dedies par frontiere:
  - `ProductionCycleApplicationService`
  - `CycleLogApplicationService`
  - `FeedingPlanApplicationService`
  - `SanitaryApplicationService`
  - `DashboardApplicationService`
  - `SyncApplicationService`
  - `ReportApplicationService`
- laisser les vues comme adapters HTTP fins:
  - validation serializer
  - delegation au use case applicatif
  - mapping des erreurs et reponses DRF
- verifier les contrats observables:
  - `GET/POST /cycles/`
  - `POST /cycles/{id}/harvest/`
  - `GET /cycles/{id}/statistics/`
  - `GET /cycles/{id}/comparison/`
  - `POST /cycle-logs/`
  - `POST /cycle-logs/bulk_create/`
  - `POST /feeding-plans/generate/`
  - `POST /sanitary-logs/{id}/resolve/`
  - `GET /sanitary-logs/active_issues/`
  - `GET /dashboard/`
  - `POST /sync/`
  - `POST /reports/generate/`
  - `POST /reports/{id}/regenerate/`
  - `POST /reports/{id}/validate/`
  - `POST /reports/{id}/send-email/`
  - `POST /reports/{id}/mark-whatsapp-shared/`
  - `GET /reports/{id}/download/`

## Execution

### Bloc 1 - accounts
- ajout de `AuthApplicationService` dans [backend/apps/accounts/services/auth_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/accounts/services/auth_application_service.py)
  - emission des tokens JWT
  - construction du resultat applicatif standard `register/login`
  - invalidation du refresh token avec erreur applicative stable `InvalidRefreshTokenError`
- ajout de `ProfileQueryService` dans [backend/apps/accounts/services/profile_query_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/accounts/services/profile_query_service.py)
  - lecture du profil utilisateur hydrate
  - lecture du profil ferme hydrate
- `views.py` joue maintenant un role d'adapter:
  - `register/login` deleguent la construction du resultat auth au service applicatif
  - `logout` ne depend plus directement de `RefreshToken`
  - `ProfileView` et `FarmProfileView` deleguent les lectures aux services applicatifs

### Bloc 2 - chat
- ajout de `ChatApplicationService` dans [backend/apps/chat/services/chat_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/chat/services/chat_application_service.py)
  - scope des conversations visible par acteur
  - chargement securise d'une conversation
  - rehydratation API de la conversation
  - use cases `me`, `messages`, `send_message`, `mark_read`
- ajout de `MessageEventPolicyService` dans [backend/apps/chat/services/message_event_policy_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/chat/services/message_event_policy_service.py)
  - decide les effets applicatifs d'un nouveau message
  - formalise un `NewMessageEffectsPlan` immuable
- `views.py` joue maintenant un role d'adapter:
  - `ConversationViewSet` ne fait plus d'orchestration applicative directe
  - les actions `me/messages/send_message/mark_read` deleguent au service applicatif
  - le mapping d'erreurs DRF reste local a l'adapter HTTP
- `signals.py` ne porte plus les decisions metier:
  - il applique un plan retourne par `MessageEventPolicyService`
  - l'event handler reste un adapter technique vers Celery et l'auto-response

### Bloc 3 - commerce
- ajout de `CatalogApplicationService` dans [backend/apps/commerce/services/catalog_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/commerce/services/catalog_application_service.py)
  - centralise les use cases catalogue, recommandations, suggestions et simulation
  - formalise des commandes/requetes applicatives immuables (`RecommendedProductQuery`, `FeedingSuggestionsQuery`, `CycleSimulationCommand`)
- ajout de `OrderApplicationService` dans [backend/apps/commerce/services/order_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/commerce/services/order_application_service.py)
  - centralise creation commande, stats, confirmation de reception et preview livraison
  - formalise `CreateOrderCommand` et `DeliveryFeePreviewCommand`
- `views.py` joue maintenant un role d'adapter:
  - `ProductViewSet` ne parle plus directement aux services metier bas niveau pour ses cas d'usage custom
  - `OrderViewSet` n'utilise plus `serializer.save()` pour piloter le use case
  - le mapping d'erreurs HTTP reste local a la couche DRF
- `serializers.py` redevient une frontiere:
  - validation DRF et validation batch des produits
  - plus aucun declenchement de use case dans `OrderCreateSerializer` ou `DeliveryFeePreviewSerializer`
- ajout de tests applicatifs dans [backend/apps/commerce/tests/test_services.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/commerce/tests/test_services.py)
  - couverture explicite des nouveaux services applicatifs `catalog` et `order`

### Bloc 4 - notifications
- ajout de [application_services.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/notifications/application_services.py)
  - `NotificationInboxApplicationService`
  - `NotificationPreferenceApplicationService`
  - commandes/requetes applicatives explicites (`NotificationQueryFilters`, `PushTokenRegistrationCommand`)
  - erreur applicative `NotificationOwnershipError`
- `views.py` joue maintenant un role d'adapter:
  - `NotificationViewSet` ne porte plus la politique de propriete ni les aggregations de stats
  - `NotificationPreferenceViewSet` ne gere plus lui-meme le get-or-create et la persistence de preferences
  - le mapping HTTP des mutations reste local a la vue
- `services.py` reste le service metier transverse:
  - creation/bulk/suppression globale
  - dispatch et politiques de canaux
- ajout de tests applicatifs dans [backend/apps/notifications/tests/test_services.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/notifications/tests/test_services.py)
  - couverture explicite de la couche applicative inbox/preferences

### Bloc 5 - aquaculture
- ajout des services applicatifs:
  - [cycle_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/cycle_application_service.py)
  - [log_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/log_application_service.py)
  - [feeding_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/feeding_application_service.py)
  - [sanitary_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/sanitary_application_service.py)
  - [dashboard_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/dashboard_application_service.py)
  - [sync_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/sync_application_service.py)
  - [report_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/services/report_application_service.py)
- `views/*.py` jouent maintenant un role d'adapter:
  - `cycle_views.py` delegue `create/harvest/statistics/comparison`
  - `log_views.py` delegue l'upsert et le bulk avec recalcul des cycles affectes
  - `feeding_views.py` delegue la generation multi-semaines
  - `sanitary_views.py` delegue la resolution et le regroupement des incidents
  - `dashboard_views.py` delegue la construction du payload final de presentation
  - `sync_views.py` ne porte plus la normalisation ni la decision de statut HTTP
  - `report_views.py` delegue le workflow complet des rapports
- les services metier restent stables:
  - `SyncService` continue de porter la logique de sync offline
  - `ReportService` continue de porter la generation/dispatch des rapports
  - `ProductionCycleService`, `CycleLogService`, `FeedingPlanService` et `SanitaryService` restent la couche de coordination metier de bas niveau
- ajout de tests applicatifs dans [backend/apps/aquaculture/tests/services/test_application_services.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/tests/services/test_application_services.py) et [backend/apps/aquaculture/tests/services/test_report_application_service.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/aquaculture/tests/services/test_report_application_service.py)

### Bloc 6 - common
- decoupage de [admin_mixins.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/common/admin_mixins.py) pour separer les responsabilites transverses de l'admin Django:
  - [admin_policies.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/common/admin_policies.py) porte maintenant les constantes et checks RBAC
  - [admin_audit.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/common/admin_audit.py) porte l'audit admin
  - [admin_mixins.py](/Users/apple/Desktop/projects/AquaCare/backend/apps/common/admin_mixins.py) reste la facade publique compatible avec les imports existants des modules admin
- gain retenu:
  - fichier plus focalise
  - politique d'acces distincte du mecanisme d'audit
  - aucun changement de contrat public pour `accounts`, `aquaculture`, `commerce`, `chat` et `notifications`

### Bloc 7 - mavecam_api
- audit de [urls.py](/Users/apple/Desktop/projects/AquaCare/backend/mavecam_api/urls.py), [celery.py](/Users/apple/Desktop/projects/AquaCare/backend/mavecam_api/celery.py) et [settings/](/Users/apple/Desktop/projects/AquaCare/backend/mavecam_api/settings)
- conclusion:
  - `mavecam_api` est principalement une couche de composition Django et de configuration projet
  - aucun refactor clean/hexagonal supplementaire n'apporte de gain net ici sans sur-architecturer la bootstrap/config
  - les endpoints `api_root` et `health_check` sont suffisamment minces et deja couverts par les tests projet
- exclusion volontaire:
  - pas d'introduction de services applicatifs artificiels pour la composition des URLs, Celery ou les settings

## Etat courant
- bloc `accounts` valide
- bloc `chat` valide
- bloc `commerce` valide
- bloc `notifications` valide
- bloc `aquaculture` valide
- bloc `common` valide
- bloc `mavecam_api` audite et explicitement exclu d'un refactor supplementaire
- gain architectural retenu:
  - frontiere HTTP plus fine
  - orchestration applicative explicite
  - dependance JWT repoussee hors de l'adapter HTTP
  - lectures de profil centralisees
  - use cases chat explicites et reutilisables hors DRF
  - politique des effets post-message separee du signal Django
  - use cases commerce explicites au-dessus des services metier
  - serializers commerce recentres sur la validation
  - use cases inbox/preferences notifications explicites
  - politique de propriete notifications sortie de la vue
  - use cases aquaculture explicites par frontiere fonctionnelle
  - workflow des rapports aquaculture explicite et autonome
  - sync/dashboard/logs/cycles/sanitary/feeding sortis des adapters HTTP
  - RBAC admin et audit admin separes dans `common`
- prochain bloc logique: `aquaculture/sync` ou `aquaculture/cycles`

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/accounts/tests`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests/test_api_endpoints.py -k "login or register or logout or profile or farm"`

## Verification bloc 2
- `python3 -m ruff check backend/apps/chat`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/chat/tests/test_services.py -x`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/chat/tests`
- `cd backend && docker-compose exec api env DJANGO_SETTINGS_MODULE=mavecam_api.settings.test pytest apps/chat/tests`

## Verification bloc 3
- `python3 -m ruff check backend/apps/commerce`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/commerce/tests/test_services.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/commerce/tests`
- `cd backend && docker-compose exec api env DJANGO_SETTINGS_MODULE=mavecam_api.settings.test pytest apps/commerce/tests`

## Verification bloc 4
- `python3 -m ruff check backend/apps/notifications`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/notifications/tests/test_services.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/notifications/tests`
- `cd backend && docker-compose exec api env DJANGO_SETTINGS_MODULE=mavecam_api.settings.test pytest apps/notifications/tests`

## Verification bloc 5
- `python3 -m ruff check backend/apps/aquaculture/services/report_application_service.py backend/apps/aquaculture/views/report_views.py backend/apps/aquaculture/services/__init__.py backend/apps/aquaculture/tests/services/test_report_application_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/aquaculture/tests/services/test_report_service.py apps/aquaculture/tests/services/test_report_application_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest -n 0 apps/aquaculture/tests/test_views.py -k report`

## Note de verification
- un run parallele `pytest-cov + xdist` sur `apps/accounts/tests` a rencontre une erreur interne coverage SQLite (`no such table: file`) apres execution des tests
- la validation fonctionnelle propre a donc ete rejouee en non-parallele avec `-n 0`, resultat: `136 passed`
