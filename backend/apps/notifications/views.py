"""
Views (ViewSets) pour l'API REST des notifications.
"""

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Count, Q

from .models import Notification, NotificationPreference, PushToken
from .serializers import (
    NotificationSerializer,
    NotificationListSerializer,
    NotificationPreferenceSerializer,
    PushTokenSerializer,
    NotificationStatsSerializer
)
from .services import NotificationService


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoints pour les notifications.

    **Endpoints disponibles:**
    - GET    /api/notifications/          - Liste notifications user
    - GET    /api/notifications/{id}/     - Détail notification
    - POST   /api/notifications/{id}/mark_read/  - Marquer comme lu
    - POST   /api/notifications/mark_all_read/   - Tout marquer comme lu
    - DELETE /api/notifications/{id}/     - Supprimer notification
    - POST   /api/notifications/delete_all_read/ - Supprimer toutes les lues
    - GET    /api/notifications/stats/    - Statistiques notifications
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        """
        Filtre les notifications par utilisateur authentifié.
        Exclut les notifications futures (scheduled_for > now).
        """
        user = self.request.user
        queryset = Notification.objects.filter(
            user=user,
            scheduled_for__lte=timezone.now()
        ).select_related('user').prefetch_related('content_type')

        # Filtres optionnels via query params
        is_read = self.request.query_params.get('is_read', None)
        notification_type = self.request.query_params.get('type', None)

        if is_read is not None:
            is_read_bool = is_read.lower() == 'true'
            queryset = queryset.filter(is_read=is_read_bool)

        if notification_type:
            queryset = queryset.filter(notification_type=notification_type)

        return queryset.order_by('-scheduled_for')

    def get_serializer_class(self):
        """
        Utilise un serializer léger pour la liste.
        """
        if self.action == 'list':
            return NotificationListSerializer
        return NotificationSerializer

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """
        Marque une notification comme lue.

        **POST** /api/notifications/{id}/mark_read/

        **Response:**
        ```json
        {
            "status": "marked as read",
            "notification": { ... }
        }
        ```
        """
        notification = self.get_object()

        # Vérifier propriété
        if notification.user != request.user:
            return Response(
                {'error': 'Vous ne pouvez pas modifier cette notification'},
                status=status.HTTP_403_FORBIDDEN
            )

        notification.mark_as_read()
        serializer = self.get_serializer(notification)

        return Response({
            'status': 'marked as read',
            'notification': serializer.data
        })

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """
        Marque toutes les notifications comme lues.

        **POST** /api/notifications/mark_all_read/

        **Response:**
        ```json
        {
            "status": "success",
            "count": 15
        }
        ```
        """
        count = NotificationService.mark_all_as_read(request.user)

        return Response({
            'status': 'success',
            'count': count,
            'message': f'{count} notification(s) marquée(s) comme lue(s)'
        })

    def destroy(self, request, pk=None):
        """
        Supprime une notification.

        **DELETE** /api/notifications/{id}/
        """
        notification = self.get_object()

        # Vérifier propriété
        if notification.user != request.user:
            return Response(
                {'error': 'Vous ne pouvez pas supprimer cette notification'},
                status=status.HTTP_403_FORBIDDEN
            )

        notification.delete()

        return Response(
            {'status': 'deleted'},
            status=status.HTTP_204_NO_CONTENT
        )

    @action(detail=False, methods=['post'])
    def delete_all_read(self, request):
        """
        Supprime toutes les notifications lues.

        **POST** /api/notifications/delete_all_read/

        **Response:**
        ```json
        {
            "status": "success",
            "count": 10
        }
        ```
        """
        count = NotificationService.delete_all_read_notifications(request.user)

        return Response({
            'status': 'success',
            'count': count,
            'message': f'{count} notification(s) supprimée(s)'
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Retourne des statistiques sur les notifications.

        **GET** /api/notifications/stats/

        **Response:**
        ```json
        {
            "total_count": 45,
            "unread_count": 12,
            "read_count": 33,
            "by_type": {
                "feeding_reminder": 10,
                "order_confirmed": 5,
                ...
            }
        }
        ```
        """
        user = request.user
        now = timezone.now()

        # Combiner total et unread en un seul aggregate (2 requêtes au lieu de 3)
        agg = Notification.objects.filter(
            user=user,
            scheduled_for__lte=now,
        ).aggregate(
            total_count=Count('id'),
            unread_count=Count('id', filter=Q(is_read=False)),
        )
        total_count = agg['total_count']
        unread_count = agg['unread_count']
        read_count = total_count - unread_count

        by_type = Notification.objects.filter(
            user=user,
            scheduled_for__lte=now,
        ).values('notification_type').annotate(
            count=Count('id')
        ).order_by('-count')

        by_type_dict = {item['notification_type']: item['count'] for item in by_type}

        data = {
            'total_count': total_count,
            'unread_count': unread_count,
            'read_count': read_count,
            'by_type': by_type_dict
        }

        serializer = NotificationStatsSerializer(data)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def register_push_token(self, request):
        """
        Enregistre ou met à jour un Expo Push Token.

        **POST** /api/notifications/register_push_token/

        **Body:**
        ```json
        {
            "expo_push_token": "ExponentPushToken[xxxxxx]",
            "device_id": "unique-device-id",
            "device_name": "iPhone 13",
            "platform": "ios"
        }
        ```

        **Response:**
        ```json
        {
            "id": "uuid",
            "expo_push_token": "ExponentPushToken[xxxxxx]",
            "device_id": "unique-device-id",
            "device_name": "iPhone 13",
            "platform": "ios",
            "is_active": true,
            "created_at": "2024-12-05T..."
        }
        ```
        """
        serializer = PushTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Créer ou mettre à jour le token
        token, created = PushToken.objects.update_or_create(
            user=request.user,
            device_id=serializer.validated_data['device_id'],
            defaults={
                'expo_push_token': serializer.validated_data['expo_push_token'],
                'device_name': serializer.validated_data.get('device_name'),
                'platform': serializer.validated_data.get('platform'),
                'is_active': True,
            }
        )

        response_serializer = PushTokenSerializer(token)

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


class NotificationPreferenceViewSet(viewsets.ViewSet):
    """
    API endpoints pour les préférences de notifications.

    **Endpoints disponibles:**
    - GET  /api/notification-preferences/   - Récupérer préférences
    - PUT  /api/notification-preferences/   - Mettre à jour préférences
    - PATCH /api/notification-preferences/  - Mise à jour partielle
    """

    permission_classes = [IsAuthenticated]

    def list(self, request):
        """
        Récupère les préférences de l'utilisateur.

        **GET** /api/notification-preferences/
        """
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(prefs)
        return Response(serializer.data)

    def update(self, request):
        """
        Met à jour les préférences de l'utilisateur (complet).

        **PUT** /api/notification-preferences/
        """
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(prefs, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request):
        """
        Met à jour partiellement les préférences de l'utilisateur.

        **PATCH** /api/notification-preferences/
        """
        prefs, _ = NotificationPreference.objects.get_or_create(user=request.user)
        serializer = NotificationPreferenceSerializer(prefs, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
