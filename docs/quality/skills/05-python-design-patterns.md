# Skill 05 - python-design-patterns

## Audit initial

### Bloc 1 - accounts
- `backend/apps/accounts/middleware.py` melangeait trois responsabilites:
  - inspection des requetes HTTP (`ip`, payload, endpoints proteges)
  - politique de rate limit
  - persistance des tentatives dans le cache
- cette concentration rendait le middleware plus difficile a faire evoluer et a tester sans effets de bord
- le point de levier le plus rentable etait donc un refactor SRP/KISS sur la gestion des tentatives de connexion, sans changer l'API publique deja couverte par les tests

### Bloc 2 - chat
- `backend/apps/chat/views.py` repetait la meme orchestration HTTP sur trois endpoints:
  - recuperation de conversation avec masquage 404/permission
  - serialisation des messages et des conversations
  - mapping des exceptions domaine en reponses HTTP
- `backend/apps/chat/services/message_service.py` dupliquait le flux de creation de message entre envoi user, admin et systeme
- `backend/apps/chat/services/conversation_service.py` dupliquait aussi les branches de mise a jour des compteurs non lus
- ce module avait donc plusieurs points ou les responsabilites etaient encore trop melangees entre orchestration, creation ORM et politique de mise a jour

### Bloc 3 - commerce
- `backend/apps/commerce/services/order_service.py` concentrait trop d'etapes dans `create_order`:
  - idempotence offline
  - preparation des lignes
  - calcul des montants
  - creation des `OrderItem`
  - notification non bloquante
- `calculate_delivery_fee_preview()` re-dupliquait une partie de la preparation et du calcul deja presents dans `create_order`
- `backend/apps/commerce/views.py` gardait aussi plusieurs aides HTTP implicites dans les actions `recommended`, `feeding_suggestions`, `cycle_simulation`, `create`, `confirm_receipt` et `preview_delivery_fee`
- le besoin du skill etait donc de decouper l'orchestration commerce en sous-etapes explicites, sans surcouche architecturale artificielle

### Bloc 4 - notifications
- `backend/apps/notifications/services.py` concentrait en un seul flux:
  - resolution des canaux par defaut
  - filtrage par preferences utilisateur
  - politique produit sur les rappels de nourrissage
  - heures silencieuses push
  - priorite
  - declenchement immediat des tasks
- `create_bulk_notifications()` re-embarquait une partie de cette logique avec son propre chemin
- `backend/apps/notifications/views.py` repetait aussi:
  - les reponses standard de mutation
  - les verifications de propriete
  - le cycle get/create + validate + save des preferences
- le refactor attendu etait donc un decoupage des politiques de livraison et des flux de mutation, tout en gardant le meme contrat d'API

### Bloc 5 - aquaculture
- `backend/apps/aquaculture/services/sync_service.py` dupliquait les memes briques dans plusieurs flux de sync:
  - extraction/validation des `cycle_id`
  - chargement des cycles autorises
  - accumulation des erreurs de sync
  - composition du resultat final
  - parsing de dates
- `backend/apps/aquaculture/views/sync_views.py` gardait aussi la logique de reponse de validation et de mapping de statut HTTP dans la vue
- `backend/apps/aquaculture/views/report_views.py` repetait plusieurs morceaux d'orchestration de rapport:
  - passage a l'etat `pending`
  - extraction du `cycle_scope_id`
  - dispatch de generation
  - serialisation detaillee des reponses
  - reponses 409 pour rapport/PDF en cours
- `backend/apps/aquaculture/services/report_service.py` melangeait encore dans `generate_for_farm()` et `send_email()` la preparation du contenu, le nommage de fichier, l'application de l'etat du rapport et le chargement du PDF
- le refactor attendu etait donc un decoupage net entre helpers de sync offline et helpers du flux rapports, sans toucher aux regles metier aquacoles elles-memes

## Plan d'execution

### Bloc 1 - accounts
- extraire le stockage et le comptage des tentatives dans un composant dedie
- garder `LoginRateLimitMiddleware` comme orchestrateur HTTP uniquement
- conserver les methodes publiques existantes pour ne pas casser les tests ni les integrations
- valider le bloc avec la suite complete `apps/accounts/tests`

### Bloc 2 - chat
- extraire des helpers de vue pour uniformiser le lookup de conversation, la serialisation et le mapping d'erreurs
- unifier dans `MessageService` la creation ORM des messages et la finalisation de conversation
- factoriser la mise a jour des compteurs non lus dans `ConversationService`
- valider avec la suite complete `apps/chat/tests`

### Bloc 3 - commerce
- extraire dans `OrderService` des structures de donnees et helpers pour la preparation des lignes de commande, le calcul des montants et l'orchestration post-creation
- reutiliser ces helpers pour `preview_delivery_fee()` afin d'eviter deux chemins de calcul divergents
- factoriser dans les ViewSets les reponses d'erreur et les transformations HTTP repetitives, sans deplacer la logique metier hors de ses services
- valider avec la suite complete `apps/commerce/tests`

### Bloc 4 - notifications
- extraire dans `NotificationService` des helpers courts pour:
  - preferences utilisateur
  - resolution des canaux effectifs
  - priorite
  - politiques push (feeding reminder / quiet hours)
  - dispatch immediat
- reutiliser ces helpers entre creation unitaire et bulk autant que possible sans changer le comportement metier
- reduire dans les ViewSets la duplication des reponses de mutation, des controles de propriete et du flux d'edition des preferences
- valider avec la suite complete `apps/notifications/tests`

### Bloc 5 - aquaculture
- extraire dans `SyncService` des helpers courts pour le parsing, la resolution des cycles utilisateur, l'accumulation des erreurs et la composition des reponses
- reutiliser ces helpers dans `sync_cycle_logs`, `sync_sanitary_logs`, `sync_new_cycles`, `get_server_updates` et `perform_full_sync`
- factoriser dans `SyncView` et `ProductionReportViewSet` les reponses de mutation et l'orchestration repetitive liee aux rapports
- sortir de `ReportService` les details repetitifs de scope cycle, nommage de PDF, application du contenu genere et chargement du binaire
- valider avec les suites ciblees `sync/report` puis la suite complete `apps/aquaculture/tests`

## Etat courant
- bloc `accounts` valide
- `LoginRateLimitMiddleware` utilise maintenant la composition via `LoginAttemptTracker`
- le composant extrait centralise les cles de cache, la fenetre glissante et l'enregistrement des echecs
- l'API publique du middleware est conservee, ce qui evite un refactor large des tests existants
- le decoupage reduit le couplage entre logique HTTP et persistance cache, ce qui simplifie les prochaines evolutions de throttling
- `admin.py` centralise maintenant la politique RBAC via `AccountsAdminRoleMixin` au lieu de dupliquer les decisions de role dans plusieurs methodes
- les actions bulk admin reutilisent des helpers dedies pour les permissions, l'audit et les mises a jour de certification, ce qui reduit les responsabilites melangees dans `UserAdmin`
- `views.py` factorise la construction des reponses JWT avec des helpers dedies, ce qui laisse `RegisterView` et `LoginView` concentrees sur le flux HTTP
- les tests admin couvrent desormais explicitement la visibilite du telephone, le masquage PII et la suppression des actions sensibles pour les non-managers
- bloc `chat` valide
- `ConversationViewSet` centralise maintenant:
  - la resolution de conversation accessible
  - la serialisation des messages et conversations
  - le mapping des erreurs domaine d'envoi
- `MessageService` unifie la creation de message via des helpers internes dedies au payload ORM, a la deduplication `client_uuid`, et a la finalisation post-envoi
- `ConversationService` reutilise un seul chemin pour incrementer ou reinitialiser les compteurs non lus au lieu de dupliquer les branches `user/admin`
- le resultat est plus lisible: les vues orchestrent, les services appliquent les regles metier, et les helpers internes portent les details repetitifs sans introduire une abstraction excessive
- bloc `commerce` valide
- `OrderService` s'appuie maintenant sur des etapes explicites:
  - recherche idempotente de commande offline
  - preparation typée des lignes avec `PreparedOrderLine` / `PreparedOrderItems`
  - calcul centralise des montants avec `CalculatedOrderAmounts`
  - creation des `OrderItem` en lot
  - notification encapsulee dans un helper non bloquant
- `create_order()` et `calculate_delivery_fee_preview()` partagent a present le meme chemin de preparation et de calcul, ce qui reduit les divergences futures
- les ViewSets `commerce` ont recupere des helpers internes cibles pour les reponses d'erreur, le payload de simulation, la reponse de preview et la serialisation standard des commandes
- ce bloc respecte mieux SRP/KISS: l'HTTP reste dans les vues, la sequence metier reste dans les services, et les details repetitifs sont isoles dans des helpers courts
- bloc `notifications` valide
- `NotificationService` se decoupe maintenant autour de petites politiques explicites:
  - resolution des preferences
  - resolution des canaux effectifs par utilisateur
  - priorite
  - regles push specifiques
  - dispatch immediat
- la creation unitaire et la creation bulk reutilisent a present les memes briques de decision au lieu de dupliquer la logique de canaux/priorites
- les ViewSets `notifications` centralisent les reponses standard de mutation, les controles de propriete et le workflow de sauvegarde des preferences utilisateur
- le module est plus facile a lire: les vues orchestrent les mutations, le service central porte les politiques de livraison, et chaque helper a une responsabilite courte et testable
- bloc `aquaculture` valide
- `SyncService` se structure maintenant autour de helpers explicites pour:
  - la construction des resultats
  - l'ajout d'erreurs de sync
  - l'extraction des `cycle_id`
  - le chargement des cycles autorises
  - le parsing des dates et du `last_sync`
  - la composition du resultat global de sync
- `sync_cycle_logs`, `sync_sanitary_logs` et `sync_new_cycles` partagent des briques communes au lieu de re-dupliquer le meme scaffolding procedural
- `SyncView` ne porte plus que l'orchestration HTTP minimale: validation structurelle, delegation au service, choix du status code
- `ProductionReportViewSet` centralise maintenant l'orchestration repetitive des actions rapport via des helpers de detail, de statut `pending`, de dispatch async et de gestion du `cycle_scope_id`
- `ReportService` se decoupe mieux entre:
  - extraction du scope cycle
  - construction du nom de fichier
  - application du contenu genere au rapport
  - chargement du PDF avant envoi email
- ce bloc reste vaste, mais les deux zones les plus denses (`sync` et `reports`) sont maintenant nettement plus lisibles et plus coherentes avec SRP/KISS
- surface support `common` valide
- `common/admin_mixins.py` centralise maintenant les checks de roles repetes via `RoleAwareAdminMixin`, ce qui simplifie les mixins `CommerceOperatorMixin`, `SupportOperatorMixin`, `ManagerMixin`, `PIIMaskingMixin` et `SecuredModelAdmin`
- audit `mavecam_api` realise
- aucun refactor supplementaire n'a ete retenu sur `mavecam_api`, car les fichiers lus etaient deja petits, majoritairement declaratifs ou ne presentaient pas de gain de design assez net pour justifier un changement cosmetique
- conclusion skill 5 backend: valide

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests`

## Verification bloc 2
- `python3 -m ruff check backend/apps/chat`
- `python3 -m pytest backend/apps/chat/tests`

## Verification bloc 3
- `python3 -m ruff check backend/apps/commerce`
- `python3 -m pytest backend/apps/commerce/tests`

## Verification bloc 4
- `python3 -m ruff check backend/apps/notifications`
- `python3 -m pytest backend/apps/notifications/tests`

## Verification bloc 5
- `python3 -m ruff check backend/apps/aquaculture`
- `python3 -m pytest backend/apps/aquaculture/tests/services/test_sync_service.py backend/apps/aquaculture/tests/services/test_report_service.py backend/apps/aquaculture/tests/test_views.py -k "sync or report"`
- `python3 -m pytest backend/apps/aquaculture/tests`

## Verification finale backend
- `python3 -m ruff check backend/apps/common backend/apps/accounts/admin.py backend/apps/chat/admin.py backend/apps/commerce/admin.py backend/apps/notifications/admin.py backend/apps/aquaculture/admin.py`
- `python3 -m pytest backend/tests/unit/test_rbac.py backend/apps/accounts/tests/test_admin.py`
- `python3 -m ruff check backend/apps backend/mavecam_api backend/tests`
- `cd backend && python3 -m pytest`
