from decimal import Decimal

from django.db import migrations


STARTER_MARKER = (
    'AQUACARE_MANAGED_STARTER_V1 — Passerelle opérationnelle AquaCare '
    'pour les cycles démarrant sous 10 g, fondée sur les hypothèses '
    'internes de simulation ; ce guide n’est pas une ligne officielle DIBAQ.'
)

STARTERS = {
    'clarias': {
        'expected_fcr': Decimal('1.10'),
        'recommended_products': ['DIBAQ Catfish 2mm'],
    },
    'tilapia': {
        'expected_fcr': Decimal('1.05'),
        'recommended_products': ['DIBAQ Tilapia 2mm'],
    },
}


def add_starters(apps, schema_editor):
    NutritionalGuide = apps.get_model('aquaculture', 'NutritionalGuide')
    for species, species_defaults in STARTERS.items():
        NutritionalGuide.objects.update_or_create(
            species=species,
            min_weight=Decimal('0.00'),
            source='AquaCare',
            defaults={
                'growth_stage': 'alevin',
                'max_weight': Decimal('10.00'),
                'feed_size_mm': Decimal('2.0'),
                'feeding_rate_percentage': Decimal('5.00'),
                'protein_requirement': 45,
                'meals_per_day': 3,
                'reference_temperature_c': 26,
                'temperature_rates': {},
                'feeding_notes': STARTER_MARKER,
                **species_defaults,
            },
        )


def remove_starters(apps, schema_editor):
    NutritionalGuide = apps.get_model('aquaculture', 'NutritionalGuide')
    NutritionalGuide.objects.filter(
        species__in=STARTERS,
        min_weight=Decimal('0.00'),
        max_weight=Decimal('10.00'),
        source='AquaCare',
        feeding_notes=STARTER_MARKER,
    ).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('aquaculture', '0045_backfill_compatible_order_feed_references'),
    ]

    operations = [
        migrations.RunPython(add_starters, remove_starters),
    ]
