"""
Tests de generation PDF pour les commandes.
"""
import ctypes.util
import inspect
from datetime import datetime
from decimal import Decimal
from importlib import metadata
from types import SimpleNamespace
from unittest.mock import Mock, patch
from zoneinfo import ZoneInfo

import pydyf
import pytest
from accounts.models import User
from commerce.models import Order, OrderItem, Product
from commerce.services.pdf_service import (
    OrderDocumentService,
    _ensure_pdf_dependencies,
    generate_order_pdf,
)
from django.utils import timezone


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
        brand="dibaq",
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
        items=SimpleNamespace(all=lambda: []),
        pickup_location="",
        delivery_method="home",
        delivery_name="Test User",
        delivery_phone="+237600000001",
        delivery_region="Littoral",
        delivery_city="Douala",
        delivery_full_address="Douala",
        farm_name_snapshot="Ferme test",
        issuer_snapshot={},
        fulfilment_partner_snapshot={},
        document_schema_version="1.0",
        created_at=timezone.now(),
        production_cycle=None,
        get_pickup_location_display=lambda: "Ndokoti",
        subtotal=Decimal("0"), delivery_fee=Decimal("0"), total=Decimal("0"),
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


def _payload_order(*, phone="+237 699 000 001", delivery_method="pickup"):
    item = SimpleNamespace(
        product_brand_snapshot="dibaq",
        product_name="Snapshot Feed",
        product_species_snapshot="catfish",
        product_pellet_size_mm_snapshot=Decimal("3"),
        product_package_weight_kg_snapshot=None,
        quantity=2,
        unit_price=Decimal("18000"),
        line_total=Decimal("36000"),
    )
    return SimpleNamespace(
        order_number="ORD-SNAPSHOT-0001",
        items=SimpleNamespace(all=lambda: [item]),
        delivery_method=delivery_method,
        delivery_name="Amina Njoya",
        delivery_phone="+237699000001",
        delivery_region="littoral",
        delivery_city="Douala",
        delivery_full_address="Douala, Bonamoussadi",
        pickup_location="ndokoti",
        pickup_location_display_fr_snapshot="Marché Ndokoti figé",
        pickup_location_display_en_snapshot="Ndokoti Market frozen",
        farm_name_snapshot="Ferme figée",
        production_cycle_name_snapshot="Cycle figé",
        document_schema_version="1.0",
        issuer_snapshot={"name": "AquaCare", "phone": phone},
        fulfilment_partner_snapshot={
            "name": "MaveCameroun",
            "address": "Adresse figée",
            "hours_fr": "09:00–17:00",
            "hours_en": "9:00 AM–5:00 PM",
            "phones": ["+237 600 000 000"],
            "emails": ["contact@example.com"],
            "role_fr": "Ancien rôle",
            "role_en": "Legacy role",
        },
        created_at=datetime(2026, 7, 13, 10, 0, tzinfo=ZoneInfo("UTC")),
        production_cycle=SimpleNamespace(cycle_name="LIVE CYCLE MUST NOT APPEAR"),
        get_pickup_location_display=lambda: "LIVE PICKUP MUST NOT APPEAR",
        subtotal=Decimal("36000"),
        delivery_fee=Decimal("3000"),
        total=Decimal("39000"),
    )


def test_payload_uses_snapshots_and_issuer_phone_for_clarification():
    order = _payload_order(phone="+237 677 123 456")

    french = OrderDocumentService.build_payload(order, "fr")
    english = OrderDocumentService.build_payload(order, "en")

    assert french.order["cycle"] == "Cycle figé"
    assert french.delivery["pickup"] == "Marché Ndokoti figé"
    assert english.delivery["pickup"] == "Ndokoti Market frozen"
    assert french.lines[0]["product_details"] == "Silure (Catfish) · 3 mm"
    assert "+237 677 123 456" in french.labels["clarification"]
    assert "+237 677 123 456" in english.labels["clarification"]
    assert english.labels["clarification"].startswith("For any clarification")
    assert "LIVE CYCLE" not in french.order["cycle"]
    assert "LIVE PICKUP" not in french.delivery["pickup"]
    assert french.totals["weight"] == "Non renseigné"


def test_payload_localizes_species_and_dates_in_africa_douala():
    order = _payload_order(delivery_method="home")
    with timezone.override("Africa/Douala"):
        french = OrderDocumentService.build_payload(order, "fr")
        english = OrderDocumentService.build_payload(order, "en")

    assert french.order["issued_at"] == "13/07/2026 11:00"
    assert english.order["issued_at"] == "Jul 13, 2026 11:00 AM"
    assert french.lines[0]["product_details"] == "Silure (Catfish) · 3 mm"
    assert OrderDocumentService._display_species("mixed", "fr", "missing") == "Mixte"
    assert OrderDocumentService._display_species("mixed", "en", "missing") == "Mixed"


def test_rendered_html_hides_internal_metadata_and_contact_role():
    html = OrderDocumentService.render_html(_payload_order(phone="+237 655 444 333"), "fr")

    assert "Version documentaire" not in html
    assert "Ancien rôle" not in html
    assert "Partenaire de préparation et de livraison" not in html
    assert "Fulfilment and delivery partner" not in html
    assert "Adresse figée" not in html
    assert "09:00–17:00" not in html
    assert "PARTENAIRE OPÉRATIONNEL" not in html
    assert "PARTENAIRE" in html
    assert "Contact AquaCare" not in html
    assert "Pour toute clarification concernant cette commande, contactez AquaCare au +237 655 444 333." in html
    assert "AquaCare | ORD-SNAPSHOT-0001 | Page" in html
    assert "DESTINATAIRE" in html


def _document_line(
    line_id, *, brand="dibaq", name="Feed", species="tilapia", pellet=3, package=15
):
    return SimpleNamespace(
        id=line_id,
        product_brand_snapshot=brand,
        product_name=name,
        product_species_snapshot=species,
        product_pellet_size_mm_snapshot=pellet,
        product_package_weight_kg_snapshot=package,
        quantity=1,
        unit_price=Decimal("18000"),
        line_total=Decimal("18000"),
    )


def test_product_title_and_details_avoid_duplicate_or_empty_separators():
    order = _payload_order()
    order.items = SimpleNamespace(
        all=lambda: [
            _document_line("1", name="DIBAQ Feed 01", species="catfish", pellet=4),
            _document_line("2", name="Tilapia Grower 3 mm", pellet=3),
            _document_line("3", brand="", name="DIBAQ Feed 05", species="", pellet=None),
            _document_line("4", name=None, species="", pellet=None),
        ]
    )

    french = OrderDocumentService.build_payload(order, "fr")
    english = OrderDocumentService.build_payload(order, "en")

    by_title_fr = {line["product_title"]: line for line in french.lines}
    by_title_en = {line["product_title"]: line for line in english.lines}
    assert by_title_fr["DIBAQ Feed 01"]["product_details"] == "Silure (Catfish) · 4 mm"
    assert by_title_fr["DIBAQ · Tilapia Grower 3 mm"]["product_details"] == "Tilapia · 3 mm"
    assert "DIBAQ Feed 05" in by_title_fr
    assert "Non renseigné" in by_title_fr
    assert by_title_en["DIBAQ Feed 01"]["product_details"] == "Catfish · 4 mm"
    assert "Non renseigné · Non renseigné" not in str(french.lines)
    assert "Not provided · Not provided" not in str(english.lines)


def test_document_lines_are_sorted_by_business_criteria_not_uuid():
    order = _payload_order()
    order.items = SimpleNamespace(
        all=lambda: [
            _document_line("z", name="Catfish 6", species="catfish", pellet=6, package=15),
            _document_line("a", name="Tilapia 3", species="tilapia", pellet=3, package=20),
            _document_line("b", name="Tilapia 2", species="tilapia", pellet=2, package=15),
            _document_line("c", name="Tilapia 3 small bag", species="tilapia", pellet=3, package=15),
            _document_line("d", name="Legacy", species="", pellet=None, package=None),
        ]
    )

    payload = OrderDocumentService.build_payload(order, "fr")

    assert [line["product_title"] for line in payload.lines] == [
        "DIBAQ · Tilapia 2",
        "DIBAQ · Tilapia 3 small bag",
        "DIBAQ · Tilapia 3",
        "DIBAQ · Catfish 6",
        "DIBAQ · Legacy",
    ]


def test_document_measure_and_address_formatting_is_localized():
    assert OrderDocumentService._format_weight(1220, "fr", "Non renseigné") == "1 220 kg"
    assert OrderDocumentService._format_weight(1220, "en", "Not provided") == "1 220 kg"
    assert OrderDocumentService._format_pellet_size(Decimal("3.50"), "fr", "Non renseigné") == "3,5 mm"
    assert OrderDocumentService._format_pellet_size(Decimal("2.25"), "en", "Not provided") == "2.25 mm"
    assert OrderDocumentService._format_weight(None, "fr", "Non renseigné") == "Non renseigné"
    assert OrderDocumentService._display_address(
        "littoral, wouri, Douala, Bonamoussadi", "Non renseigné"
    ) == "Littoral, Wouri, Douala, Bonamoussadi"
    assert OrderDocumentService._display_address("PK 12, entrée rouge", "Non renseigné") == "PK 12, Entrée rouge"
