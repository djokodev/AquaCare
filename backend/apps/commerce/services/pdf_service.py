"""
Service de generation de PDF pour les commandes.

Genere des bons de commande professionnels au format PDF
pour transmission aux prestataires MAVECAM.
"""
from importlib import metadata
import inspect
import logging

import pydyf
from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone
from weasyprint import HTML

logger = logging.getLogger(__name__)


def _ensure_pdf_dependencies():
    """
    Vérifie et corrige à chaud la compatibilité WeasyPrint / pydyf.

    Contexte : certaines distributions fournissent pydyf avec un __init__ sans
    arguments, ce qui déclenche l'erreur « PDF.__init__() takes 1 positional
    argument but 3 were given » lorsque WeasyPrint appelle pydyf.PDF(version, identifier).
    On applique un shim de compatibilité si nécessaire.
    """
    try:
        pydyf_version = metadata.version("pydyf")
    except metadata.PackageNotFoundError as exc:  # pragma: no cover - dépend du runtime
        raise RuntimeError(
            "Dépendance pydyf introuvable. Installez pydyf (>=0.11) et WeasyPrint."
        ) from exc

    sig = inspect.signature(pydyf.PDF.__init__)
    needs_patch = len(sig.parameters) == 1  # seulement `self`

    if needs_patch:
        original_pdf_class = pydyf.PDF

        class CompatiblePDF(original_pdf_class):  # type: ignore[misc]
            def __init__(self, version="1.7", identifier=None, *args, **kwargs):
                """
                Accept signature moderne (version, identifier) tout en réutilisant
                l'implémentation existante de pydyf.
                """
                super().__init__()
                # WeasyPrint 61.x consulte pdf.version plus loin
                self.version = (
                    version if isinstance(version, (bytes, bytearray)) else str(version).encode()
                )
                self.identifier = identifier

        pydyf.PDF = CompatiblePDF  # type: ignore[assignment]
        logger.warning(
            "Shim de compatibilité appliqué pour pydyf %s (signature héritée sans arguments).",
            pydyf_version,
        )


def generate_order_pdf(order):
    """
    Genere un PDF pour une commande.

    Args:
        order: Instance Order avec items

    Returns:
        bytes: Contenu PDF binaire

    Raises:
        Exception: Si generation echoue
    """
    _ensure_pdf_dependencies()

    try:
        # Preparer le contexte pour le template
        context = {
            'order': order,
            'items': order.items.select_related('product').all(),
            'user': order.user,
            'farm': order.farm_profile,
            'mavecam_color': '#059669',
            'generated_at': timezone.now(),
            'delivery_method_display': order.get_delivery_method_display(),
            'pickup_location_display': (
                order.get_pickup_location_display() if order.pickup_location else None
            ),
        }

        # Rendre le template HTML
        html_string = render_to_string('commerce/order_pdf.html', context)

        # Generer le PDF depuis HTML (base_url pour ressources locales/static)
        pdf_bytes = HTML(
            string=html_string,
            base_url=str(settings.BASE_DIR)
        ).write_pdf()

        logger.info(f"PDF genere pour commande {order.order_number}")
        return pdf_bytes

    except Exception as e:
        logger.error(f"Echec generation PDF commande {order.order_number}: {e}")
        raise
