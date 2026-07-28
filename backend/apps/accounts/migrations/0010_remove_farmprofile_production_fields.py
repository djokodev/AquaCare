from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_accounts_scalability_indexes"),
        ("aquaculture", "0016_farm_production_plan"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="farmprofile",
            name="annual_production_target_kg",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="num_cycles_per_year",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="setup_infrastructure_type",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="setup_unit_count",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="setup_unit_volume_m3",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="setup_unit_surface_m2",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="setup_species",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="fingerlings_cost_per_unit_fcfa",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="planned_selling_price_per_kg_fcfa",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="farm_setup_completed",
        ),
        migrations.RemoveField(
            model_name="farmprofile",
            name="default_feed_price_per_kg",
        ),
    ]
