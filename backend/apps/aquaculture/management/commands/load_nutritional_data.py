"""
Commande de management pour charger les données de guides nutritionnels AquaCare.
Source : Tables officielles DIBAQ (Catfish + Tilapia — phase production uniquement).

Les tables de rationnement DIBAQ sont température-dépendantes.
temperature_rates = dict {temp_°C: kg_aliment_pour_100kg_biomasse_par_jour}
feeding_rate_percentage = taux à la température de référence (26°C pour Cameroun tropical).

Starter phase (<10g) non chargée — hors scope (utilisateurs achètent alevins à 10g+).
"""
from decimal import Decimal

from aquaculture.models import NutritionalGuide
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Charge les tables de rationnement officielles DIBAQ (production, 10g+)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--species',
            type=str,
            help='Charger une espèce uniquement (clarias ou tilapia)',
        )

    def handle(self, *args, **options):
        self.stdout.write('Chargement des tables DIBAQ (production)...')
        self.load_dibaq_guides(options)

        total = NutritionalGuide.objects.count()
        clarias = NutritionalGuide.objects.filter(species='clarias').count()
        tilapia = NutritionalGuide.objects.filter(species='tilapia').count()

        self.stdout.write(self.style.SUCCESS(
            f'\nRésumé guides nutritionnels:\n'
            f'  Total : {total}\n'
            f'  Clarias : {clarias}\n'
            f'  Tilapia : {tilapia}'
        ))

    # ------------------------------------------------------------------ #
    # DIBAQ CATFISH — Phase Production                                     #
    # Source: "Tabla de Alimentacion - CATSFISH.pdf"                       #
    # Unité: kg aliment / 100 kg biomasse / jour  (= % biomasse)          #
    # ------------------------------------------------------------------ #
    CLARIAS_DIBAQ = [
        {
            'growth_stage': 'alevin',
            'min_weight': Decimal('10.00'),
            'max_weight': Decimal('50.00'),
            'feed_size_mm': Decimal('2.0'),
            'protein_requirement': 45,
            'meals_per_day': 3,
            'recommended_products': ['DIBAQ Catfish 2mm'],
            'expected_fcr': Decimal('1.10'),
            'reference_temperature_c': 26,
            # taux à 26°C = 5.3%
            'feeding_rate_percentage': Decimal('5.30'),
            'temperature_rates': {
                '14': 0.8, '16': 1.5, '18': 2.1, '20': 3.0,
                '22': 3.9, '24': 4.6, '26': 5.3, '28': 4.8,
                '30': 4.2, '32': 3.6,
            },
            'feeding_notes': (
                'Source: DIBAQ Catfish Production Table. '
                '<14°C: selon appétit. >33°C: selon appétit / niveau O2.'
            ),
        },
        {
            'growth_stage': 'juvenile',
            'min_weight': Decimal('50.00'),
            'max_weight': Decimal('100.00'),
            'feed_size_mm': Decimal('2.0'),
            'protein_requirement': 42,
            'meals_per_day': 3,
            'recommended_products': ['DIBAQ Catfish 2mm'],
            'expected_fcr': Decimal('1.15'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('3.80'),
            'temperature_rates': {
                '14': 0.6, '16': 1.0, '18': 1.5, '20': 2.2,
                '22': 2.9, '24': 3.4, '26': 3.8, '28': 3.4,
                '30': 3.1, '32': 2.8,
            },
            'feeding_notes': 'Source: DIBAQ Catfish Production Table.',
        },
        {
            'growth_stage': 'croissance',
            'min_weight': Decimal('100.00'),
            'max_weight': Decimal('250.00'),
            'feed_size_mm': Decimal('4.0'),
            'protein_requirement': 38,
            'meals_per_day': 2,
            'recommended_products': ['DIBAQ Catfish 4mm'],
            'expected_fcr': Decimal('1.20'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('3.20'),
            'temperature_rates': {
                '14': 0.5, '16': 0.9, '18': 1.3, '20': 1.8,
                '22': 2.4, '24': 2.8, '26': 3.2, '28': 2.9,
                '30': 2.6, '32': 2.3,
            },
            'feeding_notes': 'Source: DIBAQ Catfish Production Table.',
        },
        {
            'growth_stage': 'finition',
            'min_weight': Decimal('250.00'),
            'max_weight': Decimal('500.00'),
            'feed_size_mm': Decimal('4.0'),
            'protein_requirement': 35,
            'meals_per_day': 2,
            'recommended_products': ['DIBAQ Catfish 4mm'],
            'expected_fcr': Decimal('1.30'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('2.40'),
            'temperature_rates': {
                '14': 0.4, '16': 0.7, '18': 0.9, '20': 1.4,
                '22': 1.8, '24': 2.1, '26': 2.4, '28': 2.1,
                '30': 1.9, '32': 1.7,
            },
            'feeding_notes': 'Source: DIBAQ Catfish Production Table.',
        },
        {
            'growth_stage': 'pre_recolte',
            'min_weight': Decimal('500.00'),
            'max_weight': Decimal('2000.00'),
            'feed_size_mm': Decimal('6.0'),
            'protein_requirement': 32,
            'meals_per_day': 1,
            'recommended_products': ['DIBAQ Catfish 6mm'],
            'expected_fcr': Decimal('1.40'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('1.70'),
            'temperature_rates': {
                '14': 0.3, '16': 0.5, '18': 0.7, '20': 1.0,
                '22': 1.3, '24': 1.5, '26': 1.7, '28': 1.5,
                '30': 1.4, '32': 1.2,
            },
            'feeding_notes': (
                'Source: DIBAQ Catfish Production Table (colonne >500g). '
                '>33°C: selon appétit / niveau O2.'
            ),
        },
    ]

    # ------------------------------------------------------------------ #
    # DIBAQ TILAPIA — Phase Production                                     #
    # Source: "Tabla de Alimentacion - TILAPIA.pdf"                        #
    # ------------------------------------------------------------------ #
    TILAPIA_DIBAQ = [
        {
            'growth_stage': 'alevin',
            'min_weight': Decimal('10.00'),
            'max_weight': Decimal('50.00'),
            'feed_size_mm': Decimal('2.0'),
            'protein_requirement': 45,
            'meals_per_day': 3,
            'recommended_products': ['DIBAQ Tilapia 2mm'],
            'expected_fcr': Decimal('1.05'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('5.30'),
            'temperature_rates': {
                '10': 1.2, '12': 1.8, '14': 2.4, '16': 3.1,
                '18': 3.7, '20': 4.3, '22': 4.9, '24': 5.1,
                '26': 5.3, '28': 5.5, '30': 6.2, '32': 6.9,
            },
            'feeding_notes': (
                'Source: DIBAQ Tilapia Production Table. '
                '<10°C: selon appétit. >33°C: selon appétit / niveau O2.'
            ),
        },
        {
            'growth_stage': 'juvenile',
            'min_weight': Decimal('50.00'),
            'max_weight': Decimal('100.00'),
            'feed_size_mm': Decimal('2.0'),
            'protein_requirement': 40,
            'meals_per_day': 3,
            'recommended_products': ['DIBAQ Tilapia 2mm'],
            'expected_fcr': Decimal('1.10'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('5.00'),
            'temperature_rates': {
                '10': 1.0, '12': 1.5, '14': 2.0, '16': 2.6,
                '18': 3.1, '20': 3.6, '22': 4.1, '24': 4.6,
                '26': 5.0, '28': 5.2, '30': 5.8, '32': 6.5,
            },
            'feeding_notes': 'Source: DIBAQ Tilapia Production Table.',
        },
        {
            'growth_stage': 'croissance',
            'min_weight': Decimal('100.00'),
            'max_weight': Decimal('250.00'),
            'feed_size_mm': Decimal('3.5'),
            'protein_requirement': 35,
            'meals_per_day': 2,
            'recommended_products': ['DIBAQ Tilapia 3.5mm'],
            'expected_fcr': Decimal('1.15'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('4.10'),
            'temperature_rates': {
                '10': 0.8, '12': 1.0, '14': 1.5, '16': 1.8,
                '18': 2.3, '20': 2.8, '22': 3.3, '24': 3.8,
                '26': 4.1, '28': 4.3, '30': 4.8, '32': 5.4,
            },
            'feeding_notes': 'Source: DIBAQ Tilapia Production Table.',
        },
        {
            'growth_stage': 'finition',
            'min_weight': Decimal('250.00'),
            'max_weight': Decimal('500.00'),
            'feed_size_mm': Decimal('3.5'),
            'protein_requirement': 32,
            'meals_per_day': 2,
            'recommended_products': ['DIBAQ Tilapia 3.5mm'],
            'expected_fcr': Decimal('1.25'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('3.00'),
            'temperature_rates': {
                '10': 0.6, '12': 0.8, '14': 1.0, '16': 1.3,
                '18': 1.5, '20': 1.8, '22': 2.3, '24': 2.8,
                '26': 3.0, '28': 3.1, '30': 3.5, '32': 3.9,
            },
            'feeding_notes': 'Source: DIBAQ Tilapia Production Table.',
        },
        {
            'growth_stage': 'pre_recolte',
            'min_weight': Decimal('500.00'),
            'max_weight': Decimal('1000.00'),
            'feed_size_mm': Decimal('5.0'),
            'protein_requirement': 30,
            'meals_per_day': 1,
            'recommended_products': ['DIBAQ Tilapia 5mm'],
            'expected_fcr': Decimal('1.35'),
            'reference_temperature_c': 26,
            'feeding_rate_percentage': Decimal('2.10'),
            'temperature_rates': {
                '10': 0.5, '12': 0.6, '14': 0.8, '16': 1.0,
                '18': 1.3, '20': 1.5, '22': 1.8, '24': 2.0,
                '26': 2.1, '28': 2.2, '30': 2.5, '32': 2.8,
            },
            'feeding_notes': (
                'Source: DIBAQ Tilapia Production Table (colonne >500g). '
                '>33°C: selon appétit / niveau O2.'
            ),
        },
    ]

    def load_dibaq_guides(self, options):
        """Charge ou met à jour les guides DIBAQ via update_or_create (idempotent).
        Supprime d'abord les anciennes entrées non-DIBAQ pour éviter les conflits de lookup.
        """
        species_filter = options.get('species')

        # Nettoyer les anciennes entrées AquaCare (source par défaut avant cette refonte)
        old_entries = NutritionalGuide.objects.exclude(source='DIBAQ')
        if species_filter:
            old_entries = old_entries.filter(species=species_filter)
        deleted_count = old_entries.count()
        if deleted_count:
            old_entries.delete()
            self.stdout.write(f'  Supprimé {deleted_count} ancienne(s) entrée(s) non-DIBAQ')

        datasets = []
        if not species_filter or species_filter == 'clarias':
            datasets.append(('clarias', self.CLARIAS_DIBAQ))
        if not species_filter or species_filter == 'tilapia':
            datasets.append(('tilapia', self.TILAPIA_DIBAQ))

        for species, rows in datasets:
            created_count = 0
            updated_count = 0

            for row in rows:
                lookup = {
                    'species': species,
                    'min_weight': row['min_weight'],
                    'source': 'DIBAQ',
                }
                defaults = {k: v for k, v in row.items()}
                defaults['source'] = 'DIBAQ'

                _, created = NutritionalGuide.objects.update_or_create(
                    **lookup,
                    defaults=defaults,
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1

            self.stdout.write(
                f'  {species}: {created_count} créés, {updated_count} mis à jour'
            )
