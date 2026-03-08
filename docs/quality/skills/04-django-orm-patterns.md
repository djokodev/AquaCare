# Skill 04 - django-orm-patterns

## Audit initial

### Bloc 1 - accounts
- Les flux `register`, `login` et `profile` serialisaient `UserProfileSerializer`, qui embarque `farm_profile`, sans garantie de `select_related('farm_profile')`.
- Les lookups d'authentification dans `UserManager.get_by_login_name()` et `get_by_natural_key()` chargeaient l'utilisateur puis son `farm_profile` en requete differente.
- L'admin `UserAdmin` affichait `farm_profile__certification_status` dans la liste sans eager loading, et `FarmProfileAdmin` affichait `user.display_name` sans `select_related('user')`.
- Les actions bulk de certification/suspension de fermes sauvegardaient chaque `FarmProfile` un par un.
- Les lookups de connexion par `business_name` et par `first_name + last_name` n'avaient pas encore d'index dedies dans les migrations.

## Plan d'execution

### Bloc 1 - accounts
- introduire des QuerySets utilitaires pour `User` et `FarmProfile`
- charger `farm_profile` en eager loading sur les flux API qui le serialisent
- charger `user` / `farm_profile` en eager loading dans l'admin
- convertir les actions bulk admin en `update()` SQL cible
- ajouter les index ORM utiles aux recherches d'authentification
- verrouiller les gains avec des tests de requetes

## Etat courant
- bloc `accounts` valide
- `UserManager` charge desormais `farm_profile` pour les lookups de connexion
- `RegisterView`, `ProfileView` et `FarmProfileView` utilisent des acces ORM explicites et eager loading
- `UserAdmin` et `FarmProfileAdmin` evitent les N+1 sur les listes
- les actions admin de certification/suspension utilisent un `update()` bulk pour les profils fermes
- migration `0005_alter_user_options_and_more.py` ajoute les index ORM du module `accounts`
- bloc `chat` valide
- `Conversation` expose des annotations ORM pour `message_count` et `last_message` sans requete par conversation
- le feed des messages charge `conversation.user` et `sender_user` en eager loading
- `ConversationService` et `ConversationViewSet` reutilisent des querysets ORM explicites pour les acces detail/liste
- bloc `commerce` valide
- `Product` et `Order` exposent des querysets ORM reutilisables pour catalogue et details de commande
- les previews et creations de commande chargent les produits en batch au lieu d'une requete par ligne
- les retours de `create_order`, `confirm_order_receipt` et les listings de commandes reutilisent des commandes deja hydratees avec `items__product`
- bloc `notifications` valide
- `Notification` expose un queryset ORM commun pour les notifications visibles cote utilisateur
- la liste API reutilise `select_related('content_type')` au lieu d'un `prefetch_related` inutile, ce qui supprime une requete sur l'endpoint liste
- `NotificationService` reutilise le meme pattern pour les lectures et garde le bulk des preferences en chemin rapide
- bloc `aquaculture` valide
- `ProductionCycle`, `CycleLog`, `FeedingPlan`, `SanitaryLog` et `ProductionReport` exposent des querysets ORM reutilisables pour API, dashboard, statistiques et rapports
- `ProductionCycleViewSet` ne precharge plus `logs`, `feeding_plans` et `sanitary_logs` sur la liste standard; le prechargement des logs est reserve a l'action `statistics`
- `AnalyticsService` reutilise les logs prefetchés en memoire pour l'analyse mortalite/croissance/environnement et pour la reconstruction des `CycleMetrics`, ce qui supprime plusieurs relectures SQL du meme cycle
- `DashboardService` reutilise des querysets ORM dedies et calcule les agrégats du dashboard a partir des cycles deja charges, au lieu de lancer une requete d'aggregate supplementaire
- `ProductionReportViewSet` distingue maintenant le listing leger du detail et ne precharge plus `dispatch_logs` pour la liste des rapports
- des tests de budget de requetes verrouillent les endpoints `production-cycle-list`, `production-cycle-statistics`, `dashboard` et `production-report-list`

## Verification bloc 1
- `python3 -m ruff check backend/apps/accounts`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/accounts/tests`
- `python3 -m ruff check backend/apps/chat`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/chat/tests`
- `python3 -m ruff check backend/apps/commerce`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/commerce/tests`
- `python3 -m ruff check backend/apps/notifications`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/notifications/tests`
- `python3 -m ruff check backend/apps/aquaculture`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests/test_views.py apps/aquaculture/tests/services/test_analytics_service.py`
- `cd backend && DJANGO_SETTINGS_MODULE=mavecam_api.settings.test python3 -m pytest apps/aquaculture/tests`
