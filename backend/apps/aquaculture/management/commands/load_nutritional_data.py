"""
Commande de management pour charger les données de guides nutritionnels pour MAVECAM AquaCare.
Basée sur les spécifications techniques de la documentation Skretting et Aller Aqua.
"""
from django.core.management.base import BaseCommand
from decimal import Decimal

from aquaculture.models import NutritionalGuide


class Command(BaseCommand):
    help = 'Charge les données de guides nutritionnels pour les espèces aquacoles'

    def add_arguments(self, parser):
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update existing guides instead of creating new ones',
        )
        parser.add_argument(
            '--species',
            type=str,
            help='Load data for specific species only (clarias or tilapia)',
        )

    def handle(self, *args, **options):
        self.stdout.write("Loading nutritional guide data...")

        # ⚠️ PATCH: Ne pas utiliser loaddata avec auto_now_add (bug Django connu)
        # Django loaddata force created_at=NULL au lieu d'utiliser auto_now_add
        # Solution: Créer directement via ORM pour que Django gère auto_now_add
        self.create_nutritional_guides(options)

        # Display summary
        total_guides = NutritionalGuide.objects.count()
        clarias_guides = NutritionalGuide.objects.filter(species='clarias').count()
        tilapia_guides = NutritionalGuide.objects.filter(species='tilapia').count()
        
        self.stdout.write(
            self.style.SUCCESS(
                f"\nNutritional guide summary:\n"
                f"Total guides: {total_guides}\n"
                f"Clarias guides: {clarias_guides}\n"
                f"Tilapia guides: {tilapia_guides}"
            )
        )

    def create_nutritional_guides(self, options):
        """Crée les guides nutritionnels par programmation."""
        
        # Clarias feeding data based on technical documentation
        clarias_data = [
            {
                'growth_stage': 'alevin',
                'min_weight': Decimal('2.00'),
                'max_weight': Decimal('10.00'),
                'feeding_rate_percentage': Decimal('8.00'),
                'protein_requirement': 45,
                'meals_per_day': 4,
                'feed_size_mm': Decimal('1.0'),
                'recommended_products': ['MAVECAM Starter Premium 1.0mm'],
                'expected_fcr': Decimal('0.90'),
                'feeding_notes': 'Alimentation fréquente requise pour alevins'
            },
            {
                'growth_stage': 'juvenile',
                'min_weight': Decimal('10.00'),
                'max_weight': Decimal('50.00'),
                'feeding_rate_percentage': Decimal('7.00'),
                'protein_requirement': 42,
                'meals_per_day': 3,
                'feed_size_mm': Decimal('1.8'),
                'recommended_products': ['MAVECAM Starter 1.8mm'],
                'expected_fcr': Decimal('0.95'),
                'feeding_notes': 'Transition vers alimentation moins fréquente'
            },
            {
                'growth_stage': 'croissance',
                'min_weight': Decimal('50.00'),
                'max_weight': Decimal('150.00'),
                'feeding_rate_percentage': Decimal('5.00'),
                'protein_requirement': 38,
                'meals_per_day': 3,
                'feed_size_mm': Decimal('2.5'),
                'recommended_products': ['MAVECAM Superior 2-3mm'],
                'expected_fcr': Decimal('1.00'),
                'feeding_notes': 'Phase de croissance active'
            },
            {
                'growth_stage': 'finition',
                'min_weight': Decimal('150.00'),
                'max_weight': Decimal('500.00'),
                'feeding_rate_percentage': Decimal('3.50'),
                'protein_requirement': 35,
                'meals_per_day': 2,
                'feed_size_mm': Decimal('4.5'),
                'recommended_products': ['MAVECAM Superior 4.5mm'],
                'expected_fcr': Decimal('1.10'),
                'feeding_notes': 'Préparation pour récolte'
            }
        ]

        # Tilapia feeding data
        tilapia_data = [
            {
                'growth_stage': 'alevin',
                'min_weight': Decimal('1.50'),
                'max_weight': Decimal('8.00'),
                'feeding_rate_percentage': Decimal('8.50'),
                'protein_requirement': 45,
                'meals_per_day': 4,
                'feed_size_mm': Decimal('1.0'),
                'recommended_products': ['MAVECAM Tilapia Starter 1.0mm'],
                'expected_fcr': Decimal('0.85'),
                'feeding_notes': 'Très sensible aux conditions environnementales'
            },
            {
                'growth_stage': 'juvenile',
                'min_weight': Decimal('8.00'),
                'max_weight': Decimal('40.00'),
                'feeding_rate_percentage': Decimal('6.50'),
                'protein_requirement': 40,
                'meals_per_day': 3,
                'feed_size_mm': Decimal('1.8'),
                'recommended_products': ['MAVECAM Tilapia Juvenile 1.8mm'],
                'expected_fcr': Decimal('0.90'),
                'feeding_notes': 'Phase critique, éviter suralimentation'
            },
            {
                'growth_stage': 'croissance',
                'min_weight': Decimal('40.00'),
                'max_weight': Decimal('120.00'),
                'feeding_rate_percentage': Decimal('4.50'),
                'protein_requirement': 35,
                'meals_per_day': 3,
                'feed_size_mm': Decimal('2.5'),
                'recommended_products': ['MAVECAM Tilapia Growth 2-3mm'],
                'expected_fcr': Decimal('1.00'),
                'feeding_notes': 'Surveiller reproduction précoce'
            },
            {
                'growth_stage': 'finition',
                'min_weight': Decimal('120.00'),
                'max_weight': Decimal('400.00'),
                'feeding_rate_percentage': Decimal('3.00'),
                'protein_requirement': 32,
                'meals_per_day': 2,
                'feed_size_mm': Decimal('4.5'),
                'recommended_products': ['MAVECAM Tilapia Finition 4.5mm'],
                'expected_fcr': Decimal('1.15'),
                'feeding_notes': 'Préparation taille commerciale'
            }
        ]

        # Create or update guides
        species_filter = options.get('species')
        update_mode = options.get('update', False)

        if not species_filter or species_filter == 'clarias':
            self.create_species_guides('clarias', clarias_data, update_mode)

        if not species_filter or species_filter == 'tilapia':
            self.create_species_guides('tilapia', tilapia_data, update_mode)

    def create_species_guides(self, species, data, update_mode):
        """Crée les guides pour une espèce spécifique."""
        created_count = 0
        updated_count = 0

        for guide_data in data:
            defaults = guide_data.copy()
            lookup_fields = {
                'species': species,
                'growth_stage': guide_data['growth_stage']
            }

            if update_mode:
                guide, created = NutritionalGuide.objects.update_or_create(
                    **lookup_fields,
                    defaults=defaults
                )
                if created:
                    created_count += 1
                else:
                    updated_count += 1
            else:
                guide, created = NutritionalGuide.objects.get_or_create(
                    **lookup_fields,
                    defaults=defaults
                )
                if created:
                    created_count += 1

        if update_mode:
            self.stdout.write(
                f"Species {species}: {created_count} created, {updated_count} updated"
            )
        else:
            self.stdout.write(
                f"Species {species}: {created_count} guides created"
            )