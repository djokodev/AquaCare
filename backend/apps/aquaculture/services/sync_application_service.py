"""Use cases applicatifs de synchronisation offline aquaculture."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from rest_framework import status

from .sync_service import SyncService


@dataclass(frozen=True)
class SyncExecutionResult:
    """Resultat applicatif de synchronisation expose a la couche HTTP."""

    payload: dict[str, Any]
    status_code: int


class SyncApplicationService:
    """Use cases applicatifs exposes a l'endpoint de synchronisation."""

    @staticmethod
    def execute_sync(*, user, raw_payload: dict[str, Any]) -> SyncExecutionResult:
        """Orchestre une synchronisation offline complete."""
        from ..serializers import SyncRequestSerializer

        sync_payload = SyncApplicationService._normalize_payload(raw_payload)
        serializer = SyncRequestSerializer(data=sync_payload, context={'request': None})
        if not serializer.is_valid():
            return SyncExecutionResult(
                payload={
                    'status': 'error',
                    'errors': [{'type': 'validation', 'error': serializer.errors}],
                },
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        sync_result = SyncService.perform_full_sync(
            user=user,
            sync_data=serializer.validated_data,
        )
        return SyncExecutionResult(
            payload=sync_result,
            status_code=SyncApplicationService._resolve_status_code(sync_result["status"]),
        )

    @staticmethod
    def _normalize_payload(raw_payload: dict[str, Any]) -> dict[str, Any]:
        """Normalise le payload recu avant validation applicative."""
        sync_payload = dict(raw_payload)
        if "client_id" in sync_payload and "device_id" not in sync_payload:
            sync_payload["device_id"] = sync_payload["client_id"]
        return sync_payload

    @staticmethod
    def _build_validation_error_payload(validation_errors: list[str]) -> dict[str, Any]:
        """Construit une reponse stable pour les erreurs de validation sync."""
        return {
            "status": "error",
            "errors": [{"type": "validation", "error": error} for error in validation_errors],
        }

    @staticmethod
    def _resolve_status_code(sync_status: str) -> int:
        """Mappe le statut metier de sync vers un statut HTTP."""
        if sync_status == "error":
            return status.HTTP_500_INTERNAL_SERVER_ERROR
        if sync_status == "partial_success":
            return status.HTTP_207_MULTI_STATUS
        return status.HTTP_200_OK
