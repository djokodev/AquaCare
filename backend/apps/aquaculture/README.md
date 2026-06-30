# Module Aquaculture Backend

Documentation technique du module backend `aquaculture`.

Cette doc sert de point d'entree pour reprendre le module sans relire tout le code. Elle decrit le role du module, ses flux metier, ses modeles, ses contrats API, ses regles critiques et les zones fragiles.

## Objectif

Le module `aquaculture` porte le coeur metier de production piscicole AquaCare:

1. Configuration de production ferme (setup initial).
2. Simulation annuelle economique.
3. Gestion complete des cycles de production.
4. Saisie des journaux quotidiens (croissance, mortalite, alimentation, eau).
5. Plans d'alimentation et recommandations.
6. Suivi sanitaire avec resolution d'incidents.
7. Synchronisation offline-first mobile vers backend.
8. Generation, validation, diffusion et telechargement de rapports.
9. Dashboard agrege multi-cycles ou scope cycle de session.

## Limites Du Module

`aquaculture` est responsable du metier production.

Il ne doit pas devenir responsable de:

1. L'identite, authentification, profil utilisateur de base, cela appartient a `accounts`.
2. Le moteur de notifications global, cela appartient au module `notifications`.
3. Les commandes et le panier commerce, cela appartient a `commerce`.
4. Les calculs definitifs hors perimetre production aquacole.

Notes de frontiere:

1. `accounts.FarmProfile` reste l'entite maitre de la ferme, `aquaculture.FarmProductionPlan` stocke les hypotheses de production.
2. Des aliases legacy `accounts` existent encore pour setup/simulation, pour compatibilite mobile.

## Architecture Interne

Le module suit la separation:

```text
HTTP request
  -> urls.py
  -> views/*
  -> serializers.py
  -> services/*_application_service.py
  -> services/*_service.py
  -> domain/*
  -> models.py
  -> tasks.py / signals.py
```

Responsabilites par couche:

| Couche | Fichiers | Role |
| --- | --- | --- |
| Routes | `urls.py` | Expose `/api/aquaculture/*` |
| Views DRF | `views/*.py` | Auth, permissions, mapping HTTP, codes de retour |
| Serializers | `serializers.py` | Validation, coercition, contrats response |
| Application services | `services/*_application_service.py` | Orchestration use case, mapping erreurs metier vers API |
| Domain services | `services/*_service.py` | Regles metier, transactions, IO ORM |
| Domain pur | `domain/*.py` | Calculs, validateurs, exceptions metier |
| ORM | `models.py` | Persistance, index, contraintes, querysets optimises |
| Async | `tasks.py` | Rapports async, post-log async, cache invalidation |
| Signals | `signals.py` | Declencheurs legers, delegation vers services |
| Protection API | `throttles.py` | Throttle sync, rapports, sanitaire |

## Modeles

### FarmProductionPlan

Modele: `aquaculture.models.FarmProductionPlan`

Role:

1. Stocker setup production et hypotheses economiques au niveau ferme.
2. Decoupler ces donnees du profil `accounts`.

Points critiques:

1. Relation `OneToOne` vers `accounts.FarmProfile`.
2. `setup_completed` pilote le flux "Creer mon elevage".
3. `default_feed_price_per_kg` sert aux calculs de cout aliment backend.

### ProductionUnit

Modele: `aquaculture.models.ProductionUnit`

Role:

1. Representer une infrastructure reelle de ferme, comme un bac, un etang ou une cage.
2. Porter la dimension principale exploitable pour le calcul de capacite.
3. Normaliser les anciens types legacy vers les valeurs canoniques du domaine.

### CycleUnitAllocation

Modele: `aquaculture.models.CycleUnitAllocation`

Role:

1. Relier un cycle global a une unite de production specifique.
2. Preparrer la repartition future du cycle sans casser le flow cycle-first actuel.
3. Fournir une base stable pour les allocations, les transferts et le contexte par unite dans les prochaines PRs.

PR #63 ajoute aussi un dashboard opérationnel par allocation pour calculer les indicateurs de suivi à partir des logs unit-scoped.

### CycleFeedStockEntry

Modele: `aquaculture.models.CycleFeedStockEntry`

Role:

1. Centraliser le stock d'aliments d'un cycle au niveau Magasin.
2. Conserver les declarations manuelles et les imports automatiques de commandes recues.
3. Supporter la deduplication offline-first via `client_uuid` et la traçabilite `order_item`.

### ProductionCycle

Modele central: `aquaculture.models.ProductionCycle`

Role:

1. Representer un cycle complet, du demarrage a la recolte.
2. Porter etat courant, projection economique, metriques finales.

Invariants importants:

1. UUID primaire, `client_uuid` unique pour dedup offline.
2. Au moins `pond_surface_m2` ou `pond_volume_m3` a la creation.
3. `status` officiel: `planned`, `active`, `harvested`, `cancelled`.
4. Les metriques derivees sont calculees backend.

### CycleLog

Role:

1. Journal quotidien d'un cycle.
2. Upsert logique par `(cycle, log_date)` cote API create.
3. Support sync offline via `client_uuid`.

Contraintes:

1. Unicite `(cycle, log_date)` en base.
2. Validation echantillonnage, date log dans fenetre cycle.

### FeedingPlan

Role:

1. Recommendations hebdomadaires de rationnement.
2. Generation auto selon cycle, guides nutritionnels, temperature.

### SanitaryLog

Role:

1. Tracer les incidents sanitaires, traitements, resolution.
2. Support photo, `multipart/form-data`.
3. Idempotence retries offline via `client_uuid`.

### PartialHarvest

Role:

1. Gerer des ventes partielles sans cloturer le cycle.
2. Decremente `current_count`, conserve `status=active`.

### NutritionalGuide

Role:

1. Table de reference nutritionnelle.
2. Source de recommandations pour feeding plans.
3. Structure temperature-dependante possible (`temperature_rates`).

### CycleMetrics

Role:

1. Snapshot metriques pre-calculees associees au cycle.
2. Eviter recalculs couteux cote frontend.

### ProductionReport, ReportDispatchLog

Role:

1. Rapport periodique (`daily`, `weekly`, `monthly`) avec cycle scope optionnel.
2. Workflow `pending -> draft -> validated`.
3. Diffusion email/whatsapp tracee pour audit.

## Flux Metier

### 1. Setup Ferme Et Simulation

Endpoints:

1. `POST|PATCH /api/aquaculture/production-plan/setup/`
2. `POST /api/aquaculture/production-plan/simulate/`

Regles:

1. Setup persiste dans `FarmProductionPlan`, simulation ne persiste rien.
2. Endpoints legacy `accounts` encore supportes pour migration mobile.

### 2. Creation De Cycle

Endpoint:

1. `POST /api/aquaculture/cycles/`

Pipeline:

1. Serializer valide formes et bornes.
2. `ProductionCycleApplicationService` delegue a `ProductionCycleService.create_cycle`.
3. Defaults economiques, checks densite, biomasse initiale, idempotence `client_uuid`.

### 3. Journaux Quotidiens

Endpoints:

1. `POST /api/aquaculture/cycle-logs/`
2. `POST /api/aquaculture/cycle-logs/bulk_create/`

Comportement:

1. `create` est un upsert metier sur `(cycle, log_date)`.
2. En sync bulk, recalculs unitaires evites via flag thread-local puis recalcul batch.
3. Les logs peuvent aussi etre rattaches a une `CycleUnitAllocation` pour le suivi par unite, tout en conservant le flux legacy sans unite.

### 4. Sanitaire

Endpoints:

1. `POST /api/aquaculture/sanitary-logs/`
2. `POST /api/aquaculture/sanitary-logs/{id}/resolve/`
3. `GET /api/aquaculture/sanitary-logs/active_issues/`

Comportement:

1. Creation idempotente par `client_uuid`.
2. Resolution trace date et notes.
3. Le log sanitaire peut egalement etre rattache a une `CycleUnitAllocation` quand le contexte unitaire est disponible.

### 5. Recolte Finale Et Recolte Partielle

Endpoints:

1. `POST /api/aquaculture/cycles/{id}/harvest/`
2. `POST /api/aquaculture/cycles/{id}/partial-harvest/`
3. `GET /api/aquaculture/cycles/{id}/partial-harvests/`

Regles:

1. `harvest` cloture cycle, calcule survie, FCR, biomasse finale.
2. `partial-harvest` garde le cycle actif, decremente effectif courant.

### 5.5 Magasin De Cycle

Endpoints:

1. `GET /api/aquaculture/cycles/{id}/store/`
2. `POST /api/aquaculture/cycles/{id}/store/manual-stock/`

Regles:

1. Les ajouts manuels sont idempotents via `client_uuid`.
2. Les commandes passees a `received` sont importees automatiquement dans le stock.
3. Les commandes en attente restent visibles mais ne sont pas comptees dans le stock.
4. Le stock consomme est calcule a partir des logs a partir du premier point de suivi stock.

### 6. Dashboard

Endpoint:

1. `GET /api/aquaculture/dashboard/`

Options:

1. `cycle_id` scope session.
2. `lightweight=true` pour ecrans de selection/saisie rapide.

### 7. Sync Offline

Endpoint:

1. `POST /api/aquaculture/sync/`

Comportement:

1. Push de `new_cycles`, `cycle_logs`, `sanitary_logs`.
2. Pull de `server_updates` depuis `last_sync`.
3. Dedup via `client_uuid`, statut `partial_success` possible.
4. Retour `207 Multi-Status` sur succes partiel.

### 8. Rapports

Endpoints:

1. `POST /api/aquaculture/reports/generate/`
2. `POST /api/aquaculture/reports/{id}/regenerate/`
3. `POST /api/aquaculture/reports/{id}/validate/`
4. `POST /api/aquaculture/reports/{id}/send-email/`
5. `POST /api/aquaculture/reports/{id}/mark-whatsapp-shared/`
6. `GET /api/aquaculture/reports/{id}/download/`

Cycle:

1. `generate` cree un rapport `pending`, lance Celery, retourne `202`.
2. `download` retourne `409` si PDF en generation ou regeneration.
3. Regeneration reinitialise statuts de diffusion.

## API Exposee

### Endpoints Principaux

| Endpoint | Methodes | Notes |
| --- | --- | --- |
| `/dashboard/` | `GET` | Dashboard scope optionnel |
| `/sync/` | `POST` | Sync offline bidirectionnelle |
| `/production-plan/setup/` | `POST`, `PATCH` | Contrat canonique setup |
| `/production-plan/simulate/` | `POST` | Simulation sans persistance |
| `/cycles/` | `GET`, `POST` | CRUD cycles |
| `/cycles/{id}/harvest/` | `POST` | Cloture cycle |
| `/cycles/{id}/statistics/` | `GET` | Analytics detaillees |
| `/cycles/{id}/comparison/` | `GET` | Comparatif historique |
| `/cycles/{id}/store/` | `GET` | Resume du Magasin |
| `/cycles/{id}/store/manual-stock/` | `POST` | Declaration manuelle de stock |
| `/cycles/{id}/feed-phases/` | `GET` | Phases commande aliment |
| `/cycles/{id}/feed-status/` | `GET` | Besoin, commande, consomme |
| `/cycles/{id}/partial-harvest/` | `POST` | Vente partielle |
| `/cycles/{id}/partial-harvests/` | `GET` | Historique ventes partielles |
| `/cycle-logs/` | `GET`, `POST` | List, upsert quotidien |
| `/cycle-logs/bulk_create/` | `POST` | Bulk logs sync |
| `/feeding-plans/` | `GET`, `POST` | Plans actifs |
| `/feeding-plans/generate/` | `POST` | Generation auto |
| `/sanitary-logs/` | `GET`, `POST` | CRUD sanitaire |
| `/sanitary-logs/{id}/resolve/` | `POST` | Resolution incident |
| `/sanitary-logs/active_issues/` | `GET` | Incidents ouverts |
| `/nutritional-guides/` | `GET` | Reference lecture seule |
| `/reports/` | `GET` | Liste rapports |
| `/reports/*` | actions custom | Workflow rapport |

### Codes HTTP A Connaitre

1. `200`, succes standard.
2. `201`, creation.
3. `202`, tache asynchrone acceptee (rapports).
4. `207`, sync partiellement reussie.
5. `400`, validation/metier.
6. `401`, token absent ou invalide.
7. `403`, acces inter-ferme refuse.
8. `404`, ressource hors scope.
9. `409`, rapport PDF non pret ou conflit sync.
10. `429`, throttles actifs.

## Permissions, Securite, Contraintes

1. Toutes les routes exigent `IsAuthenticated`.
2. Scope ferme par `farm_profile__user=request.user`.
3. Idempotence offline protegee par `client_uuid` unique.
4. Throttles specifiques pour sync, actions rapports, download, sanitaire.
5. Les erreurs metier utilisent des exceptions domaine dediees.

## Async, Signals, Cache

1. `post_log_async_tasks` decale notifications, alertes environnement, analytics.
2. `generate_report_async_task` gere generation PDF en Celery.
3. Dashboard cache TTL 60s, invalidation ciblee apres mutations.
4. `signals.py` doit rester mince, logique metier dans services.

## Decisions Techniques Importantes

1. Backend source de verite pour calculs metriques et couts.
2. Offline-first natif, UUID client dedup, fallback partial success.
3. Separer service applicatif et service metier pour testabilite.
4. Prechargements queryset et budgets SQL verifies par tests.
5. Workflow rapport asynchrone pour eviter blocage HTTP.

## Pieges Connus

1. `urls.py` contient encore un ancien resume d'endpoints incluant `notifications`, non canonique.
2. Un enum OpenAPI inline cycle mentionne `terminated`, alors que le modele officiel utilise `cancelled`.
3. En sync bulk sanitaire, verifier toute evolution du champ photo, le chemin bulk n'est pas equivalent au chemin multipart unitaire.
4. `partial-harvest` depend de regles de maturite espece, attention aux regressions si seuils modifies.
5. Toute modification des payloads sync ou report risque de casser la compatibilite mobile.

## Interaction Frontend

Le detail frontend est documente dans:

1. [frontend aquaculture module doc](../../../frontend/src/features/aquaculture/AQUACULTURE_MODULE.md)

Regle de coherence:

1. Le frontend peut estimer pour UX instantanee.
2. Le backend reste la source definitive des metriques, statuts, couts.

## Tests Et Reprise

Points de validation recommandes:

1. `backend/apps/aquaculture/tests/test_views.py`
2. `backend/apps/aquaculture/tests/services/test_sync_service.py`
3. `backend/apps/aquaculture/tests/services/test_report_application_service.py`
4. `backend/apps/aquaculture/tests/test_partial_harvest_views.py`
5. `backend/apps/aquaculture/tests/test_production_plan_endpoints.py`

Checklist rapide avant changement risque:

1. Verifier compatibilite contracts mobile (`types`, payload sync, report payload).
2. Verifier scopes user, permissions, statuts cycle.
3. Verifier codes HTTP attendus (`202`, `207`, `409` notamment).
4. Verifier non regression performance sur dashboard, logs, cycles.
