"""Immutable, bilingual operational order-document generation."""

from __future__ import annotations

import base64
import inspect
import logging
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from importlib import metadata
from pathlib import Path
from typing import Any

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone

logger = logging.getLogger(__name__)

SUPPORTED_ORDER_DOCUMENT_LANGUAGES = frozenset({"fr", "en"})
DOCUMENT_SCHEMA_VERSION = "1.0"
_pdf_patched = False


@dataclass(frozen=True)
class OrderDocumentPayload:
    """Template-ready immutable representation of an order."""

    language_code: str
    labels: dict[str, str]
    order: dict[str, Any]
    issuer: dict[str, Any]
    partner: dict[str, Any]
    customer: dict[str, Any]
    delivery: dict[str, Any]
    lines: list[dict[str, Any]]
    totals: dict[str, Any]
    generated_at: str
    logo_data_uri: str | None


def _ensure_pdf_dependencies() -> None:
    """Apply the existing WeasyPrint/pydyf compatibility shim once."""
    global _pdf_patched
    if _pdf_patched:
        return
    import pydyf

    try:
        metadata.version("pydyf")
    except metadata.PackageNotFoundError as exc:  # pragma: no cover - runtime dependency
        raise RuntimeError("Dépendance pydyf introuvable. Installez pydyf et WeasyPrint.") from exc
    if len(inspect.signature(pydyf.PDF.__init__).parameters) == 1:
        original_pdf = pydyf.PDF

        class CompatiblePDF(original_pdf):  # type: ignore[misc]
            def __init__(
                self, version: str = "1.7", identifier: bytes | None = None, *args: Any, **kwargs: Any
            ) -> None:
                super().__init__()
                self.version = version.encode() if isinstance(version, str) else version
                self.identifier = identifier

        pydyf.PDF = CompatiblePDF  # type: ignore[assignment]
    if hasattr(pydyf.Stream, "set_text_matrix"):
        pydyf.Stream.text_matrix = pydyf.Stream.set_text_matrix
    if hasattr(pydyf.Stream, "set_matrix"):
        pydyf.Stream.transform = pydyf.Stream.set_matrix
    _pdf_patched = True


class OrderDocumentService:
    """Build and render order documents without reading live customer or product data."""

    _LABELS = {
        "fr": {
            "title": "Bon de commande",
            "order_number": "Numéro de commande",
            "issue_date": "Date d’émission",
            "cycle": "Cycle concerné",
            "issued_by": "Émis par",
            "operational_partner": "PARTENAIRE",
            "customer": "DESTINATAIRE",
            "delivery_information": "Informations de livraison",
            "delivery_method": "Mode de livraison",
            "region": "Région",
            "city": "Ville",
            "address": "Adresse complète",
            "pickup_location": "Point de retrait",
            "ordered_items": "Articles commandés",
            "brand": "Marque",
            "product": "Produit",
            "species": "Espèce",
            "pellet_size": "Granulométrie",
            "package": "Conditionnement",
            "quantity": "Quantité",
            "line_weight": "Poids total",
            "unit_price": "Prix unitaire",
            "amount": "Montant",
            "summary": "Récapitulatif",
            "total_bags": "Nombre total de sacs",
            "total_weight": "Poids total à livrer",
            "subtotal": "Sous-total",
            "delivery_fee": "Frais de livraison",
            "grand_total": "Total général",
            "operational_note": "Note opérationnelle",
            "page": "Page",
            "not_provided": "Non renseigné",
            "home": "Livraison à domicile",
            "pickup": "Retrait en point de vente",
            "kg": "kg",
            "bags": "sacs",
            "bag": "sac",
        },
        "en": {
            "title": "Purchase order",
            "order_number": "Order number",
            "issue_date": "Issue date",
            "cycle": "Related production cycle",
            "issued_by": "Issued by",
            "operational_partner": "PARTNER",
            "customer": "DELIVERY RECIPIENT",
            "delivery_information": "Delivery information",
            "delivery_method": "Delivery method",
            "region": "Region",
            "city": "City",
            "address": "Full address",
            "pickup_location": "Pickup location",
            "ordered_items": "Ordered items",
            "brand": "Brand",
            "product": "Product",
            "species": "Species",
            "pellet_size": "Pellet size",
            "package": "Package",
            "quantity": "Quantity",
            "line_weight": "Total weight",
            "unit_price": "Unit price",
            "amount": "Amount",
            "summary": "Summary",
            "total_bags": "Total bags",
            "total_weight": "Total weight to deliver",
            "subtotal": "Subtotal",
            "delivery_fee": "Delivery fee",
            "grand_total": "Grand total",
            "operational_note": "Operational note",
            "page": "Page",
            "not_provided": "Not provided",
            "home": "Home delivery",
            "pickup": "Pickup at sales point",
            "kg": "kg",
            "bags": "bags",
            "bag": "bag",
        },
    }

    @classmethod
    def build_payload(
        cls, order: Any, language_code: str = "fr", generated_at: datetime | None = None
    ) -> OrderDocumentPayload:
        if language_code not in SUPPORTED_ORDER_DOCUMENT_LANGUAGES:
            raise ValueError("Unsupported order document language")
        labels = dict(cls._LABELS[language_code])
        missing = labels["not_provided"]
        generated_at = generated_at or timezone.now()
        lines = []
        total_bags = 0
        total_weight = Decimal("0")
        has_unknown_weight = False
        for item in sorted(order.items.all(), key=cls._line_sort_key):
            package_weight = getattr(item, "product_package_weight_kg_snapshot", None)
            line_weight = Decimal(package_weight) * item.quantity if package_weight else None
            total_bags += item.quantity
            if line_weight is None:
                has_unknown_weight = True
            else:
                total_weight += line_weight
            species_snapshot = getattr(item, "product_species_snapshot", "")
            pellet_snapshot = getattr(item, "product_pellet_size_mm_snapshot", None)
            lines.append({
                "product_title": cls._product_title(
                    getattr(item, "product_brand_snapshot", ""), item.product_name, missing
                ),
                "product_details": cls._product_details(
                    species_snapshot, pellet_snapshot, language_code, missing
                ),
                "package_weight": cls._format_weight(package_weight, language_code, missing),
                "quantity": item.quantity,
                "line_weight": cls._format_weight(line_weight, language_code, missing),
                "unit_price": cls._format_money(item.unit_price),
                "line_total": cls._format_money(item.line_total),
            })
        partner = dict(order.fulfilment_partner_snapshot or {})
        issuer = dict(order.issuer_snapshot or {})
        issuer_phone = cls._format_phone(issuer.get("phone"), missing)
        labels["clarification"] = (
            f"Pour toute clarification concernant cette commande, contactez AquaCare au {issuer_phone}."
            if language_code == "fr"
            else f"For any clarification regarding this order, contact AquaCare at {issuer_phone}."
        )
        return OrderDocumentPayload(
            language_code=language_code,
            labels=labels,
            order={
                "number": order.order_number,
                "issued_at": cls._date(order.created_at, language_code),
                "cycle": cls._value(getattr(order, "production_cycle_name_snapshot", ""), missing),
                "has_cycle": bool(getattr(order, "production_cycle_name_snapshot", "")),
                "schema_version": getattr(order, "document_schema_version", None) or DOCUMENT_SCHEMA_VERSION,
            },
            issuer={"name": cls._value(issuer.get("name"), missing), "phone": issuer_phone},
            partner={
                "name": cls._value(partner.get("name"), missing),
                "address": cls._value(partner.get("address"), missing),
                "hours": cls._value(partner.get(f"hours_{language_code}"), missing),
                "phones": partner.get("phones") or [missing],
                "emails": partner.get("emails") or [missing],
            },
            customer={
                "name": cls._value(order.delivery_name, missing),
                "phone": cls._format_phone(order.delivery_phone, missing),
                "farm": cls._value(order.farm_name_snapshot, missing),
            },
            delivery={
                "method": labels.get(order.delivery_method, missing),
                "region": cls._display_location_value(order.delivery_region, missing),
                "city": cls._display_location_value(order.delivery_city, missing),
                "address": cls._display_address(order.delivery_full_address, missing),
                "pickup": cls._value(
                    getattr(order, f"pickup_location_display_{language_code}_snapshot", ""), missing
                ),
                "is_pickup": order.delivery_method == "pickup",
            },
            lines=lines,
            totals={
                "bags": total_bags,
                "weight": cls._format_weight(
                    None if has_unknown_weight else total_weight, language_code, missing
                ),
                "bags_display": f"{total_bags} {labels['bag'] if total_bags == 1 else labels['bags']}",
                "subtotal": cls._format_money(order.subtotal),
                "delivery_fee": cls._format_money(order.delivery_fee),
                "total": cls._format_money(order.total),
            },
            generated_at=cls._date(generated_at, language_code),
            logo_data_uri=cls._logo_data_uri(),
        )

    @staticmethod
    def _value(value: Any, missing: str) -> str:
        return str(value).strip() if value is not None and str(value).strip() else missing

    @staticmethod
    def _line_sort_key(item: Any) -> tuple[Any, ...]:
        species = str(getattr(item, "product_species_snapshot", "") or "").lower()
        species_rank = {"tilapia": 0, "catfish": 1, "mixed": 2}.get(species, 99)
        pellet = OrderDocumentService._decimal_or_none(
            getattr(item, "product_pellet_size_mm_snapshot", None)
        )
        package = OrderDocumentService._decimal_or_none(
            getattr(item, "product_package_weight_kg_snapshot", None)
        )
        return (
            species_rank,
            species == "",
            pellet is None,
            pellet if pellet is not None else Decimal("0"),
            package is None,
            package if package is not None else Decimal("0"),
            str(getattr(item, "product_name", "") or "").casefold(),
            str(getattr(item, "id", "") or ""),
        )

    @staticmethod
    def _decimal_or_none(value: Any) -> Decimal | None:
        if value in (None, ""):
            return None
        try:
            return Decimal(str(value))
        except (ArithmeticError, ValueError):
            return None

    @staticmethod
    def _format_measure(value: Any, unit: str, language_code: str, missing: str) -> str:
        decimal_value = OrderDocumentService._decimal_or_none(value)
        if decimal_value is None or decimal_value == 0:
            return missing
        raw = format(decimal_value.normalize(), "f")
        integer, _, fraction = raw.partition(".")
        integer = f"{int(integer):,}".replace(",", " ")
        if fraction:
            separator = "," if language_code == "fr" else "."
            raw_number = f"{integer}{separator}{fraction.rstrip('0')}"
        else:
            raw_number = integer
        return f"{raw_number} {unit}"

    @classmethod
    def _format_weight(cls, value: Any, language_code: str, missing: str) -> str:
        return cls._format_measure(value, "kg", language_code, missing)

    @classmethod
    def _format_pellet_size(cls, value: Any, language_code: str, missing: str) -> str:
        return cls._format_measure(value, "mm", language_code, missing)

    @staticmethod
    def _display_catalog_value(value: Any, missing: str) -> str:
        raw = OrderDocumentService._value(value, missing)
        return raw.upper() if raw.lower() == "dibaq" else raw.capitalize() if raw in {"tilapia", "catfish"} else raw

    @staticmethod
    def _display_species(value: Any, language_code: str, missing: str) -> str:
        return {
            "fr": {"tilapia": "Tilapia", "catfish": "Silure (Catfish)", "mixed": "Mixte"},
            "en": {"tilapia": "Tilapia", "catfish": "Catfish", "mixed": "Mixed"},
        }[language_code].get(str(value).lower(), missing)

    @classmethod
    def _product_title(cls, brand: Any, name: Any, missing: str) -> str:
        product_name = str(name).strip() if name is not None and str(name).strip() else ""
        if not product_name:
            return missing
        brand_name = str(brand).strip() if brand is not None and str(brand).strip() else ""
        if not brand_name:
            return product_name
        brand_display = cls._display_catalog_value(brand_name, missing)
        if product_name.casefold().startswith(brand_name.casefold()) or product_name.casefold().startswith(
            brand_display.casefold()
        ):
            return product_name
        return f"{brand_display} · {product_name}"

    @classmethod
    def _product_details(
        cls, species: Any, pellet_size: Any, language_code: str, missing: str
    ) -> str:
        values = []
        if species not in (None, ""):
            values.append(cls._display_species(species, language_code, missing))
        if pellet_size not in (None, ""):
            values.append(cls._format_pellet_size(pellet_size, language_code, missing))
        values = [value for value in values if value != missing]
        return " · ".join(values) or missing

    @staticmethod
    def _display_location_value(value: Any, missing: str) -> str:
        raw = OrderDocumentService._value(value, missing)
        return raw.capitalize() if raw.islower() and raw != missing else raw

    @staticmethod
    def _display_address(value: Any, missing: str) -> str:
        raw = str(value).strip() if value is not None else ""
        if not raw:
            return missing
        segments = [segment.strip() for segment in raw.split(",") if segment.strip()]
        normalized = [segment.capitalize() if segment.islower() else segment for segment in segments]
        return ", ".join(normalized) or missing

    @staticmethod
    def _format_phone(value: Any, missing: str) -> str:
        raw = OrderDocumentService._value(value, missing)
        digits = "".join(char for char in raw if char.isdigit())
        if digits.startswith("237") and len(digits) == 12:
            return f"+237 {digits[3:6]} {digits[6:9]} {digits[9:]}"
        return raw

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return f"{value:,.0f} FCFA".replace(",", " ")

    @staticmethod
    def _date(value: datetime, language_code: str) -> str:
        local_value = timezone.localtime(value)
        if language_code == "fr":
            return local_value.strftime("%d/%m/%Y %H:%M")
        return local_value.strftime("%b %d, %Y %I:%M %p")

    @staticmethod
    def _logo_data_uri() -> str | None:
        logo = Path(settings.BASE_DIR) / "apps/aquaculture/static/aquaculture/images/logo.png"
        if not logo.is_file():
            logger.warning("AquaCare order document logo is unavailable")
            return None
        return "data:image/png;base64," + base64.b64encode(logo.read_bytes()).decode("ascii")

    @classmethod
    def render_html(cls, order: Any, language_code: str = "fr") -> str:
        return render_to_string("commerce/order_pdf.html", {"document": cls.build_payload(order, language_code)})

    @classmethod
    def generate_pdf(cls, order: Any, language_code: str = "fr") -> bytes:
        from weasyprint import HTML

        _ensure_pdf_dependencies()
        try:
            return HTML(string=cls.render_html(order, language_code), base_url=str(settings.BASE_DIR)).write_pdf()
        except Exception:
            logger.error("Order document generation failed for %s", getattr(order, "order_number", "unknown"))
            raise

    @staticmethod
    def filename(order: Any, language_code: str) -> str:
        prefix = "bon-commande" if language_code == "fr" else "purchase-order"
        return f"{prefix}-AquaCare-{order.order_number}-{language_code}.pdf"


def generate_order_pdf(order: Any, language_code: str = "fr") -> bytes:
    """Backward-compatible order PDF entry point."""
    return OrderDocumentService.generate_pdf(order, language_code)
