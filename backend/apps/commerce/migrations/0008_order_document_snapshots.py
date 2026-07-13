"""Backfill immutable operational-document snapshots for existing orders."""

from django.db import migrations, models


ISSUER = {"name": "AquaCare", "phone": "+237 652 260 368"}
PARTNER = {
    "name": "MaveCameroun",
    "role_fr": "Partenaire de préparation et de livraison",
    "role_en": "Fulfilment and delivery partner",
    "address": "Port autonome de Douala, face à DANGOTE CEMENT",
    "hours_fr": "Lundi au vendredi, 09:00–17:00",
    "hours_en": "Monday to Friday, 9:00 AM–5:00 PM",
    "phones": ["+237 686 528 904", "+237 657 983 215"],
    "emails": ["customerservice@mavecam.cm", "info@mavecam.cm"],
}
PICKUP_LABELS = {"ndokoti": "Marché Ndokoti", "ndogpasi": "Marché Ndogpasi"}


def backfill_order_document_snapshots(apps, schema_editor):
    """Use migration-era models only; tolerate anomalous legacy relations."""
    Order = apps.get_model("commerce", "Order")
    OrderItem = apps.get_model("commerce", "OrderItem")
    for order in Order.objects.select_related("farm_profile").iterator():
        farm = getattr(order, "farm_profile", None)
        Order.objects.filter(pk=order.pk).update(
            farm_name_snapshot=getattr(farm, "farm_name", "") or "",
            document_schema_version="1.0",
            issuer_snapshot=ISSUER,
            fulfilment_partner_snapshot=PARTNER,
            production_cycle_name_snapshot=(
                getattr(getattr(order, "production_cycle", None), "cycle_name", "") or ""
            ),
            pickup_location_display_snapshot=PICKUP_LABELS.get(order.pickup_location, ""),
        )
    for item in OrderItem.objects.select_related("product").iterator():
        product = getattr(item, "product", None)
        OrderItem.objects.filter(pk=item.pk).update(
            product_brand_snapshot=getattr(product, "brand", "") or "",
            product_species_snapshot=getattr(product, "species", "") or "",
            product_phase_snapshot=getattr(product, "phase", "") or "",
            product_pellet_size_mm_snapshot=getattr(product, "pellet_size_mm", None),
            product_package_weight_kg_snapshot=getattr(product, "package_weight_kg", None),
        )


class Migration(migrations.Migration):
    dependencies = [("commerce", "0007_alter_product_brand")]

    operations = [
        migrations.AlterField(
            model_name="product",
            name="package_weight_kg",
            field=models.PositiveIntegerField(
                help_text="Poids d'un sac en kilogrammes",
                verbose_name="Poids conditionnement (kg)",
            ),
        ),
        migrations.AddField(model_name="order", name="farm_name_snapshot", field=models.CharField(blank=True, default="", max_length=200, verbose_name="Nom de ferme figé")),
        migrations.AddField(model_name="order", name="document_schema_version", field=models.CharField(default="1.0", max_length=20, verbose_name="Version documentaire")),
        migrations.AddField(model_name="order", name="issuer_snapshot", field=models.JSONField(default=dict, verbose_name="Émetteur figé")),
        migrations.AddField(model_name="order", name="fulfilment_partner_snapshot", field=models.JSONField(default=dict, verbose_name="Partenaire figé")),
        migrations.AddField(model_name="order", name="production_cycle_name_snapshot", field=models.CharField(blank=True, default="", max_length=200, verbose_name="Nom du cycle figé")),
        migrations.AddField(model_name="order", name="pickup_location_display_snapshot", field=models.CharField(blank=True, default="", max_length=100, verbose_name="Libellé du point de retrait figé")),
        migrations.AddField(model_name="orderitem", name="product_brand_snapshot", field=models.CharField(blank=True, default="", max_length=50, verbose_name="Marque figée")),
        migrations.AddField(model_name="orderitem", name="product_species_snapshot", field=models.CharField(blank=True, default="", max_length=20, verbose_name="Espèce figée")),
        migrations.AddField(model_name="orderitem", name="product_phase_snapshot", field=models.CharField(blank=True, default="", max_length=30, verbose_name="Phase figée")),
        migrations.AddField(model_name="orderitem", name="product_pellet_size_mm_snapshot", field=models.DecimalField(blank=True, decimal_places=2, max_digits=4, null=True, verbose_name="Granulométrie figée (mm)")),
        migrations.AddField(model_name="orderitem", name="product_package_weight_kg_snapshot", field=models.PositiveIntegerField(blank=True, null=True, verbose_name="Poids conditionnement figé (kg)")),
        migrations.RunPython(backfill_order_document_snapshots, migrations.RunPython.noop),
    ]
