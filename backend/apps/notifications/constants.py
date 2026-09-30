"""
Constantes pour le système de notifications.

Périmètre produit volontairement réduit : seules les notifications utiles
au pisciculteur sont conservées (commandes et support). Les rappels de
nourrissage sont des alarmes locales gérées par l'application mobile.
"""

from django.utils.translation import gettext_lazy as _

NOTIFICATION_TYPES = [
    # ===== COMMERCE =====
    ('order_confirmed', _('Commande enregistrée')),
    ('order_delivered', _('Commande livrée')),
    ('order_ready_for_pickup', _('Commande prête au retrait')),
    # ===== SUPPORT =====
    ('new_message', _('Nouveau message')),
]

NOTIFICATION_CHANNELS = [
    ('in_app', _('In-app')),
    ('push', _('Push notification')),
]

NOTIFICATION_PRIORITIES = [
    ('low', _('Basse')),
    ('medium', _('Moyenne')),
    ('high', _('Haute')),
    ('urgent', _('Urgente')),
]

DEFAULT_CHANNELS_BY_TYPE = {
    'order_confirmed': ['in_app'],
    'order_delivered': ['in_app', 'push'],
    'order_ready_for_pickup': ['in_app', 'push'],
    'new_message': ['in_app', 'push'],
}

DEFAULT_PRIORITY_BY_TYPE = {
    'order_confirmed': 'medium',
    'order_delivered': 'high',
    'order_ready_for_pickup': 'high',
    'new_message': 'medium',
}
