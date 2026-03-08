"""
Views (ViewSets) pour l'API REST des notifications.
"""
from __future__ import annotations

from typing import Any, cast

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .application_services import (
    NotificationInboxApplicationService,
    NotificationOwnershipError,
    NotificationPreferenceApplicationService,
    NotificationQueryFilters,
    NotificationStatsPayload,
    PushTokenRegistrationCommand,
)
from .models import Notification
from .serializers import (
    NotificationActionErrorSerializer,
    NotificationListSerializer,
    NotificationMutationResponseSerializer,
    NotificationPreferenceSerializer,
    NotificationSerializer,
    NotificationStatsSerializer,
    PushTokenSerializer,
)
from .throttles import NotificationBulkMutationThrottle, NotificationPushTokenThrottle


@extend_schema_view(
    list=extend_schema(
        summary="Lister mes notifications",
        responses={200: NotificationListSerializer(many=True)},
    ),
    retrieve=extend_schema(
        summary="Recuperer une notification",
        responses={200: NotificationSerializer},
    ),
    mark_read=extend_schema(
        summary="Marquer une notification comme lue",
        responses={
            200: NotificationMutationResponseSerializer,
            403: NotificationActionErrorSerializer,
        },
    ),
    mark_all_read=extend_schema(
        summary="Marquer toutes mes notifications comme lues",
        responses={200: NotificationMutationResponseSerializer},
    ),
    destroy=extend_schema(
        summary="Supprimer une notification",
        responses={
            204: OpenApiResponse(description="Notification supprimee"),
            403: NotificationActionErrorSerializer,
        },
    ),
    delete_all_read=extend_schema(
        summary="Supprimer toutes mes notifications lues",
        responses={200: NotificationMutationResponseSerializer},
    ),
    stats=extend_schema(
        summary="Recuperer les statistiques de notifications",
        responses={200: NotificationStatsSerializer},
    ),
    register_push_token=extend_schema(
        summary="Enregistrer un token push Expo",
        request=PushTokenSerializer,
        responses={200: PushTokenSerializer, 201: PushTokenSerializer},
    ),
)
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

    @staticmethod
    def _forbidden_response(message: str) -> Response:
        serializer = NotificationActionErrorSerializer({'error': message})
        return Response(serializer.data, status=status.HTTP_403_FORBIDDEN)

    @staticmethod
    def _build_mutation_response(
        *,
        status_text: str,
        count: int | None = None,
        message: str | None = None,
        notification: dict[str, Any] | None = None,
        status_code: int = status.HTTP_200_OK,
    ) -> Response:
        payload: dict[str, Any] = {'status': status_text}
        if count is not None:
            payload['count'] = count
        if message is not None:
            payload['message'] = message
        if notification is not None:
            payload['notification'] = notification
        serializer = NotificationMutationResponseSerializer(payload)
        return Response(serializer.data, status=status_code)

    def get_queryset(self) -> QuerySet[Notification]:
        """
        Filtre les notifications par utilisateur authentifié.
        Exclut les notifications futures (scheduled_for > now).
        """
        is_read_param = self.request.query_params.get("is_read")
        filters = NotificationQueryFilters(
            is_read=is_read_param.lower() == "true" if is_read_param is not None else None,
            notification_type=self.request.query_params.get("type"),
        )
        return NotificationInboxApplicationService.get_user_notifications(self.request.user, filters)

    def get_serializer_class(self) -> type[NotificationListSerializer] | type[NotificationSerializer]:
        """
        Utilise un serializer léger pour la liste.
        """
        if self.action == 'list':
            return NotificationListSerializer
        if self.action == 'stats':
            return NotificationStatsSerializer
        if self.action == 'register_push_token':
            return PushTokenSerializer
        return NotificationSerializer

    @action(detail=True, methods=['post'])
    def mark_read(self, request: Request, pk: str | None = None) -> Response:
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
        try:
            updated_notification = NotificationInboxApplicationService.mark_notification_as_read(
                notification,
                request.user,
            )
        except NotificationOwnershipError as exc:
            return self._forbidden_response(str(exc))

        serializer = self.get_serializer(updated_notification)

        return self._build_mutation_response(
            status_text='marked as read',
            notification=serializer.data,
        )

    @action(
        detail=False,
        methods=['post'],
        throttle_classes=[NotificationBulkMutationThrottle],
    )
    def mark_all_read(self, request: Request) -> Response:
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
        count = NotificationInboxApplicationService.mark_all_notifications_as_read(request.user)

        return self._build_mutation_response(
            status_text='success',
            count=count,
            message=f'{count} notification(s) marquée(s) comme lue(s)',
        )

    def destroy(self, request: Request, pk: str | None = None) -> Response:
        """
        Supprime une notification.

        **DELETE** /api/notifications/{id}/
        """
        notification = self.get_object()
        try:
            NotificationInboxApplicationService.delete_notification(notification, request.user)
        except NotificationOwnershipError as exc:
            return self._forbidden_response(str(exc))

        return self._build_mutation_response(
            status_text='deleted',
            status_code=status.HTTP_204_NO_CONTENT,
        )

    @action(
        detail=False,
        methods=['post'],
        throttle_classes=[NotificationBulkMutationThrottle],
    )
    def delete_all_read(self, request: Request) -> Response:
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
        count = NotificationInboxApplicationService.delete_all_read_notifications(request.user)

        return self._build_mutation_response(
            status_text='success',
            count=count,
            message=f'{count} notification(s) supprimée(s)',
        )

    @action(detail=False, methods=['get'])
    def stats(self, request: Request) -> Response:
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
        data: NotificationStatsPayload = NotificationInboxApplicationService.get_notification_stats(
            request.user,
        )

        serializer = self.get_serializer(data)
        return Response(serializer.data)

    @action(
        detail=False,
        methods=['post'],
        throttle_classes=[NotificationPushTokenThrottle],
    )
    def register_push_token(self, request: Request) -> Response:
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
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated_data = cast(dict[str, Any], serializer.validated_data)
        token, created = NotificationInboxApplicationService.register_push_token(
            request.user,
            PushTokenRegistrationCommand(
                expo_push_token=validated_data['expo_push_token'],
                device_id=validated_data['device_id'],
                device_name=validated_data.get('device_name'),
                platform=validated_data.get('platform'),
            ),
        )

        response_serializer = self.get_serializer(token)

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )


@extend_schema_view(
    list=extend_schema(
        summary="Recuperer mes preferences de notification",
        responses={200: NotificationPreferenceSerializer},
    ),
    update=extend_schema(
        summary="Mettre a jour toutes mes preferences de notification",
        request=NotificationPreferenceSerializer,
        responses={200: NotificationPreferenceSerializer},
    ),
    partial_update=extend_schema(
        summary="Mettre a jour partiellement mes preferences de notification",
        request=NotificationPreferenceSerializer,
        responses={200: NotificationPreferenceSerializer},
    ),
)
class NotificationPreferenceViewSet(viewsets.GenericViewSet):
    """
    API endpoints pour les préférences de notifications.

    **Endpoints disponibles:**
    - GET  /api/notification-preferences/   - Récupérer préférences
    - PUT  /api/notification-preferences/   - Mettre à jour préférences
    - PATCH /api/notification-preferences/  - Mise à jour partielle
    """

    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferenceSerializer

    def _save_preferences(self, request: Request, *, partial: bool) -> Response:
        prefs = NotificationPreferenceApplicationService.get_or_create_preferences(request.user)
        serializer = self.get_serializer(
            prefs,
            data=request.data,
            partial=partial,
        )
        serializer.is_valid(raise_exception=True)
        updated_preferences = NotificationPreferenceApplicationService.update_preferences(
            prefs,
            cast(dict[str, Any], serializer.validated_data),
        )
        response_serializer = self.get_serializer(updated_preferences)
        return Response(response_serializer.data)

    def list(self, request: Request) -> Response:
        """
        Récupère les préférences de l'utilisateur.

        **GET** /api/notification-preferences/
        """
        prefs = NotificationPreferenceApplicationService.get_or_create_preferences(request.user)
        serializer = self.get_serializer(prefs)
        return Response(serializer.data)

    def update(self, request: Request) -> Response:
        """
        Met à jour les préférences de l'utilisateur (complet).

        **PUT** /api/notification-preferences/
        """
        return self._save_preferences(request, partial=False)

    def partial_update(self, request: Request) -> Response:
        """
        Met à jour partiellement les préférences de l'utilisateur.

        **PATCH** /api/notification-preferences/
        """
        return self._save_preferences(request, partial=True)
