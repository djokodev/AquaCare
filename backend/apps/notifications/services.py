"""
Service centralisé pour la gestion des notifications.
Utilisable par tous les modules (aquaculture, commerce, chat, support).
"""

import logging
from django.utils import timezone
from django.db import transaction
from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.conf import settings
from typing import List, Dict, Optional, Any

from .models import Notification, NotificationPreference
from .constants import DEFAULT_CHANNELS_BY_TYPE, DEFAULT_PRIORITY_BY_TYPE

User = get_user_model()
logger = logging.getLogger(__name__)


class NotificationService:
    """
    Service centralisé pour créer et envoyer des notifications.
    Utilisable par TOUS les modules (aquaculture, commerce, chat, support).
    """

    @staticmethod
    @transaction.atomic
    def create_notification(
        user: User,
        notification_type: str,
        title: str,
        message: str,
        content_object: Any = None,
        metadata: Optional[Dict] = None,
        channels: Optional[List[str]] = None,
        priority: Optional[str] = None,
        scheduled_for: Optional[timezone.datetime] = None,
        send_immediately: bool = False
    ) -> Optional[Notification]:
        """
        Crée une notification générique.

        Args:
            user: Utilisateur destinataire
            notification_type: Type notification (voir NOTIFICATION_TYPES)
            title: Titre court (max 200 car)
            message: Message complet
            content_object: Objet Django lié (optionnel) - Order, Cycle, Message, etc.
            metadata: Dict JSON pour contexte (optionnel)
            channels: Liste canaux ['in_app', 'email', 'push'] (défaut: auto selon type)
            priority: Priorité ('low', 'medium', 'high', 'urgent') (défaut: auto selon type)
            scheduled_for: Date/heure affichage (défaut: maintenant)
            send_immediately: Envoyer email/push immédiatement via Celery (défaut: False)

        Returns:
            Notification créée, ou None si toutes préférences désactivées

        Examples:
            # Commerce : Commande confirmée
            NotificationService.create_notification(
                user=order.user,
                notification_type='order_confirmed',
                title=f"Commande {order.order_number} confirmée",
                message=f"Montant : {order.total_amount} FCFA",
                content_object=order,
                metadata={'order_number': order.order_number, 'amount': float(order.total_amount)},
                channels=['in_app', 'email'],
                send_immediately=True
            )

            # Chat : Nouveau message
            NotificationService.create_notification(
                user=recipient,
                notification_type='new_message',
                title=f"Nouveau message de {sender.first_name}",
                message=message_preview,
                content_object=chat_message,
                channels=['in_app', 'push'],
                send_immediately=True
            )

            # Support : Ticket résolu
            NotificationService.create_notification(
                user=ticket.user,
                notification_type='ticket_resolved',
                title=f"Ticket #{ticket.number} résolu",
                message="Votre problème a été résolu par notre équipe.",
                content_object=ticket,
                channels=['in_app', 'email']
            )
        """

        # 1. Récupérer ou créer préférences utilisateur
        prefs, _ = NotificationPreference.objects.get_or_create(user=user)

        # 2. Déterminer canaux (auto ou spécifiés)
        if channels is None:
            # Utiliser canaux recommandés par défaut selon le type
            channels = DEFAULT_CHANNELS_BY_TYPE.get(notification_type, ['in_app'])
        else:
            channels = list(channels)  # Copie pour éviter mutations

        # 3. Filtrer canaux selon préférences globales
        if not prefs.in_app_enabled and 'in_app' in channels:
            channels.remove('in_app')
        if not prefs.email_enabled and 'email' in channels:
            channels.remove('email')
        if not prefs.push_enabled and 'push' in channels:
            channels.remove('push')

        # 4. Si aucun canal activé, ne pas créer notification
        if not channels:
            return None

        # 5. Vérifier préférences par type
        if not prefs.is_type_enabled(notification_type):
            return None

        # 6. Déterminer priorité (auto ou spécifiée)
        if priority is None:
            priority = DEFAULT_PRIORITY_BY_TYPE.get(notification_type, 'medium')

        # 6.b Politique produit : rappels nourrissage = alarme locale mobile prioritaire
        if (
            notification_type == 'feeding_reminder'
            and getattr(settings, 'FEEDING_REMINDER_LOCAL_ALARM_ONLY', True)
            and 'push' in channels
        ):
            channels = [channel for channel in channels if channel != 'push']
            if not channels:
                return None

        # 7. Vérifier heures silencieuses pour push
        if 'push' in channels and prefs.is_in_quiet_hours():
            channels.remove('push')
            # Si push était le seul canal, ne pas créer notification
            if not channels:
                return None

        # 8. Créer la notification
        notification = Notification.objects.create(
            user=user,
            notification_type=notification_type,
            title=title,
            message=message,
            content_type=ContentType.objects.get_for_model(content_object) if content_object else None,
            object_id=content_object.pk if content_object else None,
            metadata=metadata or {},
            channels=channels,
            priority=priority,
            scheduled_for=scheduled_for or timezone.now()
        )

        # 9. Envoyer immédiatement si demandé (via Celery)
        if send_immediately:
            try:
                from .tasks import send_email_notification_task, send_push_notification_task

                if 'email' in channels:
                    send_email_notification_task.delay(str(notification.id))
                if 'push' in channels:
                    send_push_notification_task.delay(str(notification.id))
            except Exception:
                # Ne pas bloquer la création de notification si l'envoi immédiat échoue
                logger.exception(
                    "Immediate notification dispatch failed for %s",
                    notification.id,
                )

        return notification

    @staticmethod
    def create_bulk_notifications(
        users: List[User],
        notification_type: str,
        title: str,
        message: str,
        metadata: Optional[Dict] = None,
        channels: Optional[List[str]] = None,
        priority: Optional[str] = None,
        scheduled_for: Optional[timezone.datetime] = None
    ) -> int:
        """
        Crée des notifications pour plusieurs utilisateurs en masse.
        Optimisé pour performances (bulk_create).

        Utile pour :
        - Annonces système à tous les users
        - Alertes régionales
        - Promotions ciblées

        Args:
            users: Liste d'utilisateurs destinataires
            notification_type: Type de notification
            title: Titre
            message: Message
            metadata: Métadonnées optionnelles
            channels: Canaux de diffusion
            priority: Priorité
            scheduled_for: Date/heure d'affichage

        Returns:
            Nombre de notifications créées
        """
        # Déterminer valeurs par défaut
        if channels is None:
            channels = DEFAULT_CHANNELS_BY_TYPE.get(notification_type, ['in_app'])
        if (
            notification_type == 'feeding_reminder'
            and getattr(settings, 'FEEDING_REMINDER_LOCAL_ALARM_ONLY', True)
            and 'push' in channels
        ):
            channels = [channel for channel in channels if channel != 'push']
        if priority is None:
            priority = DEFAULT_PRIORITY_BY_TYPE.get(notification_type, 'medium')
        if scheduled_for is None:
            scheduled_for = timezone.now()

        # Charger toutes les préférences existantes en une seule requête
        user_ids = [u.pk for u in users]
        existing_prefs = {
            p.user_id: p
            for p in NotificationPreference.objects.filter(user__in=user_ids)
        }

        # Créer les préférences manquantes en batch
        missing_user_ids = [uid for uid in user_ids if uid not in existing_prefs]
        if missing_user_ids:
            new_prefs = NotificationPreference.objects.bulk_create(
                [NotificationPreference(user_id=uid) for uid in missing_user_ids],
                ignore_conflicts=True,
            )
            for p in new_prefs:
                existing_prefs[p.user_id] = p

        # Construire les notifications en filtrant par préférences (lookup O(1))
        notifications = []
        for user in users:
            prefs = existing_prefs.get(user.pk)
            if prefs and prefs.is_type_enabled(notification_type):
                notifications.append(Notification(
                    user=user,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    metadata=metadata or {},
                    channels=list(channels),
                    priority=priority,
                    scheduled_for=scheduled_for,
                ))

        # Créer en batch
        Notification.objects.bulk_create(notifications, batch_size=500)
        return len(notifications)

    @staticmethod
    def mark_as_read(notification_id: str) -> Notification:
        """
        Marque une notification comme lue.

        Args:
            notification_id: UUID de la notification

        Returns:
            Notification mise à jour
        """
        notification = Notification.objects.get(id=notification_id)
        notification.mark_as_read()
        return notification

    @staticmethod
    def mark_all_as_read(user: User) -> int:
        """
        Marque toutes les notifications d'un user comme lues.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications mises à jour
        """
        count = Notification.objects.filter(user=user, is_read=False).update(
            is_read=True,
            read_at=timezone.now()
        )
        return count

    @staticmethod
    def delete_notification(notification_id: str) -> bool:
        """
        Supprime une notification.

        Args:
            notification_id: UUID de la notification

        Returns:
            True si supprimée, False sinon
        """
        try:
            notification = Notification.objects.get(id=notification_id)
            notification.delete()
            return True
        except Notification.DoesNotExist:
            return False

    @staticmethod
    def delete_all_read_notifications(user: User) -> int:
        """
        Supprime toutes les notifications lues d'un user.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications supprimées
        """
        count, _ = Notification.objects.filter(user=user, is_read=True).delete()
        return count

    @staticmethod
    def delete_old_notifications(days: int = 90) -> int:
        """
        Supprime les notifications lues de plus de X jours.
        À appeler via Celery periodic task.

        Args:
            days: Nombre de jours (défaut: 90)

        Returns:
            Nombre de notifications supprimées
        """
        cutoff_date = timezone.now() - timezone.timedelta(days=days)
        count, _ = Notification.objects.filter(
            is_read=True,
            scheduled_for__lt=cutoff_date
        ).delete()
        return count

    @staticmethod
    def get_unread_count(user: User) -> int:
        """
        Compte les notifications non lues d'un user.

        Args:
            user: Utilisateur

        Returns:
            Nombre de notifications non lues
        """
        return Notification.objects.filter(
            user=user,
            is_read=False,
            scheduled_for__lte=timezone.now()
        ).count()

    @staticmethod
    def get_user_notifications(
        user: User,
        is_read: Optional[bool] = None,
        notification_type: Optional[str] = None,
        limit: int = 50
    ) -> List[Notification]:
        """
        Récupère les notifications d'un user avec filtres.

        Args:
            user: Utilisateur
            is_read: Filtre lu/non-lu (optionnel)
            notification_type: Filtre par type (optionnel)
            limit: Nombre max de résultats

        Returns:
            Liste de notifications
        """
        queryset = Notification.objects.filter(
            user=user,
            scheduled_for__lte=timezone.now()
        )

        if is_read is not None:
            queryset = queryset.filter(is_read=is_read)

        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)

        return queryset[:limit]
