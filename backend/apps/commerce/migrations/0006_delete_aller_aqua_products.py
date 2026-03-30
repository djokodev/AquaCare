"""
Migration : Suppression des produits Aller Aqua.

AquaCare commercialise uniquement DIBAQ. Les produits Aller Aqua
sont définitivement retirés du catalogue (app en phase bêta,
aucune commande réelle ne référence ces produits).
"""
from django.db import migrations


def delete_aller_aqua(apps, schema_editor):
    Product = apps.get_model('commerce', 'Product')
    deleted_count, _ = Product.objects.filter(brand='aller_aqua').delete()
    if deleted_count:
        print(f"  Supprimé {deleted_count} produit(s) Aller Aqua.")


def restore_aller_aqua(apps, schema_editor):
    # Pas de restauration — irréversible (bêta, pas de données client)
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('commerce', '0005_order_production_cycle_fk'),
    ]

    operations = [
        migrations.RunPython(delete_aller_aqua, restore_aller_aqua),
    ]
