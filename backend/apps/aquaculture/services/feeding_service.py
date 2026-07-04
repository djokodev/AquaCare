"""
Service métier pour la gestion des plans d'alimentation.

Ce service centralise la logique métier liée aux plans d'alimentation automatiques,
incluant la génération basée sur les guides nutritionnels et la création de notifications.

Responsabilités :
- Génération automatique de plans hebdomadaires
- Calculs quantités optimales selon biomasse
- Création notifications rappels alimentation
- Désactivation plans après récolte
"""
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from notifications.models import Notification

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
    - create_feeding_notifications() : Rappels alimentation
    """

    # Heures de repas par défaut selon nombre de repas/jour
    FEEDING_SCHEDULES = {
        1: [time(13, 0)],  # 13h
        2: [time(8, 0), time(17, 0)],  # 8h, 17h
        3: [time(8, 0), time(13, 0), time(18, 0)],  # 8h, 13h, 18h
        4: [time(7, 0), time(11, 0), time(15, 0), time(18, 0)]  # 7h, 11h, 15h, 18h
    }

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
        days_elapsed = (date.today() - cycle.start_date).days
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
            FeedingPlanService.create_feeding_notifications(existing_plan, regenerate=True)
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

        FeedingPlanService.create_feeding_notifications(plan)

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
    def _get_plan_scope_notification_target(
        plan: FeedingPlan,
    ) -> tuple[ContentType, str]:
        if plan.cycle_unit_allocation_id:
            return ContentType.objects.get_for_model(plan.cycle_unit_allocation), str(plan.cycle_unit_allocation_id)
        return ContentType.objects.get_for_model(plan.cycle), str(plan.cycle_id)

    @staticmethod
    def _get_plan_scope_name(plan: FeedingPlan) -> str:
        allocation = getattr(plan, 'cycle_unit_allocation', None)
        if allocation and allocation.production_unit:
            return allocation.production_unit.name
        return plan.cycle.cycle_name

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

        days_elapsed = (date.today() - allocation.cycle.start_date).days
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
            FeedingPlanService.create_feeding_notifications(existing_plan, regenerate=True)
            return existing_plan

        current_average_weight = FeedingPlanService._get_allocation_average_weight(allocation)
        water_temp_c, used_default_temperature = FeedingPlanService._get_allocation_temperature(allocation)

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
            current_biomass_kg=allocation.current_biomass_kg,
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

        FeedingPlanService.create_feeding_notifications(plan)

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
        Désactive tous les plans d'alimentation futurs d'un cycle et nettoie les rappels.

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

        future_plans = list(
            FeedingPlan.objects.select_related('cycle_unit_allocation__production_unit').filter(
                cycle=cycle,
                is_active=True,
                start_date__gt=date.today(),
            )
        )

        # Désactiver plans futurs
        count = len(future_plans)
        FeedingPlan.objects.filter(
            cycle=cycle,
            is_active=True,
            start_date__gt=date.today()
        ).update(is_active=False)

        # Supprimer notifications futures associées (rappels alimentation)
        now = timezone.now()
        notification_scope = Q()
        for plan in future_plans:
            content_type, object_id = FeedingPlanService._get_plan_scope_notification_target(plan)
            notification_scope |= Q(content_type=content_type, object_id=object_id)

        if notification_scope:
            Notification.objects.filter(
                notification_scope,
                notification_type='feeding_reminder',
                scheduled_for__gt=now,
            ).delete()

        FeedingPlanService.log_operation(
            "future_plans_deactivated",
            {"cycle_id": str(cycle.id), "count": count},
            level='info'
        )

        return count

    @staticmethod
    @transaction.atomic
    def create_feeding_notifications(
        plan: FeedingPlan,
        regenerate: bool = False
    ) -> int:
        """
        Crée des notifications de rappel d'alimentation pour un plan.

        Stratégie :
        - Double rappel : 30min avant + 15min avant
        - Skip dates passées
        - Skip heures passées si aujourd'hui
        - Suppression anciennes notifications si regenerate=True
        - Batch insert via bulk_create (au lieu de N appels individuels)

        Args:
            plan: Plan d'alimentation
            regenerate: Supprimer et recréer toutes les notifications

        Returns:
            Nombre de notifications créées
        """
        FeedingPlanService.log_operation(
            "create_feeding_notifications",
            {"plan_id": str(plan.id), "regenerate": regenerate}
        )

        # Pre-load content type and user preferences once (not per notification)
        content_type, object_id = FeedingPlanService._get_plan_scope_notification_target(plan)
        user = plan.cycle.farm_profile.user

        # Supprimer anciennes notifications si régénération
        if regenerate:
            Notification.objects.filter(
                content_type=content_type,
                object_id=object_id,
                notification_type='feeding_reminder'
            ).delete()

        # Check user preferences once
        from notifications.models import NotificationPreference
        prefs, _created = NotificationPreference.objects.get_or_create(user=user)
        if not prefs.is_type_enabled('feeding_reminder'):
            return 0

        channels = ['in_app']
        if not prefs.in_app_enabled:
            return 0

        # Obtenir heures de repas
        feeding_times = FeedingPlanService.FEEDING_SCHEDULES.get(
            plan.meals_per_day,
            FeedingPlanService.FEEDING_SCHEDULES[2]  # Default 2 repas
        )

        now = timezone.now()
        notifications_to_create = []

        for day_offset in range(7):
            notification_date = plan.start_date + timedelta(days=day_offset)

            if notification_date < date.today():
                continue

            daily_feeding_times = feeding_times
            if notification_date == date.today():
                current_time = now.time()
                daily_feeding_times = [
                    ft for ft in feeding_times
                    if ft >= current_time.replace(second=0, microsecond=0)
                ]

            if not daily_feeding_times:
                continue

            for meal_index, meal_time in enumerate(daily_feeding_times):
                meal_names = ['matin', 'midi', 'soir', 'nuit']
                meal_name = meal_names[meal_index] if meal_index < len(meal_names) else f'repas {meal_index + 1}'
                scope_name = FeedingPlanService._get_plan_scope_name(plan)

                base_metadata = {
                    'cycle_id': str(plan.cycle.id),
                    'cycle_unit_allocation_id': (
                        str(plan.cycle_unit_allocation_id) if plan.cycle_unit_allocation_id else None
                    ),
                    'production_unit_id': (
                        str(plan.cycle_unit_allocation.production_unit_id)
                        if plan.cycle_unit_allocation and plan.cycle_unit_allocation.production_unit_id
                        else None
                    ),
                    'production_unit_name': (
                        plan.cycle_unit_allocation.production_unit.name
                        if plan.cycle_unit_allocation and plan.cycle_unit_allocation.production_unit
                        else None
                    ),
                    'plan_id': str(plan.id),
                    'meal': meal_name,
                }

                notification_30min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=30)

                if notification_30min > now:
                    notifications_to_create.append(Notification(
                        user=user,
                        notification_type='feeding_reminder',
                        title=_('Nourrissage %(scope_name)s dans 30min') % {
                            'scope_name': scope_name
                        },
                        message=_("Préparez %(amount).1f kg d'aliment pour %(scope_name)s.") % {
                            'amount': plan.feed_per_meal,
                            'scope_name': scope_name
                        },
                        content_type=content_type,
                        object_id=object_id,
                        metadata={**base_metadata, 'minutes_before': 30},
                        channels=list(channels),
                        priority='medium',
                        scheduled_for=notification_30min,
                    ))

                notification_15min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=15)

                if notification_15min > now:
                    notifications_to_create.append(Notification(
                        user=user,
                        notification_type='feeding_reminder',
                        title=_('Nourrissage %(scope_name)s dans 15min') % {
                            'scope_name': scope_name
                        },
                        message=_("Donnez %(amount).1f kg d'aliment maintenant pour %(scope_name)s.") % {
                            'amount': plan.feed_per_meal,
                            'scope_name': scope_name
                        },
                        content_type=content_type,
                        object_id=object_id,
                        metadata={**base_metadata, 'minutes_before': 15},
                        channels=list(channels),
                        priority='medium',
                        scheduled_for=notification_15min,
                    ))

        # Batch insert all notifications at once
        if notifications_to_create:
            Notification.objects.bulk_create(notifications_to_create, batch_size=100)

        notifications_created = len(notifications_to_create)
        FeedingPlanService.log_operation(
            "notifications_created",
            {"plan_id": str(plan.id), "count": notifications_created},
            level='info'
        )

        return notifications_created
