# Skill 07 - python-testing-patterns

## Audit initial

### Bloc 1 - accounts
- le module `backend/apps/accounts/` disposait deja d'une bonne base de tests API, serializers, middleware, admin et RBAC
- les vrais trous restants etaient concentres sur des frontieres importantes mais peu ou pas couvertes:
  - `backends.py` n'avait aucun test dedie alors qu'il porte le contrat d'authentification par `login_name` et `phone_number`
  - `permissions.py` n'avait aucun test explicite sur les permissions objet et admin
  - `services/account_deletion_service.py` n'avait pas de test sur l'anonymisation, le nettoyage des refresh tokens et la purge des push tokens
  - `management/commands/create_superuser_from_env.py` n'avait aucun test alors qu'il est utilise au demarrage applicatif
- le gain utile pour ce skill etait donc de combler ces trous de couverture avec des tests isoles, lisibles et orientes contrat, plutot que d'ajouter encore des doublons d'API deja bien couverts

### Bloc 2 - chat
- le module `backend/apps/chat/` disposait deja d'une bonne base de tests sur:
  - l'API DRF
  - le domaine
  - les services applicatifs
- les trous restants etaient surtout concentres sur des surfaces de support encore peu ou pas testees:
  - `permissions.py` n'avait aucun test dedie
  - `tasks.py` n'avait aucun test sur les branches `retry`, `no-op` et les payloads de notification
  - `models.py` n'avait pas de tests dedies sur `__str__()` et `mark_as_read()`
  - `serializers.py` gardait quelques branches peu exercees sur les champs derives (`sender_user`, `media_url`, fallback `last_message`)
  - l'action DRF `GET /conversations/me/` n'etait pas verrouillee explicitement
- le gain utile pour ce skill etait donc de fermer ces trous de couverture sans surcharger encore les tests d'API deja solides

### Bloc 3 - commerce
- le module `backend/apps/commerce/` disposait deja d'une couverture robuste sur:
  - les endpoints et vues DRF
  - les services `order`, `feeding_suggestion` et `cycle_simulation`
  - une partie des modeles et de la generation PDF
- les vrais trous restants etaient concentres sur des surfaces transverses ou moins sollicitees:
  - `services/product_service.py` etait encore tres partiellement couvert sur ses branches d'erreur, ses filtres et ses fourchettes de prix
  - `services/base.py` n'avait pas de test dedie
  - `models.py` gardait des helpers/validations peu verifies sur `Product`, `Order` et `OrderItem`
  - `services/pdf_service.py` n'avait pas de test sur certaines branches d'erreur/runtime
- le gain utile pour ce skill etait donc de renforcer la fiabilite interne du module sans re-dupliquer les tests endpoint deja excellents

### Bloc 4 - notifications
- le module `backend/apps/notifications/` disposait deja d'une suite correcte, mais avec des trous encore visibles sur les branches de decision:
  - `services.py` couvrait mal les opt-out globaux, les quiet hours et les erreurs de dispatch immediat
  - `views.py` gardait peu de tests sur les helpers DRF de refus, de filtres et de mise a jour de token existant
  - `serializers.py` n'avait pas de tests dedies sur l'exposition conditionnelle des erreurs techniques ni sur les validateurs unitaires
  - `models.py` pouvait encore etre verrouille sur quelques helpers simples (`mark_as_sent()`, `__str__()`)
- le gain utile pour ce skill etait donc de transformer une bonne base de tests en couverture de contrat plus complete sur les decisions metier et DRF

### Bloc 5 - aquaculture
- le module `backend/apps/aquaculture/` disposait deja d'une base de tests large et globalement saine
- les trous encore utiles pour ce skill etaient surtout concentres sur les points de coordination:
  - `tasks.py` restait tres peu verrouille alors qu'il orchestre notifications, rapports asynchrones et dispatch batch
  - `services/base.py` n'avait aucun test dedie malgre son role transversal pour le logging, la validation et les calculs defensifs
- le gain utile etait donc de completer les zones de coordination a plus fort risque de regression, sans re-dupliquer les couches deja tres bien couvertes du module

## Plan d'execution

### Bloc 1 - accounts
- creer des modules de tests dedies par frontiere (`auth_backend`, `permissions`, `account_deletion_service`, `management_commands`)
- reutiliser les fixtures existantes plutot que multiplier les setups inline
- privilegier les tests unitaires et d'integration legers sur les contrats critiques encore non verifies
- valider l'ensemble du module via `apps/accounts/tests` et `tests/unit/test_rbac.py`
- mesurer l'effet sur la couverture utile du module avant de passer a `chat`

### Bloc 2 - chat
- ajouter des modules de tests dedies pour `permissions`, `tasks`, `models` et `serializers`
- ajouter un test API cible sur l'action custom `/conversations/me/`
- verifier les branches Celery de `retry` et `no-op` sans faire de tests floconneux
- renforcer les helpers de serialisation sans re-dupliquer les cas deja verifies au niveau API
- mesurer la couverture `apps/chat/*` avant et apres pour confirmer l'effet de la passe

### Bloc 3 - commerce
- completer `test_services.py` sur les branches de `ProductService` encore peu ou pas couvertes
- ajouter un module dedie `test_base_service.py` pour les utilitaires transverses
- completer `test_models.py` sur les validations et helpers manquants de `Product`, `Order` et `OrderItem`
- completer `test_pdf_service.py` sur les branches d'erreur et de compatibilite runtime
- valider le bloc via `apps/commerce/tests`, puis mesurer `apps/commerce/*`

### Bloc 4 - notifications
- completer `test_services.py` sur les branches d'opt-out, quiet hours et dispatch immediat
- completer `test_views.py` sur les helpers de refus, les filtres de liste et la mise a jour d'un push token existant
- ajouter un module dedie `test_serializers.py` pour les branches d'exposition staff/admin et les validateurs unitaires
- completer `test_models.py` sur les helpers encore non verifies
- valider le bloc via `apps/notifications/tests`, puis mesurer `apps/notifications/*`

### Bloc 5 - aquaculture
- ajouter un module dedie `test_tasks.py` pour les taches Celery du domaine
- ajouter un module dedie `services/test_base_service.py` pour les utilitaires transverses
- couvrir les branches de retry, erreurs metier non retryables, dispatch batch et invalidation de cache
- valider le bloc via `apps/aquaculture/tests`, puis mesurer `apps/aquaculture/*`

## Execution

### Bloc 1 - accounts
- nouveaux modules de tests ajoutes dans `backend/apps/accounts/tests/`:
  - `test_auth_backend.py`
  - `test_permissions.py`
  - `test_account_deletion_service.py`
  - `test_management_commands.py`
- couverture ajoutee sur `backend/apps/accounts/backends.py`:
  - authentification par `login_name` pour comptes individuels et entreprise
  - authentification par `phone_number`
  - refus des identifiants invalides, comptes inactifs et mot de passe manquant
  - `get_user()` sur identifiant inconnu
- couverture ajoutee sur `backend/apps/accounts/permissions.py`:
  - permissions objet `IsOwnerOrReadOnly` sur methodes safe et write
  - permission `IsMavecamAdmin` pour staff, non-staff et anonyme
- couverture ajoutee sur `backend/apps/accounts/services/account_deletion_service.py`:
  - anonymisation des PII
  - desactivation du compte et mot de passe inutilisable
  - purge des `OutstandingToken`
  - purge des `PushToken`
  - verification des champs normalises apres suppression logique
- couverture ajoutee sur `backend/apps/accounts/management/commands/create_superuser_from_env.py`:
  - no-op propre si variables d'environnement absentes
  - creation complete d'un superuser depuis l'environnement
  - mise a jour du mot de passe et elevation de privileges d'un utilisateur existant

### Bloc 2 - chat
- nouveaux modules de tests ajoutes dans `backend/apps/chat/tests/`:
  - `test_permissions.py`
  - `test_tasks.py`
  - `test_models.py`
  - `test_serializers.py`
- `backend/apps/chat/tests/test_api.py` couvre maintenant explicitement l'action `GET /conversations/me/`
- couverture ajoutee sur `backend/apps/chat/permissions.py`:
  - acces a sa propre conversation
  - refus d'acces a la conversation d'un autre utilisateur
  - acces a ses propres messages
  - acces total staff/admin
  - refus par defaut pour un objet non supporte
- couverture ajoutee sur `backend/apps/chat/tasks.py`:
  - `retry` si le message n'existe pas
  - no-op quand le type de message n'est pas celui attendu
  - verification du payload email/admin pour `notify_admins_new_user_message_task`
  - verification du payload de notification utilisateur pour `notify_user_admin_message_task`
  - comportement sans admin actif
- couverture ajoutee sur `backend/apps/chat/models.py`:
  - `Conversation.__str__()` avec nom complet et fallback telephone
  - `Message.__str__()` sur contenu tronque
  - `Message.mark_as_read()` avec idempotence sur le second appel
- couverture ajoutee sur `backend/apps/chat/serializers.py`:
  - masquage de `sender_user` pour un viewer non staff
  - exposition staff quand `sender_user` est absent
  - label systeme pour les messages `system`
  - fallback `media_url` sans `request`
  - fallback `last_message` / `message_count` sans annotations ORM

### Bloc 3 - commerce
- nouveau module de tests ajoute dans `backend/apps/commerce/tests/`:
  - `test_base_service.py`
- `backend/apps/commerce/tests/test_services.py` couvre maintenant en plus:
  - payload vide pour `get_products_by_ids()`
  - erreurs `ProductNotAvailableError` et `ProductNotFoundError`
  - `get_product_by_id()` avec produit indisponible et UUID inconnu
  - filtres `phase` et `brand`
  - `search_products()` sur query trop courte et matching nom/marque
  - fallback de `get_recommended_product()`
  - `get_products_for_cycle()`
  - `get_price_range()` avec et sans resultats
- `backend/apps/commerce/tests/test_models.py` couvre maintenant en plus:
  - validations metier de `Product.clean()`
  - `Product.__str__()`
  - validations `Order.clean()` sur adresse, retrait, montants et total incoherent
  - helpers `Order.total_bags`, `Order.is_free_delivery`, `Order.__str__()`
  - `OrderItem.clean()` et branche de calcul automatique de `line_total`
- `backend/apps/commerce/tests/test_pdf_service.py` couvre maintenant en plus:
  - absence de dependance `pydyf`
  - journalisation + re-raise sur echec de generation PDF
- `backend/apps/commerce/services/base.py` est maintenant couvert par des tests dedies sur:
  - les niveaux de log
  - la validation des champs requis

### Bloc 4 - notifications
- nouveau module de tests ajoute dans `backend/apps/notifications/tests/`:
  - `test_serializers.py`
- `backend/apps/notifications/tests/test_services.py` couvre maintenant en plus:
  - opt-out global sur tous les canaux
  - opt-out par type de notification
  - retrait du push pendant les quiet hours
  - journalisation propre quand le dispatch immediat echoue sans casser la creation
  - exclusion des utilisateurs opt-out dans les notifications bulk
- `backend/apps/notifications/tests/test_views.py` couvre maintenant en plus:
  - branche DRF 403 des helpers `mark_read()` et `destroy()`
  - filtres `is_read` + `type` sur la liste
  - mise a jour d'un token existant avec reponse `200`
  - `PUT` complet sur les preferences
- `backend/apps/notifications/tests/test_serializers.py` couvre maintenant:
  - exposition des erreurs techniques pour staff/superuser
  - validateur `device_id`
  - validateur `platform`
- `backend/apps/notifications/tests/test_models.py` couvre maintenant en plus:
  - `Notification.mark_as_sent()`
  - `NotificationPreference.__str__()`
  - `PushToken.__str__()`

### Bloc 5 - aquaculture
- nouveaux modules de tests ajoutes dans `backend/apps/aquaculture/tests/`:
  - `test_tasks.py`
  - `services/test_base_service.py`
- `backend/apps/aquaculture/tests/test_tasks.py` couvre maintenant:
  - `post_log_async_tasks()` sur log introuvable
  - creation des notifications de mortalite et de rappel d'echantillonnage
  - invalidation de cache avec fallback quand `delete_pattern` n'est pas supporte
  - `generate_report_async_task()` sur report introuvable, erreurs metier/environnement et retry inattendu
  - `generate_single_farm_report_task()` sur ferme introuvable, succes et crash de generation
  - wrappers `generate_daily|weekly|monthly_report_drafts_task()`
  - `_dispatch_per_farm()` avec filtrage des fermes actives
  - `send_report_email_task()` sur succes, entites introuvables et retry
- `backend/apps/aquaculture/tests/services/test_base_service.py` couvre maintenant:
  - `log_operation()` avec niveau explicite et fallback `info`
  - `validate_required_fields()` sur champs manquants et `None`
  - `safe_divide()` sur cas valides et cas defensifs

## Conclusion provisoire
- bloc `accounts` valide pour le skill `python-testing-patterns`
- bloc `chat` valide pour le skill `python-testing-patterns`
- bloc `commerce` valide pour le skill `python-testing-patterns`
- bloc `notifications` valide pour le skill `python-testing-patterns`
- bloc `aquaculture` valide pour le skill `python-testing-patterns`
- le module couvre maintenant ses frontieres critiques manquantes, pas seulement les endpoints DRF
- gains mesurables cote `accounts`:
  - `backends.py`: 100%
  - `permissions.py`: 100%
  - `create_superuser_from_env.py`: 91%
- gains mesurables cote `chat`:
  - `models.py`: 100%
  - `permissions.py`: 100%
  - `tasks.py`: 100%
  - couverture globale `apps/chat/*`: 92%
- gains mesurables cote `commerce`:
  - `services/product_service.py`: 100%
  - `services/base.py`: 100%
  - `models.py`: 99%
  - couverture globale `apps/commerce/*`: 88%
- gains mesurables cote `notifications`:
  - `models.py`: 100%
  - `serializers.py`: 100%
  - `services.py`: 94%
  - `views.py`: 98%
  - couverture globale `apps/notifications/*`: 91%
- gains mesurables cote `aquaculture`:
  - `tasks.py`: 100%
  - `services/base.py`: 100%
  - couverture globale `apps/aquaculture/*`: 88%
- prochain bloc logique: `common` puis `mavecam_api`

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts/tests`
- `cd backend && python3 -m pytest apps/accounts/tests tests/unit/test_rbac.py`

## Verification bloc 2
- `python3 -m ruff check backend/apps/chat/tests`
- `cd backend && python3 -m pytest apps/chat/tests`
- `cd backend && python3 -m coverage report -m --include='apps/chat/*'`

## Verification bloc 3
- `python3 -m ruff check backend/apps/commerce/tests`
- `cd backend && python3 -m pytest apps/commerce/tests`
- `cd backend && python3 -m coverage report -m --include='apps/commerce/*'`

## Verification bloc 4
- `python3 -m ruff check backend/apps/notifications/tests`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests`
- `cd backend && python3 -m coverage report -m --include='apps/notifications/*'`

## Verification bloc 5
- `python3 -m ruff check backend/apps/aquaculture/tests/test_tasks.py backend/apps/aquaculture/tests/services/test_base_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/test_tasks.py apps/aquaculture/tests/services/test_base_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests`
- `cd backend && python3 -m coverage report -m --include='apps/aquaculture/*'`
