"""Translate known database constraints without disguising unrelated failures."""

from __future__ import annotations

import logging

from django.db import IntegrityError
from django.utils.translation import gettext_lazy as _

logger = logging.getLogger(__name__)


def _constraint_name(error: IntegrityError) -> str | None:
    cause = error.__cause__
    diagnostic = getattr(cause, 'diag', None)
    name = getattr(diagnostic, 'constraint_name', None)
    return str(name) if name else None


def translate_production_unit_integrity_error(error: IntegrityError) -> dict[str, str]:
    """Return a precise public error for constraints owned by production units.

    PostgreSQL exposes the constraint name through ``diag``. SQLite is only a
    local-test fallback and deliberately matches the narrow table/column text.
    Unknown constraints retain a generic conflict message and are logged.
    """
    name = _constraint_name(error)
    message = str(error).lower()
    if name == 'uniq_production_unit_name_farm_ci' or (
        name is None
        and ('uniq_production_unit_name_farm_ci' in message or (
            'unique constraint failed' in message
            and 'aquaculture_production_unit.name' in message
        ))
    ):
        return {'name': _('Une unité portant ce nom existe déjà dans cette ferme.')}
    if name in {'aquaculture_production_unit_client_uuid_key', 'aquaculture_production_unit_client_uuid_uniq'} or (
        name is None
        and 'unique constraint failed' in message
        and 'aquaculture_production_unit.client_uuid' in message
    ):
        return {'client_uuid': _('Cet UUID client est déjà associé à une autre unité.')}
    if name == 'unit_calibration_requires_tank_volume' or (
        name is None and 'unit_calibration_requires_tank_volume' in message
    ):
        return {'detail': _('Les données du bac de calibrage sont invalides.')}
    if name == 'uniq_active_allocation_per_unit' or (
        name is None and 'uniq_active_allocation_per_unit' in message
    ):
        return {'detail': _('Cette unité est déjà occupée par une allocation active.')}

    logger.warning(
        'Unhandled production-unit integrity constraint',
        extra={'constraint_name': name, 'error': str(error)},
    )
    return {'detail': _('Un conflit d’intégrité empêche cette opération. Réessayez.')}
