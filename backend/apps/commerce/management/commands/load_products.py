"""
Commande de management pour charger les produits DIBAQ dans le catalogue.
"""
import json
from pathlib import Path

from commerce.models import Product
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Charge les produits DIBAQ dans le catalogue depuis fixtures JSON'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear all existing products before loading',
        )
        parser.add_argument(
            '--update',
            action='store_true',
            help='Update existing products with new data from fixtures',
        )

    def handle(self, *args, **options):
        self.stdout.write("Loading MAVECAM product catalog...")

        # Clear existing products if requested
        if options.get('clear'):
            deleted_count = Product.objects.all().delete()[0]
            self.stdout.write(f"Cleared {deleted_count} existing products")

        # Load products from JSON fixtures
        json_path = Path(__file__).parent.parent.parent / 'fixtures' / 'products.json'
        
        if not json_path.exists():
            self.stdout.write(
                self.style.ERROR(f"Fixtures file not found: {json_path}")
            )
            return

        with open(json_path, encoding='utf-8') as f:
            products_data = json.load(f)

        created_count = 0
        updated_count = 0
        existing_count = 0

        for item in products_data:
            pk = item['pk']
            fields = item['fields']

            if options.get('update'):
                # Update existing products or create new ones
                product, created = Product.objects.update_or_create(
                    id=pk,
                    defaults=fields
                )

                if created:
                    created_count += 1
                    self.stdout.write(
                        f"  ✓ Created: {fields['name']} ({fields['package_weight_kg']}kg)"
                    )
                else:
                    updated_count += 1
                    self.stdout.write(
                        f"  ↻ Updated: {fields['name']} ({fields['package_weight_kg']}kg)"
                    )
            else:
                # Use get_or_create to avoid duplicates (idempotent)
                product, created = Product.objects.get_or_create(
                    id=pk,
                    defaults=fields
                )

                if created:
                    created_count += 1
                    self.stdout.write(
                        f"  ✓ Created: {fields['name']} ({fields['package_weight_kg']}kg)"
                    )
                else:
                    existing_count += 1

        # Display summary
        total_products = Product.objects.count()
        dibaq = Product.objects.filter(brand='dibaq').count()
        available = Product.objects.filter(is_available=True).count()

        self.stdout.write(
            self.style.SUCCESS(
                f"\n{'='*50}\n"
                f"AquaCare Product Catalog Summary:\n"
                f"{'='*50}\n"
                f"Total products: {total_products}\n"
                f"  - DIBAQ: {dibaq}\n"
                f"Available products: {available}\n"
                f"\nOperation result:\n"
                f"  - Created: {created_count}\n"
                f"  - Updated: {updated_count}\n"
                f"  - Already existed: {existing_count}\n"
                f"{'='*50}"
            )
        )
