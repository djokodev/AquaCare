"""
Tests de generation PDF pour les commandes.
"""
import ctypes.util
import inspect
from decimal import Decimal
from importlib import metadata
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pydyf
import pytest
from accounts.models import User
from commerce.models import Order, OrderItem, Product
from commerce.services.pdf_service import (
    _ensure_pdf_dependencies,
    generate_order_pdf,
)


def _weasyprint_runtime_available() -> bool:
    """Retourne True si les dépendances natives WeasyPrint sont présentes."""
    # Sur macOS/Linux de dev, la lib peut être absente; on skip explicitement.
    return bool(ctypes.util.find_library("gobject-2.0"))


@pytest.mark.django_db
def test_generate_order_pdf_returns_bytes():
    """Verifie que la generation produit un PDF non vide."""
    if not _weasyprint_runtime_available():
        pytest.skip(
            "WeasyPrint runtime natif non disponible (gobject-2.0). "
            "Installez les dépendances système pour exécuter ce test."
        )
    _ensure_pdf_dependencies()

    user = User.objects.create_user(
        phone_number="+237600000001",
        password="pass1234",
        first_name="Test",
        last_name="User",
        age_group="26_35",
    )
    # Un profil ferme est créé par signal ; on le complète pour le test.
    farm = user.farm_profile
    farm.farm_name = "Ferme Test"
    farm.total_ponds = 2
    farm.save()
    product = Product.objects.create(
        name="ALLER AQUA TILAPIA 3MM 20KG",
        brand="aller_aqua",
        species="tilapia",
        phase="grossissement",
        pellet_size_mm=Decimal("3.0"),
        protein_percentage=32,
        lipid_percentage=10,
        package_weight_kg=Decimal("20.0"),
        price_per_package=Decimal("19500.00"),
    )
    order = Order.objects.create(
        order_number="ORD-TEST-0001",
        user=user,
        farm_profile=farm,
        delivery_method="home",
        pickup_location="",
        delivery_name="Test User",
        delivery_phone="+237600000001",
        delivery_region="Littoral",
        delivery_city="Douala",
        delivery_full_address="Douala, Bonamoussadi",
        subtotal=Decimal("19500.00"),
        delivery_fee=Decimal("0.00"),
        total=Decimal("19500.00"),
    )
    OrderItem.objects.create(
        order=order,
        product=product,
        product_name=product.name,
        unit_price=product.price_per_package,
        quantity=1,
        line_total=product.price_per_package,
    )

    pdf_bytes = generate_order_pdf(order)

    assert isinstance(pdf_bytes, (bytes, bytearray))
    # on s'assure que le PDF contient au moins l'en-tête minimal
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500


def test_ensure_pdf_dependencies_patches_legacy_signature(monkeypatch):
    """
    Vérifie que le shim est appliqué lorsque pydyf.PDF n'accepte que `self`.
    """
    import commerce.services.pdf_service as pdf_module

    # Reset the global guard so the function actually runs (not short-circuits)
    monkeypatch.setattr(pdf_module, "_pdf_patched", False)

    class LegacyPDF:
        def __init__(self):
            pass

    monkeypatch.setattr(pydyf, "PDF", LegacyPDF)

    _ensure_pdf_dependencies()

    signature = inspect.signature(pydyf.PDF.__init__)
    # Après patch, la signature doit accepter des arguments supplémentaires
    assert len(signature.parameters) >= 2 or any(
        param.kind in (param.VAR_POSITIONAL, param.VAR_KEYWORD)
        for param in signature.parameters.values()
    )


def test_ensure_pdf_dependencies_raises_when_pydyf_is_missing(monkeypatch):
    import commerce.services.pdf_service as pdf_module

    monkeypatch.setattr(pdf_module, "_pdf_patched", False)
    monkeypatch.setattr(
        pdf_module.metadata,
        "version",
        Mock(side_effect=metadata.PackageNotFoundError("pydyf")),
    )

    with pytest.raises(RuntimeError, match="pydyf introuvable"):
        _ensure_pdf_dependencies()


def test_generate_order_pdf_logs_and_reraises_on_failure(monkeypatch):
    import commerce.services.pdf_service as pdf_module

    order = SimpleNamespace(
        order_number="ORD-FAIL-0001",
        items=SimpleNamespace(select_related=lambda *_args, **_kwargs: SimpleNamespace(all=lambda: [])),
        user=SimpleNamespace(),
        farm_profile=SimpleNamespace(),
        pickup_location="",
        get_delivery_method_display=lambda: "Livraison à domicile",
        get_pickup_location_display=lambda: "Ndokoti",
    )

    html_instance = Mock()
    html_instance.write_pdf.side_effect = RuntimeError("boom")
    html_class = Mock(return_value=html_instance)

    monkeypatch.setattr(pdf_module, "_ensure_pdf_dependencies", Mock())

    with patch.dict("sys.modules", {"weasyprint": SimpleNamespace(HTML=html_class)}):
        with patch.object(pdf_module, "render_to_string", return_value="<html></html>"):
            with patch.object(pdf_module.logger, "error") as logger_error:
                with pytest.raises(RuntimeError, match="boom"):
                    generate_order_pdf(order)

    logger_error.assert_called_once()
