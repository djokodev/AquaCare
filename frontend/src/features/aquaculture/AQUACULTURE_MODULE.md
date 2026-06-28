# Module Aquaculture Frontend

Documentation technique du module frontend `aquaculture` (React Native, Expo).

Cette doc permet de reprendre rapidement le module mobile sans relire tous les ecrans. Elle couvre architecture, flux utilisateur, contrats API consommes, gestion d'etat, offline-first, contraintes de coherence avec le backend.

## Objectif

Le module frontend `aquaculture` couvre l'experience mobile de production piscicole:

1. Entree session cycle actif.
2. Flux "Creer mon elevage", simulation cycle-first, lancement premier cycle.
3. Saisie journaliere production, sanitaire, suivi croissance.
4. Consultation statistiques, historique, plans d'alimentation.
5. Rapports de production, validation humaine, partage email/WhatsApp.
6. Mode offline avec file locale et synchronisation differee.

## Production Units

Cette base de code couvre maintenant le flux complet des unites de production:

1. Une unite de production represente un bac, un etang ou une cage physique.
2. Le setup "Creer mon elevage" permet de declarer plusieurs unites, dont des duplications rapides d'un meme gabarit.
3. La simulation de cycle calcule la repartition des poissons par unite.
4. Le lancement du cycle persiste les unites et leurs allocations.
5. Le hub "Mes unites en production" ouvre la synthese globale du cycle puis le detail de chaque unite.
6. Le dashboard unitaire reste scope a une seule `CycleUnitAllocation`.
7. Les saisies journaliere et sanitaire restent unit-scoped quand elles sont lancees depuis une unite.
8. Le dashboard global du cycle agrege les unites liees et conserve la compatibilite legacy pour les cycles sans unites.

## Production units end-to-end flow

Le parcours cible est desormais le suivant:

1. Setup des unites de production dans le formulaire d'eleveage.
2. Repartition des poissons sur la base des capacites recommandees.
3. Persistance des unites et allocations au lancement du cycle.
4. Arrivee sur le hub "Mes unites en production".
5. Ouverture d'une unite et consultation du dashboard unitaire.
6. Creation d'une saisie du jour ou d'un suivi sanitaire pour cette unite.
7. Retour au dashboard global du cycle pour verifier l'agregation.
8. Fallback legacy conserve pour les cycles qui n'ont pas encore d'unites.

La logique produit reste alignee avec le backend:

1. Les valeurs finales viennent des reponses API.
2. Les ecrans unitaires recoivent `cycleId`, `cycleUnitAllocationId`, `productionUnitId`, `productionUnitName`.
3. Le cycle global ne double compte pas les logs legacy quand des unites existent.
4. Les etats loading, empty et erreur restent visibles sur les ecrans critiques.

## Manual QA checklist — Production units flow

1. Creer une ferme avec Bac 1, Bac 2 et Etang 1.
2. Repartir les poissons.
3. Lancer le cycle.
4. Verifier l'arrivee sur Mes unites en production.
5. Verifier la synthese globale du cycle.
6. Ouvrir Bac 1.
7. Enregistrer une saisie du jour sur Bac 1.
8. Ouvrir Bac 2.
9. Enregistrer une saisie du jour sur Bac 2.
10. Ouvrir Etang 1.
11. Ajouter un suivi sanitaire.
12. Revenir au hub.
13. Verifier que la synthese globale additionne les unites.
14. Verifier qu'un cycle legacy sans unites fonctionne encore.

## Limites Du Module

Le frontend orchestre UX et saisie utilisateur.

Il ne doit pas:

1. Devenir la source definitive des calculs metier.
2. Deriver des regles metier contredisant les validations backend.
3. Casser la compatibilite des payloads sync/report sans coordination backend.

Regle structurante:

1. Estimation locale possible pour UX instantanee.
2. Valeurs definitives toujours remplacees par la reponse backend.

## Architecture Frontend

Structure principale:

```text
features/aquaculture/
  components/
  screens/
  services/
  store/
  types/
  utils/
```

Responsabilites:

| Couche | Fichiers | Role |
| --- | --- | --- |
| Screens | `screens/*.tsx` | Parcours utilisateur, UI, dispatch |
| Services API | `services/aquacultureService.ts` | Contrat HTTP `/api/aquaculture/*` |
| Workflow service | `services/aquacultureWorkflowService.ts` | Online puis fallback offline |
| Store Redux | `store/aquacultureSlice.ts`, `store/farmSetupSlice.ts` | Etat metier, thunks async |
| Offline | `src/services/offlineService.ts` | Queue locale AsyncStorage, sync bulk/unitaire |
| Types | `src/types/aquaculture.ts` | DTO frontend, payloads |
| Utils formulaire | `utils/*.ts` | Validation UX, payload builders |

## Parcours Utilisateur Principaux

### 1. Entree Session Cycle

Ecran: `CycleSessionEntryScreen`

Flux:

1. Charge dashboard `lightweight=true`.
2. Si zero cycle actif, redirige vers `CreateFarm`.
3. Si un cycle actif, ouvre directement `MainTabs`.
4. Si plusieurs cycles actifs, impose selection explicite.

But:

1. Eviter operations sur mauvais cycle.
2. Encadrer toutes les ecritures dans un scope de session.

### 2. Creation Ferme, Simulation, Premier Cycle

Ecrans:

1. `CreateFarmScreen`
2. `CycleSimulationScreen`

Flux:

1. Form setup local, validation UX.
2. Appel simulation backend `/aquaculture/production-plan/simulate/`.
3. Appel setup backend `/aquaculture/production-plan/setup/`.
4. Creation premier cycle via API cycles.

### 3. Cycle Operations

Ecrans:

1. `NewCycleScreen`
2. `DailyLogScreen`
3. `SanitaryLogScreen`
4. `CycleHistoryScreen`
5. `StatisticsScreen`
6. `PostHarvestConsolidationScreen`

Pattern:

1. Tentative online.
2. Sur erreur reseau detectee, fallback offline automatique (`offlineService`).
3. Sync silencieux au retour de connectivite.

### 4. Rapports

Ecrans:

1. `ReportsScreen`
2. `ReportDetailScreen`

Flux:

1. Generation asynchrone (`status=pending`).
2. Polling pour suivre transition vers `draft` ou `validated`.
3. Telechargement PDF, envoi email, marquage partage WhatsApp.
4. Gestion explicite des `409` PDF non pret.

## API Consommee

Service unique: `features/aquaculture/services/aquacultureService.ts`

### Endpoints Cles Utilises

| Use case | Endpoint |
| --- | --- |
| Dashboard | `GET /aquaculture/dashboard/` |
| Cycle dashboard | `GET /aquaculture/cycles/{id}/dashboard/` |
| Cycles CRUD | `/aquaculture/cycles/` |
| Recolte finale | `POST /aquaculture/cycles/{id}/harvest/` |
| Recolte partielle | `POST /aquaculture/cycles/{id}/partial-harvest/` |
| Logs journaliers | `/aquaculture/cycle-logs/` |
| Sanitaire | `/aquaculture/sanitary-logs/` |
| Feeding plans | `/aquaculture/feeding-plans/`, `/generate/` |
| Guides nutritionnels | `/aquaculture/nutritional-guides/` |
| Sync offline | `POST /aquaculture/sync/` |
| Rapports | `/aquaculture/reports/*` |
| Setup/simulation | `/aquaculture/production-plan/setup/`, `/simulate/` |

Notes contrats:

1. `cycle_id` est frequemment porte par query string pour scope session.
2. Rapports utilisent `202` pour actions async.
3. Download PDF peut renvoyer `409` tant que PDF indisponible.

## Gestion D'Etat

### aquacultureSlice

State principal:

1. `cycles`, `activeCycles`, `currentCycle`
2. `cycleLogs`, `feedingPlans`, `sanitaryLogs`
3. `dashboardData`
4. flags loading par domaine

Garanties:

1. Reset total sur logout.
2. Support du marker `ABORTED_UNAUTHENTICATED` pour eviter faux errors apres logout.

### farmSetupSlice

State dedie:

1. Resultat simulation annuelle.
2. Loading/error simulation.

## Offline-First Mobile

Service central: `src/services/offlineService.ts`

Files locales:

1. Queue `cycle_logs`
2. Queue `new_cycles`
3. Queue `sanitary_logs`

Strategie:

1. Tentative `bulk sync` vers `/aquaculture/sync/`.
2. Si bulk indisponible ou partiel, fallback sync unitaire.
3. Dedup backend via `client_uuid`.
4. Tous les items offline marques `created_offline=true`.

Points critiques:

1. `client_uuid` doit toujours etre genere pour la dedup.
2. Toute evolution payload sync doit etre retro-compatible.
3. Cas photo sanitaire offline bulk doit etre teste explicitement.

## Interaction Avec Accounts Et Autres Modules

1. Setup/simulation aquaculture met a jour des donnees visibles aussi dans profil ferme.
2. Notifications ecran aquaculture utilisent le module global `notifications`, pas un endpoint aquaculture dedie.
3. Feed phases peuvent alimenter des parcours `commerce`.

## Regles Critiques Cote Mobile

1. Ne pas hardcoder des statuts non supportes backend.
2. Eviter calculs definitifs cote mobile pour metriques cycle, FCR, score performance.
3. Toujours privilegier valeurs backend retournees par serializers.
4. Respecter `currentCycle` pour scopes de liste et actions.
5. Conserver gestion robuste des erreurs API, reseau, validation.

## Pieges Connus

1. Drift type possible entre `src/types/aquaculture.ts` et certaines constantes domaine frontend.
2. Divergence potentielle champs `FeedingPlan` (`recommended_feed` vs `recommended_feed_type`).
3. `DashboardData` frontend ne reflete pas tous les champs renvoyes backend.
4. Certains ecrans recalculeent des estimations locales qui peuvent differer du backend.
5. Les transitions de statut rapport demandent une gestion explicite des etats `pending`, `draft`, `validated`.

## Decisions Techniques Importantes

1. Service API centralise, evite duplication de contracts HTTP.
2. Workflow service dedie pour fallback offline coherent.
3. Session cycle explicite avant acces aux operations sensibles.
4. Polling cible pour rapports en generation.
5. Redux state reinitialise au logout pour eviter fuite de contexte utilisateur.

## Tests Existants

Dossiers principaux:

1. `features/aquaculture/screens/__tests__/`
2. `features/aquaculture/services/__tests__/`
3. `features/aquaculture/store/__tests__/`
4. `features/aquaculture/utils/__tests__/`

## Checklist Avant Evolution

1. Verifier contrats backend reels avant changer un type frontend.
2. Verifier impact offline queue et sync payload.
3. Verifier comportement multi-cycles et session cycle active.
4. Verifier etats rapports async, email, whatsapp.
5. Lancer validation TypeScript sans erreur.

## Reference Backend

La logique metier definitive backend est documentee dans:

1. [backend aquaculture README](../../../../backend/apps/aquaculture/README.md)
