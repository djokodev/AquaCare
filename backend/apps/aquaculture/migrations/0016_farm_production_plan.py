from __future__ import annotations

import uuid
from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


def copy_farm_plan_data(apps, schema_editor) -> None:
    FarmProfile = apps.get_model("accounts", "FarmProfile")
    FarmProductionPlan = apps.get_model("aquaculture", "FarmProductionPlan")

    plans = []
    for farm in FarmProfile.objects.all().iterator(chunk_size=1000):
        plans.append(
            FarmProductionPlan(
                farm_profile_id=farm.id,
                annual_production_target_kg=getattr(farm, "annual_production_target_kg", None),
                num_cycles_per_year=getattr(farm, "num_cycles_per_year", None),
                setup_infrastructure_type=getattr(farm, "setup_infrastructure_type", "") or "",
                setup_unit_count=getattr(farm, "setup_unit_count", None),
                setup_unit_volume_m3=getattr(farm, "setup_unit_volume_m3", None),
                setup_unit_surface_m2=getattr(farm, "setup_unit_surface_m2", None),
                setup_species=getattr(farm, "setup_species", "") or "",
                fingerlings_cost_per_unit_fcfa=getattr(farm, "fingerlings_cost_per_unit_fcfa", None),
                planned_selling_price_per_kg_fcfa=getattr(farm, "planned_selling_price_per_kg_fcfa", None),
                setup_completed=getattr(farm, "farm_setup_completed", False),
                default_feed_price_per_kg=(
                    getattr(farm, "default_feed_price_per_kg", None)
                    or Decimal("1250.00")
                ),
            )
        )
        if len(plans) >= 1000:
            FarmProductionPlan.objects.bulk_create(plans, ignore_conflicts=True, batch_size=1000)
            plans = []

    if plans:
        FarmProductionPlan.objects.bulk_create(plans, ignore_conflicts=True, batch_size=1000)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0009_accounts_scalability_indexes"),
        ("aquaculture", "0015_productionreport_soft_delete"),
    ]

    operations = [
        migrations.CreateModel(
            name="FarmProductionPlan",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                (
                    "annual_production_target_kg",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Objectif de production annuelle en kg",
                        max_digits=10,
                        null=True,
                        verbose_name="Production cible annuelle (kg)",
                    ),
                ),
                (
                    "num_cycles_per_year",
                    models.PositiveSmallIntegerField(
                        blank=True,
                        choices=[(2, "2 cycles par an"), (3, "3 cycles par an")],
                        help_text="2 ou 3 cycles par an",
                        null=True,
                        verbose_name="Nombre de cycles par an",
                    ),
                ),
                (
                    "setup_infrastructure_type",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("etang", "Étang"),
                            ("cage_flottante", "Cage flottante"),
                            ("bac_hors_sol", "Bac hors sol"),
                            ("bac_en_sol", "Bac en sol"),
                        ],
                        help_text="Type principal d'infrastructure d'élevage",
                        max_length=30,
                        verbose_name="Type d'infrastructure",
                    ),
                ),
                (
                    "setup_unit_count",
                    models.PositiveIntegerField(
                        blank=True,
                        help_text="Nombre de bacs, étangs ou cages",
                        null=True,
                        verbose_name="Nombre d'unités (bacs/étangs)",
                    ),
                ),
                (
                    "setup_unit_volume_m3",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Volume de chaque bac ou cage en m³",
                        max_digits=8,
                        null=True,
                        verbose_name="Volume par unité (m³)",
                    ),
                ),
                (
                    "setup_unit_surface_m2",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Surface de chaque étang en m²",
                        max_digits=8,
                        null=True,
                        verbose_name="Surface par unité (m²)",
                    ),
                ),
                (
                    "setup_species",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("tilapia", "Tilapia"),
                            ("clarias", "Clarias (Silure)"),
                            ("autre", "Autre espèce"),
                        ],
                        help_text="Espèce choisie lors du flux de création d'élevage",
                        max_length=20,
                        verbose_name="Espèce principale (setup)",
                    ),
                ),
                (
                    "fingerlings_cost_per_unit_fcfa",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Prix unitaire d'un alevin en FCFA",
                        max_digits=10,
                        null=True,
                        verbose_name="Coût par alevin (FCFA)",
                    ),
                ),
                (
                    "planned_selling_price_per_kg_fcfa",
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text="Prix de vente prévu du poisson en FCFA/kg",
                        max_digits=10,
                        null=True,
                        verbose_name="Prix de vente estimé (FCFA/kg)",
                    ),
                ),
                (
                    "setup_completed",
                    models.BooleanField(
                        default=False,
                        help_text="True quand l'utilisateur a terminé le flux Créer mon élevage",
                        verbose_name="Configuration élevage complétée",
                    ),
                ),
                (
                    "default_feed_price_per_kg",
                    models.DecimalField(
                        decimal_places=2,
                        default=Decimal("1250"),
                        help_text="Prix unitaire de l'aliment en FCFA par kg",
                        max_digits=8,
                        verbose_name="Prix aliment par défaut (FCFA/kg)",
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True, verbose_name="Date de création")),
                ("updated_at", models.DateTimeField(auto_now=True, verbose_name="Dernière modification")),
                (
                    "farm_profile",
                    models.OneToOneField(
                        help_text="Ferme propriétaire de ces paramètres de production",
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="production_plan",
                        to="accounts.farmprofile",
                        verbose_name="Profil de ferme",
                    ),
                ),
            ],
            options={
                "verbose_name": "Plan de production ferme",
                "verbose_name_plural": "Plans de production ferme",
                "db_table": "aquaculture_farm_production_plan",
                "ordering": ["-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="farmproductionplan",
            index=models.Index(fields=["setup_completed"], name="idx_farm_plan_completed"),
        ),
        migrations.RunPython(copy_farm_plan_data, migrations.RunPython.noop),
    ]
