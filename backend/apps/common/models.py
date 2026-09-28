"""
Modèles communs pour l'administration AquaCare.
"""

import uuid
from datetime import UTC, datetime

from django.conf import settings
from django.db import models
from django.utils import timezone as django_timezone
from django.utils.translation import gettext_lazy as _


class AdminViewState(models.Model):
    """
    Trace la dernière consultation de chaque section de l'admin par utilisateur.
    Utilisé pour calculer les badges de notification dans la sidebar Jazzmin.
    """

    SECTION_CYCLE_LOGS = 'cycle_logs'
    SECTION_SANITARY_LOGS = 'sanitary_logs'
    SECTION_ORDERS = 'orders'
    SECTION_PRODUCTION_REPORTS = 'production_reports'
    SECTION_DISPATCH_LOGS = 'dispatch_logs'

    SECTION_CHOICES = [
        (SECTION_CYCLE_LOGS, _('Logs de cycle')),
        (SECTION_SANITARY_LOGS, _('Journaux sanitaires')),
        (SECTION_ORDERS, _('Commandes')),
        (SECTION_PRODUCTION_REPORTS, _('Rapports de production')),
        (SECTION_DISPATCH_LOGS, _("Journaux d'envoi")),
    ]

    # Baseline : tout ce qui existe avant cette date sera visible en "nouveau"
    # à la première connexion d'un admin (pour établir un point de départ)
    _BASELINE = datetime(2024, 1, 1, tzinfo=UTC)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='admin_view_states',
        verbose_name=_('Utilisateur admin'),
    )
    section = models.CharField(
        max_length=50,
        choices=SECTION_CHOICES,
        verbose_name=_('Section'),
    )
    last_seen_at = models.DateTimeField(
        default=django_timezone.now,
        verbose_name=_('Dernière consultation'),
    )

    class Meta:
        unique_together = ['user', 'section']
        db_table = 'common_admin_view_state'
        verbose_name = _('État de vue admin')
        verbose_name_plural = _('États de vue admin')

    def __str__(self):
        return f"{self.user} — {self.section} — {self.last_seen_at}"

    @classmethod
    def get_last_seen(cls, user, section):
        """
        Retourne le datetime de la dernière consultation.
        La lecture des badges reste sans ecriture; la baseline est retournee si
        aucune consultation explicite de section n'a encore ete enregistree.
        """
        return (
            cls.objects.filter(user=user, section=section)
            .values_list('last_seen_at', flat=True)
            .first()
            or cls._BASELINE
        )

    @classmethod
    def mark_seen(cls, user, section):
        """Met à jour le timestamp de dernière consultation à maintenant."""
        cls.objects.update_or_create(
            user=user,
            section=section,
            defaults={'last_seen_at': django_timezone.now()},
        )


class AdminActivityEvent(models.Model):
    """Projection serveur immuable d'une activité utile à l'administration."""

    class Domain(models.TextChoices):
        AQUACULTURE = 'aquaculture', _('Aquaculture')
        COMMERCE = 'commerce', _('Commerce')
        SUPPORT = 'support', _('Support')

    class Level(models.TextChoices):
        INFO = 'info', _('Information')
        ATTENTION = 'attention', _('Attention')
        CRITICAL = 'critical', _('Critique')

    class EventType(models.TextChoices):
        PRODUCTION_UNIT_CREATED = (
            'aquaculture.production_unit.created',
            _('Unité de production créée'),
        )
        PRODUCTION_CYCLE_CREATED = (
            'aquaculture.production_cycle.created',
            _('Cycle de production créé'),
        )
        CYCLE_LOG_RECEIVED = (
            'aquaculture.cycle_log.received',
            _('Journal de cycle reçu'),
        )
        SANITARY_LOG_CREATED = (
            'aquaculture.sanitary_log.created',
            _('Événement sanitaire créé'),
        )
        SANITARY_LOG_RESOLVED = (
            'aquaculture.sanitary_log.resolved',
            _('Événement sanitaire résolu'),
        )
        CALIBRATION_COMPLETED = (
            'aquaculture.calibration.completed',
            _('Calibrage terminé'),
        )
        FINAL_HARVEST_COMPLETED = (
            'aquaculture.final_harvest.completed',
            _('Récolte finale terminée'),
        )
        PRODUCTION_REPORT_GENERATED = (
            'aquaculture.production_report.generated',
            _('Rapport de production généré'),
        )
        REPORT_DISPATCH_SUCCEEDED = (
            'aquaculture.report_dispatch.succeeded',
            _('Envoi de rapport réussi'),
        )
        REPORT_DISPATCH_FAILED = (
            'aquaculture.report_dispatch.failed',
            _('Envoi de rapport échoué'),
        )
        ORDER_CREATED = 'commerce.order.created', _('Commande créée')
        ORDER_DELIVERED = 'commerce.order.delivered', _('Commande livrée')
        ORDER_READY_FOR_PICKUP = (
            'commerce.order.ready_for_pickup',
            _('Commande prête au retrait'),
        )
        ORDER_RECEIVED = 'commerce.order.received', _('Commande reçue')
        USER_MESSAGE_RECEIVED = (
            'support.user_message.received',
            _('Message utilisateur reçu'),
        )

    # Exception volontaire aux UUID métier : ce read-model serveur utilise un
    # curseur strictement monotone pour la pagination qui sera ajoutée au Lot 2B.
    id = models.BigAutoField(primary_key=True)
    event_type = models.CharField(max_length=80, choices=EventType.choices)
    domain = models.CharField(max_length=20, choices=Domain.choices)
    level = models.CharField(max_length=20, choices=Level.choices)
    farm_profile = models.ForeignKey(
        'accounts.FarmProfile',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='admin_activity_events',
        db_index=False,
    )
    production_cycle = models.ForeignKey(
        'aquaculture.ProductionCycle',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='admin_activity_events',
    )
    production_unit = models.ForeignKey(
        'aquaculture.ProductionUnit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='admin_activity_events',
    )
    source_app_label = models.CharField(max_length=64)
    source_model = models.CharField(max_length=64)
    source_object_id = models.UUIDField()
    occurred_on = models.DateField(null=True, blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True)
    source_recorded_at = models.DateTimeField(null=True, blank=True)
    projected_at = models.DateTimeField(auto_now_add=True)
    dedupe_key = models.CharField(max_length=255, unique=True)
    render_context = models.JSONField(default=dict)
    render_version = models.PositiveSmallIntegerField(default=1)
    is_backfilled = models.BooleanField(default=False)

    class Meta:
        db_table = 'common_admin_activity_event'
        ordering = ['-id']
        constraints = [
            models.CheckConstraint(
                condition=(
                    models.Q(occurred_on__isnull=False, occurred_at__isnull=True)
                    | models.Q(occurred_on__isnull=True, occurred_at__isnull=False)
                ),
                name='admin_activity_exactly_one_occurred',
            ),
        ]
        indexes = [
            models.Index(fields=['domain', '-id'], name='admin_act_domain_id_idx'),
            models.Index(fields=['event_type', '-id'], name='admin_act_type_id_idx'),
            models.Index(fields=['farm_profile', '-id'], name='admin_act_farm_id_idx'),
            models.Index(fields=['level', '-id'], name='admin_act_level_id_idx'),
            models.Index(fields=['occurred_on'], name='admin_act_on_idx'),
            models.Index(fields=['occurred_at'], name='admin_act_at_idx'),
            models.Index(
                fields=['source_app_label', 'source_model', 'source_object_id'],
                name='admin_act_source_idx',
            ),
        ]

    def __str__(self):
        return f'{self.id} — {self.event_type} — {self.source_object_id}'
