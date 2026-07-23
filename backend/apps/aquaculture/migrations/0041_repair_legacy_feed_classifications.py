"""Répare les rattachements heuristiques de 0038 déjà exécutés.

La migration est volontairement conservatrice : une association manuelle ou un
journal ne contient pas assez de provenance pour être distingué d'une
association déduite par l'ancien backfill. Elle est donc retirée sans toucher à
la quantité, au coût, aux dates ni aux snapshots historiques.
"""

from django.db import migrations


def _normalized_species(value):
    return 'clarias' if value == 'catfish' else value


def _certain_order_entry(entry):
    item = getattr(entry, 'order_item', None)
    order = getattr(item, 'order', None) if item is not None else None
    reference = getattr(entry, 'feed_reference', None)
    cycle = entry.cycle
    if not item or not order or not reference:
        return False
    return all((
        entry.source == 'order',
        order.production_cycle_id == cycle.id,
        order.farm_profile_id == cycle.farm_profile_id,
        reference.source == 'aquacare_catalog',
        reference.catalog_product_id == item.product_id,
        reference.species == _normalized_species(item.product_species_snapshot),
        reference.pellet_size_mm == item.product_pellet_size_mm_snapshot,
        item.product_name and reference.normalized_name == ' '.join(
            item.product_name.casefold().split()
        ),
        item.product_package_weight_kg_snapshot is not None,
        item.product_package_weight_kg_snapshot > 0,
    ))


def repair_legacy_classifications(apps, schema_editor):
    StockEntry = apps.get_model('aquaculture', 'CycleFeedStockEntry')
    CycleLog = apps.get_model('aquaculture', 'CycleLog')

    entries = StockEntry.objects.select_related(
        'cycle', 'feed_reference', 'order_item', 'order_item__order',
    ).filter(feed_reference__isnull=False)
    for entry in entries.iterator():
        reference = entry.feed_reference
        if _certain_order_entry(entry) or reference.client_uuid is not None:
            continue
        StockEntry.objects.filter(pk=entry.pk).update(feed_reference_id=None)

    # A journal has no order snapshot proving that the old association was
    # intentional. Explicit references carry a client_uuid; old heuristic
    # references do not. Snapshots feed_type/feed_size_mm remain untouched.
    CycleLog.objects.filter(
        feed_reference__isnull=False,
        feed_reference__client_uuid__isnull=True,
    ).update(feed_reference_id=None)


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0040_cycle_feed_stock_adjustment'),
    ]

    operations = [
        migrations.RunPython(
            repair_legacy_classifications,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
