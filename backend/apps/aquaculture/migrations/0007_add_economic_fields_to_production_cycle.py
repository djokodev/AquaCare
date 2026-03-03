from datetime import timedelta
from decimal import Decimal

from django.db import migrations, models
import django.core.validators


def seed_cycle_economic_fields(apps, schema_editor):
    ProductionCycle = apps.get_model('aquaculture', 'ProductionCycle')

    for cycle in ProductionCycle.objects.all().iterator():
        species = (cycle.species or '').lower()
        is_tilapia = species == 'tilapia'

        default_target = Decimal('300') if is_tilapia else Decimal('400')
        default_duration = 120 if is_tilapia else 150
        default_price = Decimal('2500') if is_tilapia else Decimal('2800')

        updates = {}

        if cycle.target_harvest_weight_g is None:
            updates['target_harvest_weight_g'] = default_target

        if cycle.planned_cycle_duration_days is None:
            updates['planned_cycle_duration_days'] = default_duration

        if cycle.expected_survival_rate_pct is None:
            updates['expected_survival_rate_pct'] = Decimal('85')

        if cycle.planned_selling_price_per_kg_fcfa is None:
            updates['planned_selling_price_per_kg_fcfa'] = default_price

        if cycle.fingerlings_cost_fcfa is None:
            updates['fingerlings_cost_fcfa'] = Decimal('0')

        if cycle.other_operational_costs_fcfa is None:
            updates['other_operational_costs_fcfa'] = Decimal('0')

        effective_duration = updates.get(
            'planned_cycle_duration_days',
            cycle.planned_cycle_duration_days or default_duration,
        )
        if cycle.planned_harvest_date is None and cycle.start_date:
            updates['planned_harvest_date'] = cycle.start_date + timedelta(days=int(effective_duration))

        if updates:
            ProductionCycle.objects.filter(pk=cycle.pk).update(**updates)


def noop_reverse(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ('aquaculture', '0006_add_infrastructure_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='productioncycle',
            name='expected_survival_rate_pct',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=5,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(Decimal('0')),
                    django.core.validators.MaxValueValidator(Decimal('100')),
                ],
                verbose_name='Taux de survie prévisionnel (%)',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='fingerlings_cost_fcfa',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0'),
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
                verbose_name='Coût alevins (FCFA)',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='other_operational_costs_fcfa',
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal('0'),
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(Decimal('0'))],
                verbose_name='Autres charges opérationnelles (FCFA)',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='planned_cycle_duration_days',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                validators=[
                    django.core.validators.MinValueValidator(30),
                    django.core.validators.MaxValueValidator(365),
                ],
                verbose_name='Durée prévisionnelle du cycle (jours)',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='planned_harvest_date',
            field=models.DateField(blank=True, null=True, verbose_name='Date prévisionnelle de récolte'),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='planned_selling_price_per_kg_fcfa',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=12,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal('1'))],
                verbose_name='Prix de vente prévisionnel (FCFA/kg)',
            ),
        ),
        migrations.AddField(
            model_name='productioncycle',
            name='target_harvest_weight_g',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                max_digits=6,
                null=True,
                validators=[django.core.validators.MinValueValidator(Decimal('50'))],
                verbose_name='Poids cible récolte (g)',
            ),
        ),
        migrations.RunPython(seed_cycle_economic_fields, noop_reverse),
    ]
