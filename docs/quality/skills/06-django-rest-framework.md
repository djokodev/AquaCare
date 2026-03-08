# Skill 06 - django-rest-framework

## Audit initial

### Bloc 1 - accounts
- le module `backend/apps/accounts/` exposait deja des endpoints DRF stables, mais la frontiere API restait inegale
- `RegisterView` et `LoginView` partageaient un meme contrat de reponse sans serializer DRF dedie
- `LoginView`, `LogoutView` et `AccountDeletionView` utilisaient encore `APIView` avec validation manuelle partielle, ce qui laissait:
  - des schemas OpenAPI incomplets
  - des payloads de reponse documentes seulement par description
  - une heterogeneite entre endpoints CRUD et endpoints d'action
- `ProfileView` et `FarmProfileView` etaient globalement sains, mais pouvaient etre mieux alignes sur les conventions DRF avec des querysets explicites

### Bloc 2 - chat
- le module `backend/apps/chat/` utilisait deja un `ReadOnlyModelViewSet`, mais plusieurs frontieres DRF restaient implicites:
  - les actions custom `messages`, `send_message`, `mark_read` et `get_my_conversation` n'avaient pas de schemas DRF explicites
  - `send_message` validait encore le body sans passer par `get_serializer()`
  - les erreurs metier (`content`, `client_uuid`, `media_file`) etaient retournees via des dictionnaires ad hoc
  - `ConversationSerializer` exposait `last_message` via `SerializerMethodField` sans schema lisible pour OpenAPI
- le gain utile pour ce skill etait donc un durcissement de la couche DRF, pas un refactor des services chat

### Bloc 3 - commerce
- le module `backend/apps/commerce/` etait deja bien decoupe entre ViewSets et services, mais la couche DRF restait inegale sur plusieurs actions custom:
  - `recommended` et `feeding_suggestions` validaient les query params de facon ad hoc
  - `cycle_simulation` et `preview_delivery_fee` avaient bien des serializers d'input, mais leurs schemas de sortie etaient encore implicites
  - les erreurs HTTP d'actions custom (`error`, `message`) etaient retournees avec des dictionnaires bruts
  - les ViewSets ne documentaient pas explicitement leurs actions DRF via `extend_schema`
- le gain attendu etait donc un durcissement de la frontiere DRF, sans deplacer la logique de calcul hors des services

### Bloc 4 - notifications
- le module `backend/apps/notifications/` etait fonctionnel, mais la couche DRF avait encore des points heterogenes:
  - les actions custom (`mark_read`, `mark_all_read`, `delete_all_read`) repondaient via des dictionnaires ad hoc
  - `stats` et `register_push_token` n'utilisaient pas la selection de serializer par action
  - `NotificationPreferenceViewSet` restait un `ViewSet` manuel alors que le module reposait deja sur des serializers DRF standards
- le levier utile etait donc de rendre les actions et preferences plus idiomatiques DRF, sans toucher aux services de notification

### Bloc 5 - aquaculture
- le module `backend/apps/aquaculture/` etait deja riche en endpoints DRF, mais le niveau d'homogeneite restait inegal entre ViewSets, vues generiques et actions custom:
  - plusieurs actions (`harvest`, `generate`, `resolve`, `bulk_create`) utilisaient bien des serializers en runtime, mais leurs schemas OpenAPI ne decrivaient pas toujours le vrai contrat de requete ou de reponse
  - `SyncView` et `DashboardView` avaient besoin d'un durcissement DRF sans casser leur logique metier et leurs contraintes de performance
  - `NutritionalGuideViewSet.for_species` validait encore les query params de facon ad hoc
  - quelques schemas d'actions (`send_email`, `bulk_create`, `active_issues`) ne reflétaient pas exactement les payloads repondus par l'API
- le gain attendu etait donc de finaliser la frontiere DRF du plus gros module backend, sans deplacer la logique metier hors des services aquaculture

## Plan d'execution

### Bloc 1 - accounts
- introduire des serializers DRF explicites pour les contrats d'authentification et les reponses d'action
- remplacer les `APIView` d'action par `GenericAPIView` quand la valeur vient surtout de `serializer_class` + `get_serializer()`
- retirer la validation ad hoc quand elle peut vivre proprement dans les serializers
- aligner `extend_schema` sur les vrais serializers de requete/reponse
- verrouiller le contrat via tests serializers + tests API du module complet

### Bloc 2 - chat
- expliciter les schemas DRF des actions custom du ViewSet avec `extend_schema_view`
- ajouter des serializers de contrat pour les erreurs et les previews imbriquees (`last_message`)
- utiliser `get_serializer_class()` / `get_serializer()` pour les actions qui recoivent un body
- conserver la logique metier dans `ConversationService` et `MessageService`
- valider via `apps/chat/tests/test_api.py`

### Bloc 3 - commerce
- introduire des serializers DRF pour les query params et les payloads de sortie des actions custom
- faire selectionner les bons serializers par action via `get_serializer_class()`
- utiliser `get_serializer()` sur les actions POST plutot que des instanciations manuelles quand c'est pertinent
- documenter `ProductViewSet` et `OrderViewSet` avec `extend_schema_view`
- verrouiller les endpoints custom critiques via tests API du module

### Bloc 4 - notifications
- introduire des serializers DRF explicites pour les reponses de mutation et d'erreur
- selectionner les bons serializers selon l'action (`list`, `stats`, `register_push_token`)
- migrer `NotificationPreferenceViewSet` vers un ViewSet DRF plus idiomatique utilisant `serializer_class` et `get_serializer()`
- documenter les actions et endpoints preferences avec `extend_schema_view`
- valider le tout via `apps/notifications/tests/test_views.py`

### Bloc 5 - aquaculture
- homogeniser tous les endpoints custom du module autour de serializers DRF explicites pour les bodies, les query params et les payloads de retour
- convertir les vues qui y gagnent vers `GenericAPIView` sans modifier la logique metier des services
- corriger les schemas OpenAPI qui ne refletaient pas le contrat reel (`harvest`, `bulk_create`, `send_email`, `active_issues`)
- laisser `SyncView` sur un payload runtime proche de `request.data` quand le service depend encore de cette forme, tout en documentant la frontiere avec serializers dedies
- verifier le bloc via `apps/aquaculture/tests/test_views.py`, puis via `apps/aquaculture/tests` et enfin `pytest` backend complet

## Execution

### Bloc 1 - accounts
- serializers ajoutes/etendus dans `backend/apps/accounts/serializers.py`:
  - `LogoutSerializer`
  - `AuthTokenSerializer`
  - `AuthSuccessResponseSerializer`
  - `MessageResponseSerializer`
  - `ErrorResponseSerializer`
  - `AccountDeletionSerializer` valide maintenant explicitement `confirm=True`
- vues DRF homogenisees dans `backend/apps/accounts/views.py`:
  - `LoginView`, `LogoutView` et `AccountDeletionView` passent sur `GenericAPIView`
  - `RegisterView` retourne maintenant un payload serialise par `AuthSuccessResponseSerializer`
  - `ProfileView` et `FarmProfileView` declarent des querysets explicites
  - les schemas `extend_schema` referencent les vrais serializers de requete/reponse
- tests renforces dans `backend/apps/accounts/tests/`:
  - nouveaux tests API pour `logout`
  - nouveaux tests serializer pour `LogoutSerializer` et `AccountDeletionSerializer`

### Bloc 2 - chat
- serializers DRF enrichis dans `backend/apps/chat/serializers.py`:
  - `LastMessagePreviewSerializer`
  - `ChatErrorResponseSerializer`
  - schemas explicites via `extend_schema_field` pour `last_message` et `sender_user`
- vues DRF homogenisees dans `backend/apps/chat/views.py`:
  - `ConversationViewSet` declare un `queryset` explicite
  - `get_serializer_class()` selectionne `SendMessageSerializer` pour l'action `send_message`
  - `send_message` passe par `self.get_serializer()`
  - les erreurs 400/404/409 passent par `ChatErrorResponseSerializer`
  - `extend_schema_view` documente `list`, `retrieve`, `get_my_conversation`, `messages`, `send_message`, `mark_read`
- aucun changement de logique metier n'a ete applique aux services: la passe est strictement centree sur la coherence DRF

### Bloc 3 - commerce
- serializers DRF ajoutes dans `backend/apps/commerce/serializers.py`:
  - `CommerceErrorResponseSerializer`
  - `RecommendedProductQuerySerializer`
  - `FeedingSuggestionsQuerySerializer`
  - `DeliveryFeePreviewResponseSerializer`
- `ProductViewSet` dans `backend/apps/commerce/views.py`:
  - choisit maintenant `CycleSimulationInputSerializer` pour l'action `cycle_simulation`
  - valide `recommended` et `feeding_suggestions` via serializers DRF
  - documente toutes les actions custom via `extend_schema_view`
  - unifie les erreurs d'action autour d'un payload DRF explicite
- `OrderViewSet` dans `backend/apps/commerce/views.py`:
  - selectionne explicitement le serializer de `preview_delivery_fee` et `statistics`
  - serialise le preview de livraison via `DeliveryFeePreviewResponseSerializer`
  - documente `create`, `statistics`, `confirm_receipt` et `preview_delivery_fee`
- tests API renforces dans `backend/apps/commerce/tests/test_views.py` pour couvrir `recommended`

### Bloc 4 - notifications
- serializers DRF ajoutes dans `backend/apps/notifications/serializers.py`:
  - `NotificationActionErrorSerializer`
  - `NotificationMutationResponseSerializer`
- `NotificationViewSet` dans `backend/apps/notifications/views.py`:
  - documente maintenant `list`, `retrieve`, `mark_read`, `mark_all_read`, `destroy`, `delete_all_read`, `stats`, `register_push_token`
  - selectionne explicitement les serializers de `list`, `stats` et `register_push_token`
  - utilise des serializers explicites pour les reponses de mutation et d'erreur
- `NotificationPreferenceViewSet` dans `backend/apps/notifications/views.py`:
  - passe de `ViewSet` a `GenericViewSet`
  - s'appuie sur `serializer_class = NotificationPreferenceSerializer`
  - reutilise `get_serializer()` pour `list`, `update` et `partial_update`

### Bloc 5 - aquaculture
- serializers DRF ajoutes/etendus dans `backend/apps/aquaculture/serializers.py`:
  - `BulkCycleLogRequestSerializer`
  - `BulkCycleLogResponseSerializer`
  - `FeedingPlanGenerationRequestSerializer`
  - `CycleHarvestResponseSerializer`
  - `DashboardQuerySerializer`
  - `SanitaryResolutionSerializer`
  - `ActiveSanitaryIssueGroupSerializer`
  - `SyncValidationErrorResponseSerializer`
  - `NutritionalGuideSpeciesQuerySerializer`
- vues DRF homogenisees dans `backend/apps/aquaculture/views/`:
  - `DashboardView` et `SyncView` passent sur `GenericAPIView`
  - `ProductionCycleViewSet.harvest` utilise `HarvestSerializer` en entree et `CycleHarvestResponseSerializer` en sortie
  - `CycleLogViewSet.bulk_create` documente maintenant le vrai contrat wrapper `{logs: [...]}` et repond via `BulkCycleLogResponseSerializer`
  - `FeedingPlanViewSet.generate` documente le body via `FeedingPlanGenerationRequestSerializer` et retourne une liste `FeedingPlanSerializer`
  - `SanitaryLogViewSet.resolve` et `active_issues` exposent des contrats DRF explicites
  - `NutritionalGuideViewSet.for_species` valide desormais `species` via serializer DRF au lieu d'un test manuel
  - `ProductionReportViewSet` aligne ses actions custom sur leurs vrais statuts/reponses, notamment `send_email`
- points de vigilance traites pendant la passe:
  - `DashboardView` ne pre-serialise plus ses structures imbriquees avant `DashboardSerializer`
  - `SyncView` conserve un payload proche de `request.data` pour rester compatible avec `SyncService.validate_sync_data()`, tout en gardant une documentation DRF propre
  - `SanitaryLogViewSet.active_issues` repasse des objets metier bruts au serializer pour eviter la double serialisation
  - audit final des surfaces support DRF hors modules metier (`backend/mavecam_api/urls.py`) sans refactor utile supplementaire

## Conclusion
- bloc `accounts` valide pour le skill `django-rest-framework`
- bloc `chat` valide pour le skill `django-rest-framework`
- bloc `commerce` valide pour le skill `django-rest-framework`
- bloc `notifications` valide pour le skill `django-rest-framework`
- bloc `aquaculture` valide pour le skill `django-rest-framework`
- gain principal: la frontiere HTTP `accounts` est maintenant plus coherente, mieux documentee et plus idiomatique DRF sans changer les routes ni le comportement metier
- gain principal cote `chat`: les actions custom ont maintenant des contrats DRF explicites et des schemas lisibles sans toucher aux services
- gain principal cote `commerce`: les actions custom ont maintenant des contrats DRF plus explicites sur les query params, les previews et les erreurs, tout en gardant les calculs et regles metier dans les services
- gain principal cote `notifications`: les actions custom et les preferences utilisent maintenant des contrats DRF plus homogènes et mieux documentes
- gain principal cote `aquaculture`: le plus gros module backend expose maintenant des contrats DRF coherents sur ses actions custom, ses vues generiques, la sync offline et la generation de rapports sans casser les services existants
- conclusion backend: le skill `django-rest-framework` est maintenant applique sur l'ensemble des surfaces DRF backend utiles du projet

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests/test_serializers.py apps/accounts/tests/test_api_endpoints.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests`

## Verification bloc 2
- `python3 -m ruff check backend/apps/chat`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests/test_api.py`

## Verification bloc 3
- `python3 -m ruff check backend/apps/commerce`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests/test_views.py apps/commerce/tests/test_endpoints.py`

## Verification bloc 4
- `python3 -m ruff check backend/apps/notifications`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests/test_views.py`

## Verification bloc 5
- `python3 -m ruff check backend/apps/aquaculture`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/test_views.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests`

## Verification finale
- `python3 -m ruff check backend/apps/accounts backend/apps/chat backend/apps/commerce backend/apps/notifications backend/apps/aquaculture`
- `cd backend && python3 -m pytest`
