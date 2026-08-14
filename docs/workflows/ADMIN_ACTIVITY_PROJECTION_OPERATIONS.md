# Projection des activités Admin — exploitation Lot 2A

Le Lot 2A écrit `AdminActivityEvent` en permanence. Le flag
`ADMIN_ACTIVITY_CENTER_ENABLED` contrôle uniquement les lectures et l'interface
du Lot 2B ; le désactiver ne suspend pas les projecteurs.

## Backfill initial

Commencer par estimer la fenêtre par défaut de 180 jours :

```bash
python manage.py backfill_admin_activity_events --dry-run
```

Le dry-run affiche, pour chaque type sélectionné puis au total, les candidats,
les projections déjà présentes et les créations potentielles. Il ne construit
aucune commande de projection et n'écrit rien.

Exécuter ensuite le backfill par lots :

```bash
python manage.py backfill_admin_activity_events --batch-size 500
```

La fenêtre peut être bornée et filtrée :

```bash
python manage.py backfill_admin_activity_events \
  --since 2026-01-01 \
  --until 2026-06-30 \
  --domains aquaculture commerce \
  --max-events 50000
```

Un scan historique non borné exige les deux options `--all --confirm-all`.
Les événements créés en mode `backfill` portent `is_backfilled=True`.

## Réparation après incident

Le logger `common.admin_activity` émet l'événement structuré
`admin_activity.projection.failed` avec le type, la source, la clé de
déduplication et la classe d'exception, sans contexte de rendu ni donnée libre.

Après correction de la cause, estimer puis réparer une petite fenêtre récente :

```bash
python manage.py backfill_admin_activity_events \
  --mode repair \
  --since 2026-08-12 \
  --until 2026-08-14 \
  --dry-run

python manage.py backfill_admin_activity_events \
  --mode repair \
  --since 2026-08-12 \
  --until 2026-08-14
```

La fenêtre du `backfill` suit la date métier historique. La fenêtre du
`repair` suit l'arrivée ou l'enregistrement serveur persistant quand il existe.
Ainsi, un `CycleLog` antidaté reste réparable par sa date `created_at` serveur.

Le log `admin_activity.projection.failed` fournit `event_type` et
`source_object_id`. Pour réparer une source précise sans scanner les tables :

```bash
python manage.py backfill_admin_activity_events \
  --mode repair \
  --event-types aquaculture.sanitary_log.resolved \
  --source-object-id 11111111-2222-4333-8444-555555555555 \
  --dry-run

python manage.py backfill_admin_activity_events \
  --mode repair \
  --event-types aquaculture.sanitary_log.resolved \
  --source-object-id 11111111-2222-4333-8444-555555555555
```

`--source-object-id` exige le mode `repair`, exactement un `event_type` et un
UUID valide. Cette syntaxe fonctionne pour les quinze types. Elle est requise
pour une résolution sanitaire dont l'instant serveur exact n'est pas persisté :
`source_recorded_at` reste alors `NULL`, c'est-à-dire inconnu, sans inventer un
timestamp.

Le mode `repair` est idempotent et crée les projections live manquantes avec
`is_backfilled=False`, afin qu'elles puissent réapparaître comme nouvelles en
Lot 2B. Une collision incompatible est une anomalie à investiguer ; l'historique
existant n'est jamais réécrit silencieusement.

Lors d'une convergence, `live` et `repair` font gagner
`is_backfilled=False`. Un `source_recorded_at` connu enrichit une valeur
historique inconnue, mais une valeur connue n'est jamais remplacée par `NULL`.
Les noms et le contexte de rendu sont des snapshots : un renommage ultérieur ne
déclenche pas de collision et ne réécrit pas l'ancien libellé. Les collisions
restent réservées aux invariants sémantiques, source, domaine, niveau, contexte
métier lié et occurrence immuable.

## Rapports régénérés

L'événement live `aquaculture.production_report.generated` représente la
première génération réellement observée. `ProductionReport.generated_at` étant
remplacé lors d'une régénération, un backfill ou repair ne peut démontrer que la
valeur courante est la première : il utilise uniquement la génération persistée
la plus récente comme occurrence observable lorsqu'aucun événement n'existe.
Si un snapshot live existe déjà, il est conservé sans duplication ni collision
artificielle après régénération.

## Rollback

Pour revenir à l'expérience Lot 1, conserver
`ADMIN_ACTIVITY_CENTER_ENABLED=False`. Les données projetées sont
reconstructibles et ne doivent jamais servir à restaurer une source métier. Si
les hooks 2A sont temporairement retirés, exécuter un repair de la période
concernée avant leur réactivation.
