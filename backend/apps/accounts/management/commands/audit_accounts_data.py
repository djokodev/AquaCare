from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from accounts.models import FarmProfile, User
from aquaculture.models import FarmProductionPlan
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q
from django.db.models.functions import Trim


class Command(BaseCommand):
    help = "Audit accounts data integrity before or after critical migrations."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--expected-feed-price",
            help="Optional expected default feed price used to flag historical drift.",
        )

    def handle(self, *args: object, **options: Any) -> None:
        expected_feed_price = self._parse_expected_feed_price(options["expected_feed_price"])
        checks = self._build_checks(expected_feed_price)
        failed_checks = [(name, count) for name, count in checks if count > 0]

        self.stdout.write("Accounts data audit")
        for name, count in checks:
            status = "OK" if count == 0 else "ERROR"
            self.stdout.write(f"{status} {name}: {count}")

        self._print_feed_price_distribution()

        if failed_checks:
            failed_names = ", ".join(name for name, _count in failed_checks)
            raise CommandError(f"Accounts data audit failed: {failed_names}")

        self.stdout.write(self.style.SUCCESS("Accounts data audit passed."))

    def _parse_expected_feed_price(self, value: str | None) -> Decimal | None:
        if value is None:
            return None
        try:
            return Decimal(value)
        except InvalidOperation as err:
            raise CommandError("--expected-feed-price must be a decimal value.") from err

    def _build_checks(self, expected_feed_price: Decimal | None) -> list[tuple[str, int]]:
        checks = [
            ("users_bad_account_type", self._count_users_bad_account_type()),
            ("individual_missing_names_or_age", self._count_individual_missing_names_or_age()),
            ("company_missing_required", self._count_company_missing_required()),
            ("farms_without_user", self._count_farms_without_user()),
            ("non_admin_users_without_farm", self._count_non_admin_users_without_farm()),
            ("farms_bad_gps_pair", self._count_farms_bad_gps_pair()),
            ("farms_bad_gps_range", self._count_farms_bad_gps_range()),
            ("farms_production_without_ponds", self._count_farms_production_without_ponds()),
        ]
        if expected_feed_price is not None:
            checks.append(
                (
                    "farms_unexpected_default_feed_price",
                    FarmProductionPlan.objects.exclude(default_feed_price_per_kg=expected_feed_price).count(),
                )
            )
        return checks

    def _count_users_bad_account_type(self) -> int:
        return User.objects.exclude(account_type__in=["individual", "company"]).count()

    def _count_individual_missing_names_or_age(self) -> int:
        return User.objects.filter(account_type="individual").annotate(
            first_name_trimmed=Trim("first_name"),
            last_name_trimmed=Trim("last_name"),
        ).filter(
            Q(first_name_trimmed__isnull=True)
            | Q(first_name_trimmed="")
            | Q(last_name_trimmed__isnull=True)
            | Q(last_name_trimmed="")
            | Q(age_group__isnull=True)
            | Q(age_group="")
        ).count()

    def _count_company_missing_required(self) -> int:
        return User.objects.filter(account_type="company").annotate(
            business_name_trimmed=Trim("business_name"),
            promoter_name_trimmed=Trim("promoter_name"),
        ).filter(
            Q(business_name_trimmed__isnull=True)
            | Q(business_name_trimmed="")
            | Q(legal_status__isnull=True)
            | Q(legal_status="")
            | Q(promoter_name_trimmed__isnull=True)
            | Q(promoter_name_trimmed="")
        ).count()

    def _count_farms_without_user(self) -> int:
        return FarmProfile.objects.filter(user__isnull=True).count()

    def _count_non_admin_users_without_farm(self) -> int:
        return User.objects.filter(is_superuser=False, farm_profile__isnull=True).count()

    def _count_farms_bad_gps_pair(self) -> int:
        return FarmProfile.objects.filter(
            Q(latitude__isnull=True, longitude__isnull=False)
            | Q(latitude__isnull=False, longitude__isnull=True)
        ).count()

    def _count_farms_bad_gps_range(self) -> int:
        return FarmProfile.objects.filter(
            Q(latitude__lt=Decimal("-90"))
            | Q(latitude__gt=Decimal("90"))
            | Q(longitude__lt=Decimal("-180"))
            | Q(longitude__gt=Decimal("180"))
        ).count()

    def _count_farms_production_without_ponds(self) -> int:
        return FarmProfile.objects.filter(total_ponds=0, annual_production_kg__gt=0).count()

    def _print_feed_price_distribution(self) -> None:
        self.stdout.write("Feed price distribution")
        rows = (
            FarmProductionPlan.objects.values_list("default_feed_price_per_kg")
            .order_by("default_feed_price_per_kg")
            .distinct()
        )
        for (price,) in rows:
            count = FarmProductionPlan.objects.filter(default_feed_price_per_kg=price).count()
            self.stdout.write(f"INFO default_feed_price_per_kg={price}: {count}")
