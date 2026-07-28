"""Point de compatibilité conservateur après 0040.

La première version de cette migration utilisait ``client_uuid IS NULL`` comme
preuve d'un rattachement heuristique. Cette preuve est insuffisante pour une
référence créée en ligne. La réparation démontrable et la restauration des
bases de revue sont donc réalisées par la migration additive 0043.
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
    # Ne jamais retirer une association sans provenance démontrable.
    return None


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
