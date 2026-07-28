import django.db.models.functions.text
from django.db import migrations, models
from django.db.models import Count


def audit_duplicate_unit_names(apps, schema_editor):
    production_unit = apps.get_model('aquaculture', 'ProductionUnit')
    duplicates = list(
        production_unit.objects.annotate(normalized_name=django.db.models.functions.text.Lower('name'))
        .values('farm_profile_id', 'normalized_name')
        .annotate(total=Count('id'))
        .filter(total__gt=1)[:20]
    )
    if duplicates:
        raise RuntimeError(
            'ProductionUnit names must be unique per farm (case-insensitive). '
            f'Rename legacy duplicates before retrying migration: {duplicates}'
        )


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0032_calibration_allocations'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='productionunit',
            name='uniq_calibration_unit_name_farm_ci',
        ),
        migrations.RunPython(audit_duplicate_unit_names, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='productionunit',
            constraint=models.UniqueConstraint(
                django.db.models.functions.text.Lower('name'),
                models.F('farm_profile'),
                name='uniq_production_unit_name_farm_ci',
            ),
        ),
    ]
