"""
Service de gestion du journal sanitaire pour AquaCare.

Centralise toute la logique métier liée aux événements sanitaires :
- Création et résolution de problèmes sanitaires
- Analyse des patterns de morbidité et mortalité
- Génération d'alertes automatiques
- Recommandations de prévention et traitement
- Suivi épidémiologique des cycles

Architecture: Service Layer Pattern avec responsabilité unique.
"""
from datetime import date, timedelta
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from notifications.services import NotificationService

from ..domain.exceptions import (
    CycleNotFoundException,
    InvalidSanitaryDataException,
    OfflineSyncConflictError,
    SanitaryLogNotFoundException,
)
from ..models import ProductionCycle, SanitaryLog

# Notification model moved to apps/notifications/models.py
# Will be migrated to use NotificationService in Phase 1B
from .base import BaseService


@dataclass(frozen=True)
class SanitaryLogMutationResult:
    """Résultat de mutation pour création sanitaire idempotente."""

    log: SanitaryLog
    created: bool


class SanitaryService(BaseService):
    """
    Service de gestion sanitaire avec analyse épidémiologique.

    Responsabilités :
    - Création/résolution de logs sanitaires avec validation métier
    - Analyse patterns sanitaires et tendances épidémiologiques
    - Génération automatique d'alertes selon gravité
    - Recommandations préventives et curatives
    - Groupement et statistiques par cycle
    """

    # Mapping de gravité par type d'événement
    SEVERITY_MAP = {
        'disease': 'critical',
        'abnormal_mortality': 'critical',
        'water_quality': 'warning',
        'treatment': 'info',
        'vaccination': 'info',
        'other': 'info'
    }

    # Seuils d'alerte pour analyse
    CRITICAL_AFFECTED_THRESHOLD = 0.05  # 5% de l'effectif
    WARNING_AFFECTED_THRESHOLD = 0.02   # 2% de l'effectif

    @staticmethod
    def _get_existing_log_from_client_uuid(
        *,
        cycle: ProductionCycle,
        client_uuid: str | None,
    ) -> SanitaryLog | None:
        if not client_uuid:
            return None

        existing_log = SanitaryLog.objects.select_related('cycle__farm_profile__user').filter(
            client_uuid=client_uuid,
        ).first()
        if not existing_log:
            return None

        existing_user_id = existing_log.cycle.farm_profile.user_id
        current_user_id = cycle.farm_profile.user_id
        if existing_user_id != current_user_id:
            raise OfflineSyncConflictError(
                _("Conflit de synchronisation : ce client_uuid appartient à un autre utilisateur.")
            )
        if existing_log.cycle_id != cycle.id:
            raise OfflineSyncConflictError(
                _("Conflit de synchronisation : ce client_uuid est déjà lié à un autre cycle.")
            )
        return existing_log

    @staticmethod
    def _validate_create_sanitary_log_inputs(
        *,
        cycle: ProductionCycle,
        event_date: date,
        event_type: str,
        symptoms: str,
        affected_count: int | None,
        treatment_duration_days: int | None,
    ) -> None:
        if not cycle:
            raise CycleNotFoundException("Le cycle de production est requis")

        if not event_type:
            raise InvalidSanitaryDataException("Le type d'événement est requis")

        if not symptoms or len(symptoms.strip()) < 10:
            raise InvalidSanitaryDataException(
                "La description des symptômes doit contenir au moins 10 caractères"
            )

        if event_date > date.today():
            raise InvalidSanitaryDataException(
                "La date de l'événement ne peut pas être dans le futur"
            )

        if event_date < cycle.start_date:
            raise InvalidSanitaryDataException(
                f"La date de l'événement doit être après le début du cycle ({cycle.start_date})"
            )

        if affected_count is not None:
            if affected_count < 0:
                raise InvalidSanitaryDataException(
                    "Le nombre de poissons affectés doit être positif"
                )
            if affected_count > cycle.current_count:
                raise InvalidSanitaryDataException(
                    f"Le nombre affecté ({affected_count}) dépasse l'effectif actuel ({cycle.current_count})"
                )

        if treatment_duration_days is not None and treatment_duration_days < 0:
            raise InvalidSanitaryDataException(
                "La durée du traitement doit être positive"
            )

    @staticmethod
    @transaction.atomic
    def create_or_get_sanitary_log(
        cycle: ProductionCycle,
        event_date: date,
        event_type: str,
        symptoms: str,
        affected_count: int | None = None,
        treatment_applied: str = '',
        medication_used: str = '',
        dosage: str = '',
        treatment_duration_days: int | None = None,
        photo = None,
        notes: str = '',
        **kwargs
    ) -> SanitaryLogMutationResult:
        """
        Crée un log sanitaire avec validation métier complète.

        Args:
            cycle: Cycle de production concerné
            event_date: Date de l'événement sanitaire
            event_type: Type d'événement (disease, treatment, vaccination, etc.)
            symptoms: Description détaillée des symptômes observés
            affected_count: Nombre de poissons affectés (optionnel)
            treatment_applied: Description du traitement appliqué
            medication_used: Nom du médicament utilisé
            dosage: Dosage du médicament
            treatment_duration_days: Durée du traitement en jours
            photo: Photo de l'événement (optionnel)
            notes: Notes additionnelles
            **kwargs: Autres champs (created_offline, client_uuid, etc.)

        Returns:
            SanitaryLogMutationResult: Log sanitaire et indicateur de création

        Raises:
            InvalidSanitaryDataException: Si les données sont invalides
            CycleNotFoundException: Si le cycle n'existe pas
        """
        client_uuid = kwargs.get('client_uuid')
        existing_log = SanitaryService._get_existing_log_from_client_uuid(
            cycle=cycle,
            client_uuid=client_uuid,
        )
        if existing_log:
            return SanitaryLogMutationResult(log=existing_log, created=False)

        SanitaryService._validate_create_sanitary_log_inputs(
            cycle=cycle,
            event_date=event_date,
            event_type=event_type,
            symptoms=symptoms,
            affected_count=affected_count,
            treatment_duration_days=treatment_duration_days,
        )

        # Création du log sanitaire
        sanitary_log = SanitaryLog.objects.create(
            cycle=cycle,
            event_date=event_date,
            event_type=event_type,
            symptoms=symptoms,
            affected_count=affected_count,
            treatment_applied=treatment_applied,
            medication_used=medication_used,
            dosage=dosage,
            treatment_duration_days=treatment_duration_days,
            photo=photo,
            notes=notes,
            resolved=False,
            **kwargs
        )

        # Créer notification automatique selon gravité
        SanitaryService._create_sanitary_notification(sanitary_log)

        # Vérifier si alerte critique nécessaire
        if affected_count and cycle.current_count > 0:
            affected_rate = affected_count / cycle.current_count
            if affected_rate >= SanitaryService.CRITICAL_AFFECTED_THRESHOLD:
                SanitaryService._create_critical_alert(sanitary_log, affected_rate)

        return SanitaryLogMutationResult(log=sanitary_log, created=True)

    @staticmethod
    def create_sanitary_log(
        cycle: ProductionCycle,
        event_date: date,
        event_type: str,
        symptoms: str,
        affected_count: int | None = None,
        treatment_applied: str = '',
        medication_used: str = '',
        dosage: str = '',
        treatment_duration_days: int | None = None,
        photo = None,
        notes: str = '',
        **kwargs
    ) -> SanitaryLog:
        """
        Backward-compatible wrapper qui retourne uniquement le log.

        Les nouveaux appels HTTP doivent préférer create_or_get_sanitary_log()
        pour connaître explicitement si la création est nouvelle ou idempotente.
        """
        mutation_result = SanitaryService.create_or_get_sanitary_log(
            cycle=cycle,
            event_date=event_date,
            event_type=event_type,
            symptoms=symptoms,
            affected_count=affected_count,
            treatment_applied=treatment_applied,
            medication_used=medication_used,
            dosage=dosage,
            treatment_duration_days=treatment_duration_days,
            photo=photo,
            notes=notes,
            **kwargs,
        )
        return mutation_result.log

    @staticmethod
    @transaction.atomic
    def resolve_sanitary_issue(
        sanitary_log_id: str,
        user=None,
        resolution_date: date | None = None,
        resolution_notes: str = ''
    ) -> SanitaryLog:
        """
        Marque un problème sanitaire comme résolu.

        Args:
            sanitary_log_id: ID du log sanitaire à résoudre
            resolution_date: Date de résolution (par défaut aujourd'hui)
            resolution_notes: Notes sur la résolution et l'évolution

        Returns:
            SanitaryLog: Log sanitaire mis à jour

        Raises:
            SanitaryLogNotFoundException: Si le log n'existe pas
            InvalidSanitaryDataException: Si déjà résolu ou date invalide
        """
        try:
            sanitary_lookup = SanitaryLog.objects.select_related('cycle__farm_profile__user').filter(
                id=sanitary_log_id
            )
            if user is not None:
                sanitary_lookup = sanitary_lookup.filter(cycle__farm_profile__user=user)
            sanitary_log = sanitary_lookup.get()
        except SanitaryLog.DoesNotExist:
            raise SanitaryLogNotFoundException(
                f"Log sanitaire {sanitary_log_id} introuvable"
            )

        # Validation métier
        if sanitary_log.resolved:
            raise InvalidSanitaryDataException(
                "Ce problème sanitaire est déjà résolu"
            )

        if isinstance(resolution_date, str):
            try:
                resolution_date = date.fromisoformat(resolution_date)
            except ValueError as exc:
                raise InvalidSanitaryDataException(
                    "Le format de la date de résolution est invalide (YYYY-MM-DD attendu)"
                ) from exc

        resolution_date = resolution_date or date.today()

        if resolution_date < sanitary_log.event_date:
            raise InvalidSanitaryDataException(
                "La date de résolution ne peut pas être avant la date de l'événement"
            )

        if resolution_date > date.today():
            raise InvalidSanitaryDataException(
                "La date de résolution ne peut pas être dans le futur"
            )

        # Résolution du problème
        sanitary_log.resolved = True
        sanitary_log.resolution_date = resolution_date
        if resolution_notes:
            notes = (sanitary_log.notes or '').strip()
            resolution_entry = (
                f"[Résolution {resolution_date.isoformat()}] "
                f"{resolution_notes.strip()}"
            )
            sanitary_log.notes = f"{notes}\n{resolution_entry}".strip()
        sanitary_log.save()

        # Créer notification de résolution
        NotificationService.create_notification(
            user=sanitary_log.cycle.farm_profile.user,
            notification_type='ticket_resolved',
            title=_("Problème résolu - %(cycle_name)s") % {'cycle_name': sanitary_log.cycle.cycle_name},
            message=_(
                "Le problème %(event_type)s du %(event_date)s a été marqué comme résolu."
            ) % {
                'event_type': sanitary_log.get_event_type_display().lower(),
                'event_date': sanitary_log.event_date,
            },
            content_object=sanitary_log,
            metadata={'cycle_id': str(sanitary_log.cycle.id), 'sanitary_log_id': str(sanitary_log.id)},
            channels=['in_app', 'push'],
            scheduled_for=timezone.now()
        )

        return sanitary_log

    @staticmethod
    def get_active_issues_by_cycle(user) -> list[dict[str, Any]]:
        """
        Obtient tous les problèmes sanitaires actifs groupés par cycle.

        Args:
            user: Utilisateur dont on veut les problèmes actifs

        Returns:
            List[Dict]: Liste de cycles avec leurs problèmes actifs
                Format: [
                    {
                        'cycle_id': str,
                        'cycle_name': str,
                        'species': str,
                        'issues_count': int,
                        'critical_count': int,
                        'issues': [SanitaryLog, ...]
                    },
                    ...
                ]
        """
        # Récupérer tous les logs non résolus de l'utilisateur
        active_logs = SanitaryLog.objects.filter(
            cycle__farm_profile__user=user,
            resolved=False
        ).select_related('cycle').order_by('-event_date')

        # Grouper par cycle
        by_cycle = {}
        for log in active_logs:
            cycle_id = str(log.cycle.id)

            if cycle_id not in by_cycle:
                by_cycle[cycle_id] = {
                    'cycle_id': cycle_id,
                    'cycle_name': log.cycle.cycle_name,
                    'species': log.cycle.species,
                    'species_display': log.cycle.get_species_display(),
                    'issues_count': 0,
                    'critical_count': 0,
                    'issues': []
                }

            by_cycle[cycle_id]['issues'].append(log)
            by_cycle[cycle_id]['issues_count'] += 1

            # Compter les problèmes critiques
            severity = SanitaryService.SEVERITY_MAP.get(log.event_type, 'info')
            if severity == 'critical':
                by_cycle[cycle_id]['critical_count'] += 1

        return list(by_cycle.values())

    @staticmethod
    def analyze_sanitary_history(cycle: ProductionCycle) -> dict[str, Any]:
        """
        Analyse l'historique sanitaire complet d'un cycle.

        Args:
            cycle: Cycle de production à analyser

        Returns:
            Dict: Analyse sanitaire complète avec statistiques et recommandations
        """
        logs = SanitaryLog.objects.filter(cycle=cycle).order_by('event_date')

        if not logs.exists():
            return {
                'total_events': 0,
                'resolved_count': 0,
                'active_count': 0,
                'by_type': {},
                'timeline': [],
                'health_score': 100,
                'recommendations': [str(_('Aucun problème sanitaire enregistré. Continuez le bon travail !'))]
            }

        # Statistiques de base
        total_events = logs.count()
        resolved_count = logs.filter(resolved=True).count()
        active_count = total_events - resolved_count

        # Groupement par type
        by_type = {}
        for log in logs:
            event_type = log.event_type
            if event_type not in by_type:
                by_type[event_type] = {
                    'count': 0,
                    'resolved': 0,
                    'active': 0,
                    'total_affected': 0,
                    'severity': SanitaryService.SEVERITY_MAP.get(event_type, 'info')
                }

            by_type[event_type]['count'] += 1
            if log.resolved:
                by_type[event_type]['resolved'] += 1
            else:
                by_type[event_type]['active'] += 1

            if log.affected_count:
                by_type[event_type]['total_affected'] += log.affected_count

        # Timeline des événements
        timeline = []
        for log in logs:
            days_since_start = (log.event_date - cycle.start_date).days
            timeline.append({
                'day': days_since_start,
                'date': log.event_date.isoformat(),
                'type': log.event_type,
                'type_display': log.get_event_type_display(),
                'affected_count': log.affected_count,
                'resolved': log.resolved,
                'severity': SanitaryService.SEVERITY_MAP.get(log.event_type, 'info')
            })

        # Calcul du score de santé (0-100)
        health_score = SanitaryService._calculate_health_score(
            cycle, total_events, active_count, by_type
        )

        # Génération de recommandations
        recommendations = SanitaryService._generate_health_recommendations(
            cycle, by_type, active_count, health_score
        )

        return {
            'total_events': total_events,
            'resolved_count': resolved_count,
            'active_count': active_count,
            'resolution_rate': (resolved_count / total_events * 100) if total_events > 0 else 0,
            'by_type': by_type,
            'timeline': timeline,
            'health_score': health_score,
            'recommendations': recommendations
        }

    @staticmethod
    def _create_sanitary_notification(sanitary_log: SanitaryLog) -> None:
        """
        Crée une notification appropriée selon le type et la gravité.

        Args:
            sanitary_log: Log sanitaire créé
        """
        severity = SanitaryService.SEVERITY_MAP.get(sanitary_log.event_type, 'info')
        cycle = sanitary_log.cycle

        if severity == 'critical':
            title = _("🚨 Alerte sanitaire - %(cycle_name)s") % {'cycle_name': cycle.cycle_name}
            message = _("Problème %(event_type)s détecté. Intervention recommandée rapidement.") % {
                'event_type': sanitary_log.get_event_type_display().lower()
            }
            notification_type = 'alert'
        elif severity == 'warning':
            title = _("⚠️ Attention sanitaire - %(cycle_name)s") % {'cycle_name': cycle.cycle_name}
            message = _("Problème %(event_type)s signalé. Surveillance recommandée.") % {
                'event_type': sanitary_log.get_event_type_display().lower()
            }
            notification_type = 'alert'
        else:
            title = _("📋 Événement sanitaire - %(cycle_name)s") % {'cycle_name': cycle.cycle_name}
            message = _("Événement %(event_type)s enregistré.") % {
                'event_type': sanitary_log.get_event_type_display().lower()
            }
            notification_type = 'info'

        NotificationService.create_notification(
            user=cycle.farm_profile.user,
            notification_type=notification_type,
            title=title,
            message=message,
            content_object=sanitary_log,
            metadata={'cycle_id': str(cycle.id), 'sanitary_log_id': str(sanitary_log.id)},
            channels=['in_app', 'push'],
            scheduled_for=timezone.now()
        )

    @staticmethod
    def _create_critical_alert(sanitary_log: SanitaryLog, affected_rate: float) -> None:
        """
        Crée une alerte critique si le taux d'affectation est élevé.

        Args:
            sanitary_log: Log sanitaire concerné
            affected_rate: Taux de poissons affectés (0.0 à 1.0)
        """
        cycle = sanitary_log.cycle
        percentage = affected_rate * 100

        NotificationService.create_notification(
            user=cycle.farm_profile.user,
            notification_type='mortality_alert',
            title=_("ALERTE CRITIQUE - %(cycle_name)s") % {'cycle_name': cycle.cycle_name},
            message=_(
                "%(percentage).1f%% de l'effectif affecté (%(count)d poissons).\n"
                "Type: %(event_type)s\n"
                "ACTION URGENTE :\n"
                "1. Isoler les poissons malades si possible\n"
                "2. Vérifier la qualité de l'eau\n"
                "3. Contacter le support AquaCare\n"
                "4. Suspendre l'alimentation si besoin"
            ) % {
                'percentage': percentage,
                'count': sanitary_log.affected_count,
                'event_type': sanitary_log.get_event_type_display(),
            },
            content_object=sanitary_log,
            metadata={'cycle_id': str(cycle.id), 'sanitary_log_id': str(sanitary_log.id)},
            priority='urgent',
            channels=['in_app', 'push', 'email'],
            scheduled_for=timezone.now()
        )

    @staticmethod
    def _calculate_health_score(
        cycle: ProductionCycle,
        total_events: int,
        active_count: int,
        by_type: dict[str, dict]
    ) -> int:
        """
        Calcule un score de santé sur 100 pour le cycle.

        Critères :
        - Nombre total d'événements (pénalité)
        - Nombre de problèmes actifs non résolus (forte pénalité)
        - Gravité des événements (pénalité selon severity)
        - Durée du cycle (normalisation)

        Args:
            cycle: Cycle de production
            total_events: Nombre total d'événements sanitaires
            active_count: Nombre de problèmes actifs
            by_type: Statistiques par type d'événement

        Returns:
            int: Score de santé entre 0 et 100
        """
        base_score = 100

        # Pénalité pour événements actifs non résolus (5 points par problème actif)
        base_score -= active_count * 5

        # Pénalité pour événements critiques (3 points par événement)
        critical_events = sum(
            data['count'] for event_type, data in by_type.items()
            if SanitaryService.SEVERITY_MAP.get(event_type) == 'critical'
        )
        base_score -= critical_events * 3

        # Pénalité pour événements warning (1 point par événement)
        warning_events = sum(
            data['count'] for event_type, data in by_type.items()
            if SanitaryService.SEVERITY_MAP.get(event_type) == 'warning'
        )
        base_score -= warning_events * 1

        # Normaliser par durée du cycle (événements fréquents = pire score)
        days_active = cycle.days_active()
        if days_active > 0:
            events_per_week = (total_events / days_active) * 7
            if events_per_week > 1:
                base_score -= int((events_per_week - 1) * 5)

        # Score minimum de 0, maximum de 100
        return max(0, min(100, base_score))

    @staticmethod
    def _generate_health_recommendations(
        cycle: ProductionCycle,
        by_type: dict[str, dict],
        active_count: int,
        health_score: int
    ) -> list[str]:
        """
        Génère des recommandations préventives et curatives.

        Args:
            cycle: Cycle de production
            by_type: Statistiques par type d'événement
            active_count: Nombre de problèmes actifs
            health_score: Score de santé calculé

        Returns:
            List[str]: Liste de recommandations actionnables
        """
        recommendations = []

        # Recommandations selon problèmes actifs
        if active_count > 0:
            recommendations.append(
                _("⚠️ %(count)d problème(s) sanitaire(s) actif(s). "
                  "Résolvez-les et marquez-les comme résolus après traitement.") % {'count': active_count}
            )

        # Recommandations selon types de problèmes
        if 'disease' in by_type and by_type['disease']['active'] > 0:
            recommendations.append(
                _("🦠 Maladie détectée : Isolez les poissons malades, vérifiez la qualité de l'eau "
                  "et contactez un vétérinaire aquacole si nécessaire.")
            )

        if 'water_quality' in by_type and by_type['water_quality']['count'] > 0:
            recommendations.append(
                _("💧 Problèmes de qualité d'eau récurrents : Augmentez la fréquence de renouvellement "
                  "et vérifiez le système de filtration/aération.")
            )

        if 'abnormal_mortality' in by_type and by_type['abnormal_mortality']['count'] > 0:
            recommendations.append(
                _("☠️ Mortalité anormale enregistrée : Surveillez étroitement la température, "
                  "l'oxygène dissous et réduisez l'alimentation temporairement.")
            )

        # Recommandations selon score de santé
        if health_score >= 90:
            recommendations.append(_("✅ Excellente santé du cycle ! Maintenez ces bonnes pratiques."))
        elif health_score >= 70:
            recommendations.append(_("👍 Santé correcte. Restez vigilant et anticipez les problèmes."))
        elif health_score >= 50:
            recommendations.append(_("⚠️ Santé préoccupante. Renforcez la surveillance et le suivi sanitaire."))
        else:
            recommendations.append(
                _("🚨 Santé critique. Intervention urgente requise. "
                  "Contactez le support technique AquaCare immédiatement.")
            )

        # Recommandations préventives générales
        if len(recommendations) < 3:
            recommendations.append(
                _("💡 Conseil : Effectuez des observations quotidiennes pour détecter "
                  "précocement les signes de maladie (comportement, appétit, aspect).")
            )

        return recommendations

    @staticmethod
    def get_sanitary_summary_for_dashboard(user) -> dict[str, Any]:
        """
        Génère un résumé sanitaire pour le dashboard utilisateur.

        Args:
            user: Utilisateur dont on veut le résumé

        Returns:
            Dict: Résumé sanitaire avec métriques clés
                {
                    'active_issues_count': int,
                    'critical_issues_count': int,
                    'cycles_with_issues': int,
                    'recent_events': List[Dict],
                    'needs_attention': bool
                }
        """
        # Problèmes actifs
        active_logs = SanitaryLog.objects.filter(
            cycle__farm_profile__user=user,
            resolved=False
        ).select_related('cycle')

        active_count = active_logs.count()

        # Compter les problèmes critiques
        critical_count = active_logs.filter(
            event_type__in=['disease', 'abnormal_mortality']
        ).count()

        # Cycles avec problèmes
        cycles_with_issues = active_logs.values('cycle').distinct().count()

        # Événements récents (7 derniers jours)
        recent_events = []
        recent_logs = SanitaryLog.objects.filter(
            cycle__farm_profile__user=user,
            event_date__gte=date.today() - timedelta(days=7)
        ).select_related('cycle').order_by('-event_date')[:5]

        for log in recent_logs:
            recent_events.append({
                'cycle_name': log.cycle.cycle_name,
                'event_type': log.event_type,
                'event_type_display': log.get_event_type_display(),
                'event_date': log.event_date.isoformat(),
                'resolved': log.resolved,
                'severity': SanitaryService.SEVERITY_MAP.get(log.event_type, 'info'),
                'affected_count': log.affected_count
            })

        return {
            'active_issues_count': active_count,
            'critical_issues_count': critical_count,
            'cycles_with_issues': cycles_with_issues,
            'recent_events': recent_events,
            'needs_attention': critical_count > 0 or active_count > 3
        }
