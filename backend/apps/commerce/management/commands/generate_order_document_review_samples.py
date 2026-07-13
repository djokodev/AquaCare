"""Generate deterministic, self-validating local order-document review samples."""
from __future__ import annotations

import subprocess
from decimal import Decimal
from pathlib import Path
from shutil import rmtree, which

from accounts.models import User
from aquaculture.models import ProductionCycle
from commerce.models import Product
from commerce.services.order_service import OrderService
from commerce.services.pdf_service import OrderDocumentService
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone


class Command(BaseCommand):
    help = "Generate and validate PDF samples in tmp/order-document-review/."

    def add_arguments(self, parser):
        parser.add_argument("--output", default="tmp/order-document-review")
        parser.add_argument(
            "--example-output", default="tmp/order-document-example-two-dibaq"
        )

    def handle(self, *args, **options):
        output_dir = Path(options["output"])
        output_dir.mkdir(parents=True, exist_ok=True)
        self._reset_output_directory(output_dir)
        generated: dict[str, bytes] = {}
        with transaction.atomic():
            user = self._user()
            products = self._products()
            home = self._order(user, products[:1], "home")
            pickup = self._order(user, products[1:2], "pickup")
            one_page = self._order(user, products[:4], "home")
            multi_page = self._order(user, products[:30], "home")
            legacy = self._order(user, products[4:5], "home")
            legacy.farm_name_snapshot = legacy.delivery_full_address = ""
            legacy.save(update_fields=["farm_name_snapshot", "delivery_full_address"])
            legacy.items.update(
                product_brand_snapshot="", product_species_snapshot="",
                product_pellet_size_mm_snapshot=None, product_package_weight_kg_snapshot=None,
            )
            specs = [
                ("01-home-one-item", home, 1, 1), ("03-pickup", pickup, 1, 1),
                ("05-multiple-items-one-page", one_page, 4, 1), ("07-multi-page-order", multi_page, 30, 2),
                ("09-legacy-missing-fields", legacy, 1, 1),
            ]
            for prefix, order, expected_lines, minimum_pages in specs:
                if order.items.count() != expected_lines:
                    raise CommandError(f"{prefix}: expected {expected_lines} lines")
                for language in ("fr", "en"):
                    number = int(prefix[:2]) + (language == "en")
                    stem = f"{number:02d}-{prefix.split('-', 1)[1]}-{language}"
                    pdf_bytes = OrderDocumentService.generate_pdf(order, language)
                    if pdf_bytes in generated.values():
                        raise CommandError(f"{stem}: duplicate PDF bytes")
                    generated[stem] = pdf_bytes
                    pdf_path = output_dir / f"{stem}.pdf"
                    pdf_path.write_bytes(pdf_bytes)
                    pages = self._render_pages(pdf_path, output_dir / stem)
                    if pages is not None and (pages < minimum_pages or (minimum_pages == 1 and pages != 1)):
                        expected = "exactly 1" if minimum_pages == 1 else "at least 2"
                        raise CommandError(f"{stem}: expected {expected} pages, got {pages}")
                    page_label = pages if pages is not None else "unverified"
                    self.stdout.write(f"{stem}: {expected_lines} lines, {page_label} pages")
            self._generate_two_product_example(
                user, products, Path(options["example_output"])
            )
            transaction.set_rollback(True)
        self.stdout.write(self.style.SUCCESS(f"Generated review samples in {output_dir}"))

    @staticmethod
    def _user():
        user = User.objects.create_user(
            phone_number="+237699000083", password="review-only", first_name="Amina", last_name="Njoya",
            age_group="26_35", region="littoral", department="wouri", city="Douala", neighborhood="Bonamoussadi",
        )
        user.farm_profile.farm_name = "Ferme de revue AquaCare"
        user.farm_profile.save(update_fields=["farm_name"])
        return user

    @staticmethod
    def _products():
        return [
            Product.objects.create(
                brand="dibaq", name=f"DIBAQ Feed {index:02d}", species="tilapia" if index % 2 else "catfish",
                phase="grossissement", pellet_size_mm=Decimal("2") + Decimal(index % 5), protein_percentage=32,
                lipid_percentage=8, package_weight_kg=15 if index % 3 else 20,
                price_per_package=Decimal("18000") + index * 100,
            )
            for index in range(1, 31)
        ]

    @staticmethod
    def _order(user, products, delivery_method, quantities=None, production_cycle=None):
        return OrderService.create_order(
            user,
            [
                {
                    "product_id": str(product.id),
                    "quantity": quantities[index] if quantities else index % 4 + 1,
                }
                for index, product in enumerate(products)
            ],
            delivery_method, "ndokoti" if delivery_method == "pickup" else None,
            str(production_cycle.id) if production_cycle else None,
        )

    def _generate_two_product_example(self, user, products, output_dir):
        output_dir.mkdir(parents=True, exist_ok=True)
        self._reset_output_directory(output_dir)
        cycle = ProductionCycle.objects.create(
            farm_profile=user.farm_profile,
            cycle_name="Cycle de démonstration DIBAQ",
            species="tilapia",
            pond_identifier="Bassin A1",
            pond_surface_m2=Decimal("120"),
            start_date=timezone.localdate(),
            initial_count=1200,
            initial_average_weight=Decimal("5"),
            initial_biomass=Decimal("6"),
            current_count=1100,
            current_average_weight=Decimal("150"),
            current_biomass=Decimal("165"),
            status="active",
        )
        order = self._order(
            user,
            products[:2],
            "home",
            quantities=[2, 5],
            production_cycle=cycle,
        )
        for language in ("fr", "en"):
            pdf_path = output_dir / f"two-dibaq-products-{language}.pdf"
            pdf_path.write_bytes(OrderDocumentService.generate_pdf(order, language))
            pages = self._render_pages(pdf_path, output_dir / f"two-dibaq-products-{language}")
            page_label = pages if pages is not None else "unverified"
            self.stdout.write(f"two-dibaq-products-{language}: 2 lines, {page_label} pages")

    @staticmethod
    def _reset_output_directory(output_dir):
        for pdf_path in output_dir.glob("*.pdf"):
            pdf_path.unlink()
        for page_dir in output_dir.iterdir():
            if page_dir.is_dir():
                rmtree(page_dir, ignore_errors=True)

    @staticmethod
    def _render_pages(pdf_path, page_dir):
        if which("pdftoppm"):
            rmtree(page_dir, ignore_errors=True)
            page_dir.mkdir(parents=True, exist_ok=True)
            subprocess.run(["pdftoppm", "-png", str(pdf_path), str(page_dir / "page")], check=True, capture_output=True)
            return len(list(page_dir.glob("page-*.png")))
        return None
