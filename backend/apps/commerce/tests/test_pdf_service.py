"""
Tests de generation PDF pour les commandes.
"""
from decimal import Decimal
import inspect

import pytest

from apps.accounts.models import User, FarmProfile
from apps.commerce.models import Product, Order, OrderItem
from apps.commerce.services.pdf_service import (
    _ensure_pdf_dependencies,
    generate_order_pdf,
)
import pydyf


@pytest.mark.django_db
def test_generate_order_pdf_returns_bytes():
    """Verifie que la generation produit un PDF non vide."""
    _ensure_pdf_dependencies()

    user = User.objects.create_user(
        phone_number="+237600000001",
        password="pass1234",
        first_name="Test",
        last_name="User",
        age_group="26_35",
    )
    # Un profil ferme est crЄЄЉ par signal ; on le complЈЏte pour le test.
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
