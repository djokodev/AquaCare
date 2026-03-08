"""
Tests unitaires pour BaseService.
"""

from decimal import Decimal
from unittest.mock import patch

import pytest
from aquaculture.services.base import BaseService


class TestBaseServiceLogOperation:
    def test_logs_with_requested_level_and_details(self):
        with patch('aquaculture.services.base.logger.warning') as mock_warning:
            BaseService.log_operation(
                'sync_cycle',
                details={'cycle_id': 'abc'},
                level='warning',
            )

        mock_warning.assert_called_once_with("[AquacultureService] sync_cycle - {'cycle_id': 'abc'}")

    def test_falls_back_to_info_for_unknown_level(self):
        with patch('aquaculture.services.base.logger.info') as mock_info:
            BaseService.log_operation('fallback-log', level='trace')

        mock_info.assert_called_once_with('[AquacultureService] fallback-log')


class TestBaseServiceValidateRequiredFields:
    def test_raises_with_context_when_field_is_missing(self):
        with pytest.raises(ValueError, match='Champs requis manquants pour creation cycle: species'):
            BaseService.validate_required_fields(
                {'cycle_name': 'Cycle A'},
                ['cycle_name', 'species'],
                context='creation cycle',
            )

    def test_raises_when_field_is_none(self):
        with pytest.raises(ValueError, match='pond_identifier'):
            BaseService.validate_required_fields(
                {'cycle_name': 'Cycle A', 'pond_identifier': None},
                ['cycle_name', 'pond_identifier'],
            )


class TestBaseServiceSafeDivide:
    def test_returns_division_result_for_valid_values(self):
        result = BaseService.safe_divide(Decimal('9'), Decimal('3'))

        assert result == 3.0

    @pytest.mark.parametrize(
        ('numerator', 'denominator', 'default'),
        [
            (10, 0, 0.0),
            (10, None, 1.5),
            ('bad', 2, 7.0),
        ],
    )
    def test_returns_default_for_invalid_divisions(self, numerator, denominator, default):
        result = BaseService.safe_divide(numerator, denominator, default=default)

        assert result == default
