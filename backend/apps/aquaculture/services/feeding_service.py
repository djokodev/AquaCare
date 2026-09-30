"""
Service métier pour la gestion des plans d'alimentation.

Ce service centralise la logique métier liée aux plans d'alimentation automatiques,
incluant la génération basée sur les guides nutritionnels.
Les rappels de nourrissage sont des alarmes locales gérées par l'application mobile.

Responsabilités :
- Génération automatique de plans hebdomadaires
- Calculs quantités optimales selon biomasse
- Désactivation plans après récolte
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..domain.calculators import AquacultureCalculator
from ..domain.exceptions import FeedingPlanGenerationError
from ..models import CycleLog, CycleUnitAllocation, FeedingPlan, NutritionalGuide, ProductionCycle
from .base import BaseService


class FeedingPlanService(BaseService):
    """
    Service métier pour la gestion des plans d'alimentation.

    Points d'entrée principaux :
    - generate_weekly_plans() : Génération automatique multi-semaines
    - generate_plan_for_week() : Génération plan semaine spécifique
    - deactivate_future_plans() : Désactivation après récolte
    """

    @staticmethod
    @transaction.atomic
    def generate_weekly_plans(
        cycle: ProductionCycle,
        weeks_ahead: int = 4,
        auto_adjust: bool = True
    ) -> list[FeedingPlan]:
        """
        Génère des plans d'alimentation pour les N prochaines semaines.

        Processus :
        1. Calcul semaine actuelle du cycle
        2. Génération plan pour chaque semaine
        3. Création notifications rappels
        4. Retour liste des plans créés

        Args:
            cycle: Cycle de production
            weeks_ahead: Nombre de semaines à générer (défaut: 4)
            auto_adjust: Ajuster selon poids réel si logs disponibles

        Returns:
            Liste de FeedingPlan créés

        Raises:
            FeedingPlanGenerationError: Si génération impossible
        """
        FeedingPlanService.log_operation(
            "generate_weekly_plans",
            {"cycle_id": str(cycle.id), "weeks_ahead": weeks_ahead}
        )

        if cycle.status != 'active':
            raise FeedingPlanGenerationError(
                _("Impossible de générer des plans pour un cycle non actif")
            )

        # Calcul semaine actuelle
        days_elapsed = (timezone.localdate() - cycle.analysis_start_date).days
        current_week = max(1, days_elapsed // 7 + 1)

        plans = []
        for week_offset in range(weeks_ahead):
            week_number = current_week + week_offset

            try:
                plan = FeedingPlanService.generate_plan_for_week(
                    cycle=cycle,
                    week_number=week_number,
                    auto_adjust=auto_adjust
                )
                plans.append(plan)

            except Exception as e:
                FeedingPlanService.log_operation(
                    "plan_generation_error",
                    {"cycle_id": str(cycle.id), "week": week_number, "error": str(e)},
                    level='error'
                )
                # Continue avec les autres semaines

        FeedingPlanService.log_operation(
            "weekly_plans_generated",
            {"cycle_id": str(cycle.id), "plans_created": len(plans)},
            level='info'
        )

        return plans

    @staticmethod
    @transaction.atomic
    def generate_plan_for_week(
        cycle: ProductionCycle,
        week_number: int,
        auto_adjust: bool = True
    ) -> FeedingPlan:
        """
        Génère un plan d'alimentation pour une semaine spécifique.

        Utilise :
        - Tables DIBAQ officielles (NutritionalGuide) comme source principale
        - Dernière température d'eau enregistrée dans les saisies journalières (CycleLog)
        - Fallback 26°C si aucune saisie disponible
        - Fallback constantes internes si NutritionalGuide absent

        Args:
            cycle: Cycle de production
            week_number: Numéro de semaine depuis début cycle
            auto_adjust: Paramètre conservé pour compatibilité (non utilisé)

        Returns:
            FeedingPlan créé ou existant (idempotent)

        Raises:
            FeedingPlanGenerationError: Si génération impossible
        """
        FeedingPlanService.log_operation(
            "generate_plan_for_week",
            {"cycle_id": str(cycle.id), "week": week_number}
        )

        # Vérifier si plan existe déjà
        existing_plan = FeedingPlan.objects.filter(
            cycle=cycle,
            week_number=week_number
        ).first()

        if existing_plan:
            return existing_plan

        # 1. Chercher le guide DIBAQ pour l'espèce et le poids actuel
        # On filtre explicitement sur source='DIBAQ' pour ignorer les anciennes entrées AquaCare
        guide = NutritionalGuide.objects.filter(
            species=cycle.species,
            source='DIBAQ',
            min_weight__lte=cycle.current_average_weight,
            max_weight__gte=cycle.current_average_weight
        ).order_by('min_weight').first()

        guide_data = None
        data_source = 'fallback_interne'

        if guide:
            guide_data = {
                'feed_size_mm': guide.feed_size_mm,
                'protein_requirement': guide.protein_requirement,
                'feeding_rate_percentage': guide.feeding_rate_percentage,
                'meals_per_day': guide.meals_per_day,
                'temperature_rates': guide.temperature_rates,
                'recommended_products': guide.recommended_products,
                'source': guide.source,
            }
            data_source = guide.source
        else:
            FeedingPlanService.log_operation(
                "no_nutritional_guide_found",
                {
                    "species": cycle.species,
                    "weight_g": float(cycle.current_average_weight),
                },
                level='warning'
            )

        # 2. Chercher la dernière température d'eau enregistrée pour ce cycle
        last_log_with_temp = CycleLog.objects.filter(
            cycle=cycle,
            water_temperature__isnull=False,
        ).order_by('-log_date').first()

        used_default_temperature = False
        if last_log_with_temp:
            water_temp_c = float(last_log_with_temp.water_temperature)
        else:
            water_temp_c = 26.0  # Référence tropicale Cameroun
            used_default_temperature = True
            FeedingPlanService.log_operation(
                "no_temperature_recorded",
                {"cycle_id": str(cycle.id), "default_temp_c": water_temp_c},
                level='info'
            )

        # 3. Calculer le plan avec les données officielles
        plan_data = AquacultureCalculator.calculate_weekly_feeding_plan(
            current_biomass_kg=cycle.current_biomass,
            current_weight_g=cycle.current_average_weight,
            current_count=cycle.current_count,
            species=cycle.species,
            week_number=week_number,
            guide_data=guide_data,
            water_temp_c=water_temp_c,
        )

        # 4. Calcul des dates de la semaine
        start_date = cycle.start_date + timedelta(weeks=week_number - 1)
        end_date = start_date + timedelta(days=6)

        # 5. Création du plan en base
        plan = FeedingPlan.objects.create(
            cycle=cycle,
            week_number=week_number,
            start_date=start_date,
            end_date=end_date,
            estimated_fish_count=plan_data['estimated_fish_count'],
            average_weight=plan_data['average_weight'],
            biomass=plan_data['biomass'],
            daily_feed_amount=plan_data['daily_feed_amount'],
            feeding_rate=plan_data['feeding_rate'],
            meals_per_day=plan_data['meals_per_day'],
            feed_per_meal=plan_data['feed_per_meal'],
            recommended_feed_type=plan_data['recommended_feed_type'],
            feed_size_mm=plan_data['feed_size_mm'],
            protein_percentage=plan_data['protein_percentage'],
            temperature_used_c=round(water_temp_c, 1),
            used_default_temperature=used_default_temperature,
            data_source=data_source,
            is_active=True,
        )

        FeedingPlanService.log_operation(
            "plan_created",
            {
                "plan_id": str(plan.id),
                "week": week_number,
                "daily_feed_kg": float(plan.daily_feed_amount),
                "temperature_c": water_temp_c,
                "used_default_temp": used_default_temperature,
                "source": data_source,
            },
            level='info'
        )

        return plan

    @staticmethod
    def _get_allocation_average_weight(allocation: CycleUnitAllocation) -> Decimal:
        unit_logs_exist = CycleLog.objects.filter(
            cycle=allocation.cycle,
            cycle_unit_allocation__isnull=False,
        ).exists()

        latest_log_with_weight = CycleLog.objects.filter(
            cycle=allocation.cycle,
            cycle_unit_allocation=allocation,
            average_weight__isnull=False,
        ).order_by('-log_date', '-log_time', '-created_at').first()

        if latest_log_with_weight and latest_log_with_weight.average_weight is not None:
            return Decimal(str(latest_log_with_weight.average_weight))

        if allocation.current_fish_count and allocation.current_biomass_kg:
            if allocation.current_fish_count > 0:
                estimated_weight = (
                    Decimal(str(allocation.current_biomass_kg))
                    / Decimal(str(allocation.current_fish_count))
                    * Decimal('1000')
                )
                return estimated_weight.quantize(Decimal('0.01'))

        if unit_logs_exist:
            return Decimal('0')

        cycle_average_weight = getattr(allocation.cycle, 'current_average_weight', None)
        if cycle_average_weight is not None:
            return Decimal(str(cycle_average_weight))

        return Decimal('0')

    @staticmethod
    def _get_allocation_temperature(allocation: CycleUnitAllocation) -> tuple[Decimal, bool]:
        latest_log_with_temp = CycleLog.objects.filter(
            cycle=allocation.cycle,
            cycle_unit_allocation=allocation,
            water_temperature__isnull=False,
        ).order_by('-log_date', '-log_time', '-created_at').first()

        if latest_log_with_temp and latest_log_with_temp.water_temperature is not None:
            return Decimal(str(latest_log_with_temp.water_temperature)).quantize(Decimal('0.1')), False

        return Decimal('26.0'), True

    @staticmethod
    @transaction.atomic
    def generate_weekly_plans_for_allocation(
        allocation: CycleUnitAllocation,
        weeks_ahead: int = 4,
        auto_adjust: bool = True,
    ) -> list[FeedingPlan]:
        """Génère les plans d'alimentation pour les semaines à venir d'une allocation."""
        FeedingPlanService.log_operation(
            "generate_weekly_plans_for_allocation",
            {
                "cycle_id": str(allocation.cycle_id),
                "cycle_unit_allocation_id": str(allocation.id),
                "weeks_ahead": weeks_ahead,
            },
        )

        if allocation.cycle.status != 'active':
            raise FeedingPlanGenerationError(
                _("Impossible de générer des plans pour un cycle non actif")
            )

        days_elapsed = (
            timezone.localdate() - allocation.cycle.analysis_start_date
        ).days
        current_week = max(1, days_elapsed // 7 + 1)

        plans = []
        for week_offset in range(weeks_ahead):
            week_number = current_week + week_offset

            try:
                plan = FeedingPlanService.generate_plan_for_allocation_week(
                    allocation=allocation,
                    week_number=week_number,
                    auto_adjust=auto_adjust,
                )
                plans.append(plan)
            except Exception as exc:
                FeedingPlanService.log_operation(
                    "allocation_plan_generation_error",
                    {
                        "cycle_id": str(allocation.cycle_id),
                        "cycle_unit_allocation_id": str(allocation.id),
                        "week": week_number,
                        "error": str(exc),
                    },
                    level='error',
                )

        if weeks_ahead == 1:
            FeedingPlanService.deactivate_future_plans_for_allocation(allocation)

        FeedingPlanService.log_operation(
            "allocation_weekly_plans_generated",
            {
                "cycle_id": str(allocation.cycle_id),
                "cycle_unit_allocation_id": str(allocation.id),
                "plans_created": len(plans),
            },
            level='info',
        )

        return plans

    @staticmethod
    @transaction.atomic
    def deactivate_future_plans_for_allocation(allocation: CycleUnitAllocation) -> int:
        """
        Désactive les plans futurs actifs d'une allocation d'unité.

        Utilisé quand l'utilisateur régénère uniquement le plan de la semaine en cours
        pour éviter d'afficher ou d'alimenter des semaines futures héritées.
        """
        days_elapsed = (
            timezone.localdate() - allocation.cycle.analysis_start_date
        ).days
        current_week = max(1, days_elapsed // 7 + 1)

        count = FeedingPlan.objects.filter(
            cycle=allocation.cycle,
            cycle_unit_allocation=allocation,
            is_active=True,
            week_number__gt=current_week,
        ).update(is_active=False)

        FeedingPlanService.log_operation(
            "future_allocation_plans_deactivated",
            {
                "cycle_id": str(allocation.cycle_id),
                "cycle_unit_allocation_id": str(allocation.id),
                "current_week": current_week,
                "count": count,
            },
            level='info',
        )

        return count

    @staticmethod
    @transaction.atomic
    def generate_plan_for_allocation_week(
        allocation: CycleUnitAllocation,
        week_number: int,
        auto_adjust: bool = True,
    ) -> FeedingPlan:
        """Génère un plan d'alimentation pour une semaine d'allocation spécifique."""
        if allocation.cycle.status != 'active':
            raise FeedingPlanGenerationError(
                _("Impossible de générer des plans pour un cycle non actif")
            )

        FeedingPlanService.log_operation(
            "generate_plan_for_allocation_week",
            {
                "cycle_id": str(allocation.cycle_id),
                "cycle_unit_allocation_id": str(allocation.id),
                "week": week_number,
            },
        )

        existing_plan = FeedingPlan.objects.filter(
            cycle=allocation.cycle,
            cycle_unit_allocation=allocation,
            week_number=week_number,
        ).first()
        if existing_plan:
            return existing_plan

        current_average_weight = FeedingPlanService._get_allocation_average_weight(allocation)
        water_temp_c, used_default_temperature = FeedingPlanService._get_allocation_temperature(allocation)
        effective_biomass_kg = Decimal(str(allocation.current_biomass_kg or 0))
        if effective_biomass_kg <= 0 and allocation.current_fish_count and allocation.current_fish_count > 0:
            if current_average_weight > 0:
                effective_biomass_kg = AquacultureCalculator.calculate_biomass(
                    allocation.current_fish_count,
                    current_average_weight,
                )

        guide = NutritionalGuide.objects.filter(
            species=allocation.cycle.species,
            source='DIBAQ',
            min_weight__lte=current_average_weight,
            max_weight__gte=current_average_weight,
        ).order_by('min_weight').first()

        guide_data = None
        data_source = 'fallback_interne'
        if guide:
            guide_data = {
                'feed_size_mm': guide.feed_size_mm,
                'protein_requirement': guide.protein_requirement,
                'feeding_rate_percentage': guide.feeding_rate_percentage,
                'meals_per_day': guide.meals_per_day,
                'temperature_rates': guide.temperature_rates,
                'recommended_products': guide.recommended_products,
                'source': guide.source,
            }
            data_source = guide.source

        plan_data = AquacultureCalculator.calculate_weekly_feeding_plan(
            current_biomass_kg=effective_biomass_kg,
            current_weight_g=current_average_weight,
            current_count=allocation.current_fish_count,
            species=allocation.cycle.species,
            week_number=week_number,
            guide_data=guide_data,
            water_temp_c=float(water_temp_c),
        )

        start_date = allocation.cycle.start_date + timedelta(weeks=week_number - 1)
        end_date = start_date + timedelta(days=6)

        plan = FeedingPlan.objects.create(
            cycle=allocation.cycle,
            cycle_unit_allocation=allocation,
            week_number=week_number,
            start_date=start_date,
            end_date=end_date,
            estimated_fish_count=plan_data['estimated_fish_count'],
            average_weight=plan_data['average_weight'],
            biomass=plan_data['biomass'],
            daily_feed_amount=plan_data['daily_feed_amount'],
            feeding_rate=plan_data['feeding_rate'],
            meals_per_day=plan_data['meals_per_day'],
            feed_per_meal=plan_data['feed_per_meal'],
            recommended_feed_type=plan_data['recommended_feed_type'],
            feed_size_mm=plan_data['feed_size_mm'],
            protein_percentage=plan_data['protein_percentage'],
            temperature_used_c=water_temp_c,
            used_default_temperature=used_default_temperature,
            data_source=data_source,
            is_active=True,
        )

        FeedingPlanService.log_operation(
            "allocation_plan_created",
            {
                "plan_id": str(plan.id),
                "cycle_id": str(allocation.cycle_id),
                "cycle_unit_allocation_id": str(allocation.id),
                "week": week_number,
                "daily_feed_kg": float(plan.daily_feed_amount),
                "temperature_c": float(water_temp_c),
                "used_default_temp": used_default_temperature,
                "source": data_source,
            },
            level='info',
        )

        return plan

    @staticmethod
    @transaction.atomic
    def deactivate_future_plans(cycle: ProductionCycle) -> int:
        """
        Désactive tous les plans d'alimentation futurs d'un cycle.

        Utilisé après :
        - Récolte du cycle
        - Arrêt anticipé du cycle

        Args:
            cycle: Cycle concerné

        Returns:
            Nombre de plans désactivés
        """
        FeedingPlanService.log_operation(
            "deactivate_future_plans",
            {"cycle_id": str(cycle.id)}
        )

        count = FeedingPlan.objects.filter(
            cycle=cycle,
            is_active=True,
            start_date__gt=timezone.localdate()
        ).update(is_active=False)

        FeedingPlanService.log_operation(
            "future_plans_deactivated",
            {"cycle_id": str(cycle.id), "count": count},
            level='info'
        )

        return count
