from __future__ import annotations

import logging

import pytest
from commerce.services.base import BaseCommerceService


class TestBaseCommerceService:
    def test_log_operation_uses_expected_log_level(self, caplog) -> None:
        with caplog.at_level(logging.INFO):
            BaseCommerceService.log_operation("create_order", {"order_id": "123"})
            BaseCommerceService.log_operation("warn_order", {"order_id": "456"}, level="warning")
            BaseCommerceService.log_operation("fail_order", {"order_id": "789"}, level="error")

        assert "[Commerce] create_order - {'order_id': '123'}" in caplog.text
        assert "[Commerce] warn_order - {'order_id': '456'}" in caplog.text
        assert "[Commerce] fail_order - {'order_id': '789'}" in caplog.text

    def test_validate_required_fields_accepts_complete_payload(self) -> None:
        BaseCommerceService.validate_required_fields(
            {"name": "Produit", "quantity": 2, "region": ""},
            ["name", "quantity", "region"],
        )

    @pytest.mark.parametrize(
        ("payload", "required_fields", "missing_field"),
        [
            ({}, ["name"], "name"),
            ({"name": None}, ["name"], "name"),
            ({"name": "Produit"}, ["name", "quantity"], "quantity"),
        ],
    )
    def test_validate_required_fields_raises_for_missing_values(
        self,
        payload: dict[str, object],
        required_fields: list[str],
        missing_field: str,
    ) -> None:
        with pytest.raises(ValueError, match=missing_field):
            BaseCommerceService.validate_required_fields(payload, required_fields)
