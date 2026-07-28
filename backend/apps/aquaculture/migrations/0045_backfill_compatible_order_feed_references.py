"""Rattache les anciennes commandes AquaCare dont l'identité est démontrable."""

from django.db import migrations


def _normalize(value):
    return ' '.join((value or '').casefold().split())


def _normalize_species(value):
    return 'clarias' if value == 'catfish' else value


def backfill_compatible_order_references(apps, schema_editor):
    FeedReference = apps.get_model('aquaculture', 'FarmFeedReference')
    StockEntry = apps.get_model('aquaculture', 'CycleFeedStockEntry')

    entries = StockEntry.objects.select_related(
        'cycle',
        'order',
        'order_item',
        'order_item__product',
    ).filter(
        source='order',
        feed_reference__isnull=True,
        order__isnull=False,
        order_item__isnull=False,
    )

    for entry in entries.iterator():
        item = entry.order_item
        order = entry.order
        cycle = entry.cycle
        product = item.product
        species = _normalize_species(item.product_species_snapshot or product.species)
        name = (item.product_name or product.name or '').strip()
        pellet_size = item.product_pellet_size_mm_snapshot
        package_weight = item.product_package_weight_kg_snapshot

        # A legacy row is repaired only when the order, farm, species, size and
        # package snapshot all point to the same catalog identity. In particular,
        # an old catfish item must never be silently attached to a tilapia cycle.
        if not all((
            order.production_cycle_id == cycle.id,
            order.farm_profile_id == cycle.farm_profile_id,
            name,
            species == cycle.species,
            pellet_size is not None,
            package_weight is not None and package_weight > 0,
        )):
            continue

        reference, _ = FeedReference.objects.get_or_create(
            farm_profile_id=cycle.farm_profile_id,
            source='aquacare_catalog',
            catalog_product_id=product.id,
            normalized_name=_normalize(name),
            species=species,
            pellet_size_mm=pellet_size,
            defaults={
                'name': name,
                'brand': item.product_brand_snapshot or product.brand or '',
                'protein_percentage': product.protein_percentage,
                'lipid_percentage': product.lipid_percentage,
                'package_weight_kg': package_weight,
            },
        )
        StockEntry.objects.filter(pk=entry.pk).update(feed_reference_id=reference.id)


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0044_backfill_cycle_feed_phase_progression'),
    ]

    operations = [
        migrations.RunPython(
            backfill_compatible_order_references,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
