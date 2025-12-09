"""
Service de generation de PDF pour les commandes.

Genere des bons de commande professionnels au format PDF
pour transmission aux prestataires MAVECAM.
"""
from weasyprint import HTML
from django.template.loader import render_to_string
from django.utils import timezone
import logging

logger = logging.getLogger(__name__)


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

        # Generer le PDF depuis HTML
        pdf_bytes = HTML(string=html_string).write_pdf()

        logger.info(f"PDF genere pour commande {order.order_number}")
        return pdf_bytes

    except Exception as e:
        logger.error(f"Echec generation PDF commande {order.order_number}: {e}")
        raise
