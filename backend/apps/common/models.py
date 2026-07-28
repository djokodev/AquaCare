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
        Crée la ligne avec la baseline 2024-01-01 si absente (première connexion).
        """
        obj, _ = cls.objects.get_or_create(
            user=user,
            section=section,
            defaults={'last_seen_at': cls._BASELINE},
        )
        return obj.last_seen_at

    @classmethod
    def mark_seen(cls, user, section):
        """Met à jour le timestamp de dernière consultation à maintenant."""
        cls.objects.update_or_create(
            user=user,
            section=section,
            defaults={'last_seen_at': django_timezone.now()},
        )
