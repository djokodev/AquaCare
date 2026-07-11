"""Generate reproducible ORM-backed review PDFs and their lineage artifacts."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch

from accounts.models import User
from aquaculture.models import (
    CycleLog,
    CycleUnitAllocation,
    PartialHarvest,
    ProductionCycle,
    ProductionUnit,
    SanitaryLog,
)
from aquaculture.services.report_service import ReportService
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone


class _RollbackReviewSamples(Exception):
    """Rollback marker: review data must never remain in the configured database."""


class Command(BaseCommand):
    help = "Generate ORM-backed cycle report samples in a rollback transaction."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            default="tmp/report-review/final-source-of-truth",
            help="Directory for PDFs, payloads, manifest and optional PNG pages.",
        )
        parser.add_argument(
            "--git-sha",
            default=None,
            help="Source commit SHA when the command runs outside the repository checkout.",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("This review generator is disabled when DEBUG=False.")

        output_dir = Path(options["output_dir"]).resolve()
        output_dir.mkdir(parents=True, exist_ok=True)
        for path in output_dir.glob("*"):
            if path.is_file():
                path.unlink()

        reports: list[dict] = []
        stored_files: list[tuple[object, str]] = []
        try:
            with transaction.atomic():
                with patch("aquaculture.tasks.post_log_async_tasks.delay"):
                    farm, cycle, allocations, legacy_cycle = self._create_review_data()
                specs = [
                    (
                        "cycle-daily-final", "daily", date(2026, 7, 19), date(2026, 7, 19),
                        "cycle", cycle.id, "fr", date(2026, 7, 20),
                    ),
                    (
                        "cycle-weekly-final", "weekly", date(2026, 7, 13), date(2026, 7, 19),
                        "cycle", cycle.id, "fr", date(2026, 7, 20),
                    ),
                    (
                        "cycle-monthly-final", "monthly", date(2026, 7, 1), date(2026, 7, 31),
                        "cycle", cycle.id, "fr", date(2026, 8, 1),
                    ),
                    (
                        "cycle-legacy-final", "monthly", date(2026, 7, 1), date(2026, 7, 31),
                        "cycle", legacy_cycle.id, "fr", date(2026, 8, 1),
                    ),
                    (
                        "unit-regression-final", "daily", date(2026, 7, 19), date(2026, 7, 19),
                        "unit", allocations[0].id, "fr", date(2026, 7, 20),
                    ),
                    (
                        "cycle-weekly-final-en", "weekly", date(2026, 7, 13), date(2026, 7, 19),
                        "cycle", cycle.id, "en", date(2026, 7, 20),
                    ),
                ]
                for stem, report_type, period_start, period_end, scope, scope_id, language, generated_on in specs:
                    farm.user.language_preference = language
                    farm.user.save(update_fields=["language_preference"])
                    report = self._generate(
                        farm=farm,
                        report_type=report_type,
                        period_start=period_start,
                        period_end=period_end,
                        scope=scope,
                        scope_id=scope_id,
                        generated_on=generated_on,
                    )
                    pdf_bytes = report.pdf_file.read()
                    pdf_path = output_dir / f"{stem}.pdf"
                    payload_path = output_dir / f"{stem}.payload.json"
                    pdf_path.write_bytes(pdf_bytes)
                    payload_path.write_text(
                        json.dumps(report.payload, ensure_ascii=False, indent=2, default=str) + "\n",
                        encoding="utf-8",
                    )
                    stored_files.append((report.pdf_file.storage, report.pdf_file.name))
                    reports.append(
                        {
                            "name": stem,
                            "type": report_type,
                            "scope": scope,
                            "period_start": period_start.isoformat(),
                            "period_end": period_end.isoformat(),
                            "generated_at": report.generated_at.isoformat(),
                            "pdf_path": str(pdf_path),
                            "payload_path": str(payload_path),
                            "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
                        }
                    )
                raise _RollbackReviewSamples
        except _RollbackReviewSamples:
            pass
        finally:
            for storage, name in stored_files:
                storage.delete(name)

        self._render_pngs(output_dir)
        manifest = {
            "git_sha": options.get("git_sha") or self._git_sha(),
            "command": "manage.py generate_cycle_report_review_samples " + " ".join(
                [
                    f"--output-dir {options['output_dir']}",
                    *([f"--git-sha {options['git_sha']}"] if options.get("git_sha") else []),
                ]
            ),
            "generated_at": timezone.localtime(timezone.now()).isoformat(),
            "database_mode": "temporary/rollback",
            "reports": reports,
        }
        (output_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        self.stdout.write(self.style.SUCCESS(f"Generated {len(reports)} rollback review reports in {output_dir}"))

    @staticmethod
    def _generate(*, farm, report_type, period_start, period_end, scope, scope_id, generated_on):
        generated_at = timezone.make_aware(datetime.combine(generated_on, time(10, 0)))
        with patch("django.utils.timezone.now", return_value=generated_at):
            return ReportService.generate_for_farm(
                farm_profile=farm,
                report_type=report_type,
                period_start=period_start,
                period_end=period_end,
                scope_type=scope,
                scope_object_id=str(scope_id) if scope_id else None,
            )

    @staticmethod
    def _create_review_data():
        run_token = uuid.uuid4().hex[:8]
        phone_suffix = str(int(run_token, 16) % 1_000_000_000).zfill(9)
        user = User.objects.create_user(
            phone_number=f"+237{phone_suffix}",
            email=f"review-{run_token}@aquacare.local",
            first_name="Review",
            last_name="AquaCare",
            account_type="individual",
            age_group="26_35",
            activity_type="poisson_table",
            region="centre",
            language_preference="fr",
        )
        farm = user.farm_profile
        farm.farm_name = "Ferme Source de vérité"
        farm.total_ponds = 3
        farm.total_area_m2 = Decimal("1500.00")
        farm.water_source = "Rivière"
        farm.main_species = "Silure"
        farm.annual_production_kg = 5000
        farm.certification_status = "pending"
        farm.save()
        cycle = ProductionCycle.objects.create(
            farm_profile=farm,
            cycle_name="Cycle Silure — juillet 2026",
            species="clarias",
            pond_identifier="Site multi-unités",
            pond_surface_m2=Decimal("500.00"),
            pond_volume_m3=Decimal("600.00"),
            start_date=date(2026, 4, 1),
            initial_count=2000,
            initial_average_weight=Decimal("20.00"),
            initial_biomass=Decimal("40.00"),
            planned_cycle_duration_days=150,
            current_count=1840,
            current_average_weight=Decimal("220.00"),
            current_biomass=Decimal("404.80"),
            total_feed_consumed=Decimal("148.00"),
            fingerlings_cost_fcfa=Decimal("95000.00"),
            planned_selling_price_per_kg_fcfa=Decimal("2000.00"),
            other_operational_costs_fcfa=Decimal("0.00"),
            status="active",
        )
        allocations = []
        for index, name in enumerate(("Bassin A", "Bassin B")):
            unit = ProductionUnit.objects.create(
                farm_profile=farm,
                name=name,
                unit_type="tank",
                volume_m3=Decimal("3.00"),
            )
            allocations.append(
                CycleUnitAllocation.objects.create(
                    cycle=cycle,
                    production_unit=unit,
                    initial_fish_count=1000,
                    current_fish_count=820,
                    initial_biomass_kg=Decimal("20.00"),
                    current_biomass_kg=Decimal("180.40"),
                )
            )

        weight_by_day = {5: "160.00", 12: "175.00", 19: "190.00", 26: "205.00", 31: "220.00"}
        for allocation_index, allocation in enumerate(allocations):
            logs = []
            for day in range(1, 32):
                mortality = 0
                if day <= 19:
                    mortality = 2 if day < 19 else 4
                elif day <= 27:
                    mortality = 3
                else:
                    mortality = 4
                logs.append(
                    CycleLog(
                        cycle=cycle,
                        cycle_unit_allocation=allocation,
                        log_date=date(2026, 7, day),
                        mortality_count=mortality,
                        feed_quantity=Decimal("2.50") + Decimal(str(allocation_index * 0.10)),
                        sample_count=20 if day in weight_by_day else None,
                        average_weight=Decimal(weight_by_day[day]) if day in weight_by_day else None,
                        sample_total_weight=(
                            Decimal(weight_by_day[day]) * Decimal("20") if day in weight_by_day else None
                        ),
                        water_temperature=Decimal("28.00"),
                        dissolved_oxygen=Decimal("5.00"),
                        ph_level=Decimal("7.00"),
                        observations=f"Suivi quotidien {day}/07",
                    )
                )
            CycleLog.objects.bulk_create(logs)
            PartialHarvest.objects.create(
                cycle=cycle,
                cycle_unit_allocation=allocation,
                harvest_date=date(2026, 7, 18),
                count_harvested=100,
                average_weight_g=Decimal("190.00"),
                total_weight_kg=Decimal("19.00"),
            )

        SanitaryLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocations[0],
            event_date=date(2026, 7, 15),
            event_type="disease",
            symptoms="Points blancs",
            affected_count=18,
            resolved=False,
        )
        SanitaryLog.objects.create(
            cycle=cycle,
            cycle_unit_allocation=allocations[1],
            event_date=date(2026, 7, 10),
            resolution_date=date(2026, 7, 17),
            event_type="treatment",
            symptoms="Traitement préventif",
            affected_count=12,
            resolved=True,
        )
        SanitaryLog.objects.create(
            cycle=cycle,
            event_date=date(2026, 7, 14),
            resolution_date=date(2026, 7, 17),
            event_type="water_quality",
            symptoms="Eau trouble",
            affected_count=5,
            resolved=True,
        )

        legacy_cycle = ProductionCycle.objects.create(
            farm_profile=farm,
            cycle_name="Cycle legacy global",
            species="clarias",
            pond_identifier="Bassin legacy",
            pond_surface_m2=Decimal("200.00"),
            pond_volume_m3=Decimal("200.00"),
            start_date=date(2026, 4, 1),
            initial_count=500,
            initial_average_weight=Decimal("20.00"),
            initial_biomass=Decimal("10.00"),
            planned_cycle_duration_days=150,
            current_count=490,
            current_average_weight=Decimal("200.00"),
            current_biomass=Decimal("98.00"),
            total_feed_consumed=Decimal("77.50"),
            fingerlings_cost_fcfa=Decimal("25000.00"),
            status="active",
        )
        CycleLog.objects.create(
            cycle=legacy_cycle,
            log_date=date(2026, 7, 19),
            mortality_count=10,
            feed_quantity=Decimal("2.50"),
            average_weight=Decimal("200.00"),
            sample_count=20,
            sample_total_weight=Decimal("4000.00"),
        )
        SanitaryLog.objects.create(
            cycle=legacy_cycle,
            event_date=date(2026, 7, 16),
            event_type="disease",
            symptoms="Événement global legacy",
            affected_count=7,
            resolved=False,
        )
        return farm, cycle, allocations, legacy_cycle

    @staticmethod
    def _git_sha() -> str:
        try:
            return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        except (OSError, subprocess.CalledProcessError):
            return "unknown"

    @staticmethod
    def _render_pngs(output_dir: Path) -> None:
        converter = shutil.which("pdftoppm")
        if not converter:
            return
        png_dir = output_dir / "png"
        png_dir.mkdir(exist_ok=True)
        for pdf_path in output_dir.glob("*.pdf"):
            subprocess.run(
                [converter, "-png", "-r", "130", str(pdf_path), str(png_dir / pdf_path.stem)],
                check=True,
                capture_output=True,
            )
