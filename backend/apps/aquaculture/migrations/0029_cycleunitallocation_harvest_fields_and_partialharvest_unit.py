from __future__ import annotations

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0028_alter_feedingplan_options_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='cycleunitallocation',
            name='status',
            field=models.CharField(
                choices=[('active', 'Actif'), ('harvested', 'Récolté'), ('inactive', 'Inactif')],
                default='active',
                max_length=20,
                verbose_name='Statut',
            ),
        ),
        migrations.AddField(
            model_name='cycleunitallocation',
            name='harvested_at',
            field=models.DateTimeField(blank=True, null=True, verbose_name='Récoltée le'),
        ),
        migrations.AddField(
            model_name='cycleunitallocation',
            name='final_fish_count',
            field=models.PositiveIntegerField(blank=True, null=True, verbose_name='Nombre final de poissons'),
        ),
        migrations.AddField(
            model_name='cycleunitallocation',
            name='final_average_weight_g',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=8,
                null=True,
                verbose_name='Poids moyen final (g)',
            ),
        ),
        migrations.AddField(
            model_name='cycleunitallocation',
            name='final_biomass_kg',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=10,
                null=True,
                verbose_name='Biomasse finale (kg)',
            ),
        ),
        migrations.AddField(
            model_name='partialharvest',
            name='cycle_unit_allocation',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='unit_partial_harvests',
                to='aquaculture.cycleunitallocation',
                verbose_name="Allocation d'unité de production",
            ),
        ),
        migrations.AddIndex(
            model_name='partialharvest',
            index=models.Index(fields=['cycle_unit_allocation', 'harvest_date'], name='aq_partial_unit_date_idx'),
        ),
    ]
