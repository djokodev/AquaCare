from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("aquaculture", "0020_productionreport_payload_gin_index"),
    ]

    operations = [
        migrations.AddIndex(
            model_name="productioncycle",
            index=models.Index(
                fields=["farm_profile", "updated_at"],
                name="aq_cycle_farm_updated_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="cyclelog",
            index=models.Index(
                fields=["cycle", "created_offline", "created_at"],
                name="aq_log_cycle_sync_created_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="sanitarylog",
            index=models.Index(
                fields=["cycle", "created_offline", "created_at"],
                name="aq_san_cycle_sync_created_idx",
            ),
        ),
    ]
