"""Add the physical final-harvest datetime without inventing legacy precision."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0033_global_production_unit_name'),
    ]

    operations = [
        migrations.AddField(
            model_name='cycleunitallocation',
            name='final_harvested_at',
            field=models.DateTimeField(
                blank=True,
                help_text="Instant métier auquel la récolte finale a physiquement eu lieu.",
                null=True,
                verbose_name='Récolte finale effectuée le',
            ),
        ),
    ]
