# Projection des activités Admin — exploitation Lot 2A

Le Lot 2A écrit `AdminActivityEvent` en permanence. Le flag
`ADMIN_ACTIVITY_CENTER_ENABLED` contrôle uniquement les lectures et l'interface
du Lot 2B ; le désactiver ne suspend pas les projecteurs.

## Backfill initial

Commencer par estimer la fenêtre par défaut de 180 jours :

```bash
python manage.py backfill_admin_activity_events --dry-run
```

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

Le mode `repair` est idempotent et crée les projections live manquantes avec
`is_backfilled=False`, afin qu'elles puissent réapparaître comme nouvelles en
Lot 2B. Une collision incompatible est une anomalie à investiguer ; l'historique
existant n'est jamais réécrit silencieusement.

## Rollback

Pour revenir à l'expérience Lot 1, conserver
`ADMIN_ACTIVITY_CENTER_ENABLED=False`. Les données projetées sont
reconstructibles et ne doivent jamais servir à restaurer une source métier. Si
les hooks 2A sont temporairement retirés, exécuter un repair de la période
concernée avant leur réactivation.
