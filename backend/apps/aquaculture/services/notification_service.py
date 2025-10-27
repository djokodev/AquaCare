"""
Service de gestion des notifications intelligentes pour l'aquaculture.

Centralise toute la logique de création, programmation et gestion
des notifications système (rappels alimentation, alertes sanitaires, etc.).

Architecture:
    - Extraction de la logique de notifications de views.py et signals.py
    - Gestion intelligente des horaires et rappels
    - Support notifications récurrentes et programmées
    - Réutilisable pour API, tâches Celery, webhooks, etc.

Author: MAVECAM AquaCare Team
"""
from typing import List, Optional
from datetime import datetime, date, time, timedelta
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from ..models import FeedingPlan, ProductionCycle, Notification
from .base import BaseService


class NotificationService(BaseService):
    """
    Service de notifications pour rappels et alertes aquaculture.

    Responsabilités:
        - Création de notifications programmées
        - Rappels d'alimentation intelligents (double rappel)
        - Alertes sanitaires automatiques
        - Alertes de performance (mortalité, croissance)
        - Rappels d'échantillonnage hebdomadaire
        - Gestion des horaires optimaux

    Utilisé par:
        - FeedingPlanViewSet.generate()
        - Signals (sanitary alerts, mortality alerts)
        - Tâches périodiques Celery (si implémenté)
    """

    # ============================================================================
    # HORAIRES D'ALIMENTATION
    # ============================================================================

    FEEDING_SCHEDULES = {
        1: [time(13, 0)],                                      # 13h
        2: [time(8, 0), time(17, 0)],                         # 8h, 17h
        3: [time(8, 0), time(13, 0), time(18, 0)],            # 8h, 13h, 18h
        4: [time(7, 0), time(11, 0), time(15, 0), time(18, 0)]  # 7h, 11h, 15h, 18h
    }

    MEAL_NAMES = ['matin', 'midi', 'soir', 'nuit']

    # ============================================================================
    # RAPPELS D'ALIMENTATION
    # ============================================================================

    @staticmethod
    def create_feeding_reminders(
        plan: FeedingPlan,
        regenerate: bool = False
    ) -> int:
        """
        Crée des notifications de rappel d'alimentation intelligentes avec double rappel.

        Génère:
            - Notification 30 minutes avant chaque repas
            - Notification 15 minutes avant chaque repas
            - Skip les repas passés
            - Adapte horaires selon nombre de repas par jour

        Args:
            plan: Plan d'alimentation pour lequel créer les notifications
            regenerate: Si True, supprime les anciennes notifications avant création

        Returns:
            int: Nombre de notifications créées

        Example:
            >>> count = NotificationService.create_feeding_reminders(plan)
            >>> print(f"{count} notifications créées")
        """
        if regenerate:
            # Supprimer TOUTES les anciennes notifications de feeding pour ce cycle
            Notification.objects.filter(
                cycle=plan.cycle,
                notification_type='feeding_reminder'
            ).delete()

        # Définir les heures de repas selon le nombre de repas par jour
        feeding_times = NotificationService._get_feeding_times(plan.meals_per_day)

        notifications_created = 0

        for day in range(7):
            notification_date = plan.start_date + timedelta(days=day)

            # Skip past dates
            if notification_date < date.today():
                continue

            # Skip if today and meal time already passed
            daily_feeding_times = feeding_times
            if notification_date == date.today():
                current_time = timezone.now().time()
                daily_feeding_times = [
                    ft for ft in feeding_times
                    if ft >= current_time.replace(second=0, microsecond=0)
                ]

            # Skip this day if no meals remaining
            if not daily_feeding_times:
                continue

            # Créer les notifications pour chaque repas
            for meal_index, meal_time in enumerate(daily_feeding_times):
                meal_name = NotificationService.MEAL_NAMES[meal_index] if meal_index < len(NotificationService.MEAL_NAMES) else f'repas {meal_index + 1}'

                # Notification 30 minutes avant
                notification_30min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=30)

                if notification_30min > timezone.now():
                    Notification.objects.create(
                        user=plan.cycle.farm_profile.user,
                        cycle=plan.cycle,
                        notification_type='feeding_reminder',
                        title=str(_('Nourrissage dans 30min - %(cycle_name)s') % {'cycle_name': plan.cycle.cycle_name}),
                        message=str(_('Préparez %(amount).1f kg d\'aliment pour le %(meal)s') % {
                            'amount': plan.feed_per_meal,
                            'meal': meal_name
                        }),
                        scheduled_for=notification_30min
                    )
                    notifications_created += 1

                # Notification 15 minutes avant
                notification_15min = timezone.make_aware(
                    datetime.combine(notification_date, meal_time)
                ) - timedelta(minutes=15)

                if notification_15min > timezone.now():
                    Notification.objects.create(
                        user=plan.cycle.farm_profile.user,
                        cycle=plan.cycle,
                        notification_type='feeding_reminder',
                        title=str(_('Nourrissage dans 15min - %(cycle_name)s') % {'cycle_name': plan.cycle.cycle_name}),
                        message=str(_('Donnez %(amount).1f kg d\'aliment maintenant (%(meal)s)') % {
                            'amount': plan.feed_per_meal,
                            'meal': meal_name
                        }),
                        scheduled_for=notification_15min
                    )
                    notifications_created += 1

        NotificationService.log_operation(
            'create_feeding_reminders',
            {
                'plan_id': str(plan.id),
                'cycle_id': str(plan.cycle.id),
                'notifications_created': notifications_created,
                'regenerate': regenerate
            }
        )

        return notifications_created

    @staticmethod
    def _get_feeding_times(meals_per_day: int) -> List[time]:
        """
        Retourne les heures de repas optimales selon le nombre de repas par jour.

        Args:
            meals_per_day: Nombre de repas (1-4)

        Returns:
            List[time]: Liste des horaires optimaux
        """
        return NotificationService.FEEDING_SCHEDULES.get(
            meals_per_day,
            NotificationService.FEEDING_SCHEDULES[2]  # Default à 2 repas
        )

    # ============================================================================
    # ALERTES SANITAIRES
    # ============================================================================

    @staticmethod
    def create_sanitary_alert(
        cycle: ProductionCycle,
        event_type: str,
        message: str,
        severity: str = 'warning'
    ) -> Notification:
        """
        Crée une alerte sanitaire critique pour un cycle.

        Args:
            cycle: Cycle concerné
            event_type: Type d'événement sanitaire
            message: Message de l'alerte
            severity: Gravité ('info', 'warning', 'critical')

        Returns:
            Notification: Notification créée

        Example:
            >>> NotificationService.create_sanitary_alert(
            ...     cycle,
            ...     'disease',
            ...     'Symptômes de maladie détectés',
            ...     severity='critical'
            ... )
        """
        # Map severity to emoji icons
        icons = {
            'info': '📋',
            'warning': '⚠️',
            'critical': '🚨'
        }

        notification = Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='sanitary_alert',
            title=f"{icons.get(severity, '⚠️')} {str(_('Alerte sanitaire'))} - {cycle.cycle_name}",
            message=message,
            scheduled_for=timezone.now()
        )

        NotificationService.log_operation(
            'create_sanitary_alert',
            {
                'cycle_id': str(cycle.id),
                'event_type': event_type,
                'severity': severity
            },
            level='warning' if severity == 'critical' else 'info'
        )

        return notification

    # ============================================================================
    # ALERTES DE PERFORMANCE
    # ============================================================================

    @staticmethod
    def create_mortality_alert(
        cycle: ProductionCycle,
        mortality_count: int,
        mortality_rate: float
    ) -> Optional[Notification]:
        """
        Crée une alerte si mortalité anormale détectée (>2% en un jour).

        Args:
            cycle: Cycle concerné
            mortality_count: Nombre de morts du jour
            mortality_rate: Taux de mortalité quotidien (%)

        Returns:
            Notification or None: Notification si alerte créée

        Example:
            >>> NotificationService.create_mortality_alert(cycle, 150, 3.5)
        """
        if mortality_rate <= 2.0:
            return None  # Mortalité normale

        severity = 'critical' if mortality_rate > 5.0 else 'warning'
        message = str(_(
            'Mortalité anormale détectée : %(count)d morts (%(rate).1f%%). '
            'Vérifier la qualité de l\'eau et l\'état sanitaire.'
        ) % {
            'count': mortality_count,
            'rate': mortality_rate
        })

        return NotificationService.create_sanitary_alert(
            cycle=cycle,
            event_type='high_mortality',
            message=message,
            severity=severity
        )

    @staticmethod
    def create_growth_alert(
        cycle: ProductionCycle,
        metric_type: str,
        current_value: float,
        threshold: float,
        message: Optional[str] = None
    ) -> Notification:
        """
        Crée une alerte de performance (croissance, FCR, etc.).

        Args:
            cycle: Cycle concerné
            metric_type: Type de métrique ('fcr', 'growth_rate', 'survival_rate')
            current_value: Valeur actuelle
            threshold: Seuil de référence
            message: Message personnalisé (optionnel)

        Returns:
            Notification: Notification créée

        Example:
            >>> NotificationService.create_growth_alert(
            ...     cycle,
            ...     'fcr',
            ...     3.5,
            ...     2.0,
            ...     'FCR élevé, optimiser alimentation'
            ... )
        """
        if message is None:
            message = str(_(
                'Métrique %(metric)s hors limites : %(current).2f (seuil: %(threshold).2f)'
            ) % {
                'metric': metric_type,
                'current': current_value,
                'threshold': threshold
            })

        notification = Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='growth_alert',
            title=f"📊 {str(_('Alerte performance'))} - {cycle.cycle_name}",
            message=message,
            scheduled_for=timezone.now()
        )

        NotificationService.log_operation(
            'create_growth_alert',
            {
                'cycle_id': str(cycle.id),
                'metric_type': metric_type,
                'current_value': current_value,
                'threshold': threshold
            }
        )

        return notification

    # ============================================================================
    # RAPPELS D'ÉCHANTILLONNAGE
    # ============================================================================

    @staticmethod
    def create_sampling_reminder(
        cycle: ProductionCycle,
        next_sampling_date: date
    ) -> Notification:
        """
        Crée un rappel d'échantillonnage hebdomadaire.

        Args:
            cycle: Cycle concerné
            next_sampling_date: Date du prochain échantillonnage

        Returns:
            Notification: Notification créée

        Example:
            >>> next_date = date.today() + timedelta(days=7)
            >>> NotificationService.create_sampling_reminder(cycle, next_date)
        """
        # Schedule notification for 9AM on sampling date
        scheduled_time = timezone.make_aware(
            datetime.combine(next_sampling_date, time(9, 0))
        )

        notification = Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='system_update',
            title=f"📏 {str(_('Échantillonnage hebdomadaire'))} - {cycle.cycle_name}",
            message=str(_(
                'Effectuer l\'échantillonnage des poissons pour suivre la croissance. '
                'Pesez au moins 20 individus pour un résultat représentatif.'
            )),
            scheduled_for=scheduled_time
        )

        NotificationService.log_operation(
            'create_sampling_reminder',
            {
                'cycle_id': str(cycle.id),
                'sampling_date': next_sampling_date.isoformat()
            }
        )

        return notification

    # ============================================================================
    # NOTIFICATIONS SYSTÈME
    # ============================================================================

    @staticmethod
    def create_cycle_completion_notification(
        cycle: ProductionCycle
    ) -> Notification:
        """
        Crée une notification de félicitations après récolte réussie.

        Args:
            cycle: Cycle récolté

        Returns:
            Notification: Notification créée
        """
        message = str(_(
            'Félicitations ! Cycle %(name)s récolté avec succès. '
            'Taux de survie: %(survival).1f%%, FCR: %(fcr).2f'
        ) % {
            'name': cycle.cycle_name,
            'survival': float(cycle.survival_rate or 0),
            'fcr': float(cycle.fcr or 0)
        })

        notification = Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='system_update',
            title=f"🎉 {str(_('Cycle terminé'))} - {cycle.cycle_name}",
            message=message,
            scheduled_for=timezone.now()
        )

        NotificationService.log_operation(
            'create_cycle_completion_notification',
            {'cycle_id': str(cycle.id)}
        )

        return notification

    @staticmethod
    def create_next_cycle_recommendation(
        cycle: ProductionCycle,
        recommendations: List[str]
    ) -> Notification:
        """
        Crée une notification avec recommandations pour le prochain cycle.

        Args:
            cycle: Cycle terminé
            recommendations: Liste de recommandations

        Returns:
            Notification: Notification créée
        """
        recommendations_text = '\n'.join(f"• {rec}" for rec in recommendations)

        message = str(_(
            'Recommandations pour votre prochain cycle basées sur %(name)s :\n\n%(recs)s'
        ) % {
            'name': cycle.cycle_name,
            'recs': recommendations_text
        })

        notification = Notification.objects.create(
            user=cycle.farm_profile.user,
            cycle=cycle,
            notification_type='system_update',
            title=f"💡 {str(_('Recommandations'))} - Prochain cycle",
            message=message,
            scheduled_for=timezone.now()
        )

        NotificationService.log_operation(
            'create_next_cycle_recommendation',
            {
                'cycle_id': str(cycle.id),
                'recommendations_count': len(recommendations)
            }
        )

        return notification

    # ============================================================================
    # GESTION INTELLIGENTE RAPPELS D'ÉCHANTILLONNAGE
    # ============================================================================

    @staticmethod
    def check_and_create_sampling_reminders(cycle: ProductionCycle, last_log) -> None:
        """
        Vérifie si un rappel d'échantillonnage est nécessaire et le crée.

        Logique:
            - Vérifie si le dernier échantillonnage date de plus de 7 jours
            - Crée un rappel pour J+7 si aucune pesée dans le log actuel
            - Évite les doublons en vérifiant les rappels existants
            - Planifie uniquement pour des dates futures

        Args:
            cycle: Cycle concerné
            last_log: Dernier log quotidien créé

        Note:
            Appelé automatiquement par signals après création d'un CycleLog
        """
        # Check if last sampling was more than a week ago
        last_sampling = cycle.logs.filter(
            average_weight__isnull=False
        ).exclude(id=last_log.id).order_by('-log_date').first()

        if last_sampling:
            days_since_sampling = (last_log.log_date - last_sampling.log_date).days
        else:
            days_since_sampling = (last_log.log_date - cycle.start_date).days

        # If no sampling in the last 7 days and no weight data in current log
        if days_since_sampling >= 7 and not last_log.average_weight:
            next_sampling_date = last_log.log_date + timedelta(days=7)

            # Only create if date is in the future
            if next_sampling_date > date.today():
                # Check if reminder already exists
                existing_reminder = Notification.objects.filter(
                    cycle=cycle,
                    notification_type='system_update',
                    scheduled_for__date=next_sampling_date,
                    is_sent=False
                ).exists()

                if not existing_reminder:
                    NotificationService.create_sampling_reminder(cycle, next_sampling_date)
