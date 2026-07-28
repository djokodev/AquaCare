"""Répare sans perte les associations alimentaires explicitement démontrables."""

from django.db import migrations


def _normalize(value):
    return " ".join((value or "").casefold().split())


def _normalized_species(value):
    return "clarias" if value == "catfish" else value


def _certain_order_entry(entry):
    item = getattr(entry, "order_item", None)
    order = getattr(item, "order", None) if item is not None else None
    reference = getattr(entry, "feed_reference", None)
    cycle = entry.cycle
    if not item or not order or not reference:
        return False
    return all(
        (
            entry.source == "order",
            order.production_cycle_id == cycle.id,
            order.farm_profile_id == cycle.farm_profile_id,
            reference.source == "aquacare_catalog",
            reference.catalog_product_id == item.product_id,
            reference.species
            == _normalized_species(item.product_species_snapshot),
            reference.pellet_size_mm
            == item.product_pellet_size_mm_snapshot,
            item.product_name
            and reference.normalized_name == _normalize(item.product_name),
            item.product_package_weight_kg_snapshot is not None,
            item.product_package_weight_kg_snapshot > 0,
        )
    )


def _entry_candidates(FeedReference, entry):
    if entry.feed_size_mm is None:
        return FeedReference.objects.none()
    return FeedReference.objects.filter(
        farm_profile_id=entry.cycle.farm_profile_id,
        species=entry.cycle.species,
        normalized_name=_normalize(entry.label),
        pellet_size_mm=entry.feed_size_mm,
    )


def _log_candidates(FeedReference, log):
    if log.feed_size_mm is None or not (log.feed_type or "").strip():
        return FeedReference.objects.none()
    return FeedReference.objects.filter(
        farm_profile_id=log.cycle.farm_profile_id,
        species=log.cycle.species,
        normalized_name=_normalize(log.feed_type),
        pellet_size_mm=log.feed_size_mm,
    )


def repair_safe_classifications(apps, schema_editor):
    FeedReference = apps.get_model("aquaculture", "FarmFeedReference")
    StockEntry = apps.get_model("aquaculture", "CycleFeedStockEntry")
    CycleLog = apps.get_model("aquaculture", "CycleLog")

    # Restaure uniquement une correspondance unique et exacte. Les références
    # créées en ligne peuvent légitimement ne posséder ni client_uuid, ni
    # created_offline, ni synced_at : ces champs ne constituent donc pas une
    # preuve de provenance suffisante. L'identité ferme/espèce/nom/granulométrie
    # est utilisée uniquement lorsqu'elle est unique et antérieure à la ligne.
    entries = StockEntry.objects.select_related("cycle").filter(
        feed_reference__isnull=True,
    )
    for entry in entries.iterator():
        candidates = [
            reference
            for reference in _entry_candidates(FeedReference, entry)
            if reference.created_at <= entry.created_at
        ]
        if len(candidates) == 1:
            StockEntry.objects.filter(pk=entry.pk).update(
                feed_reference_id=candidates[0].id
            )

    logs = CycleLog.objects.select_related("cycle").filter(
        feed_reference__isnull=True,
        feed_quantity__gt=0,
    )
    for log in logs.iterator():
        candidates = [
            reference
            for reference in _log_candidates(FeedReference, log)
            if reference.created_at <= log.created_at
        ]
        if len(candidates) == 1:
            CycleLog.objects.filter(pk=log.pk).update(
                feed_reference_id=candidates[0].id
            )

    # Une relation déjà présente est conservée si elle est explicite, certaine
    # ou simplement impossible à distinguer. Cette migration ne supprime donc
    # aucune association sur une absence de client_uuid.


class Migration(migrations.Migration):
    dependencies = [
        ("aquaculture", "0042_cycle_feed_plan_progression"),
    ]

    operations = [
        migrations.RunPython(
            repair_safe_classifications,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
