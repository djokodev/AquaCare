"""
Constantes pour le système de notifications.
Types de notifications extensibles pour tous les modules.
"""

from django.utils.translation import gettext_lazy as _


# Types de notifications par module
NOTIFICATION_TYPES = [
    # ===== AQUACULTURE =====
    ('feeding_reminder', _('Rappel nourrissage')),
    ('sampling_reminder', _('Rappel échantillonnage')),
    ('treatment_reminder', _('Rappel traitement')),
    ('cycle_milestone', _('Étape du cycle')),
    ('mortality_alert', _('Alerte mortalité')),
    ('growth_alert', _('Alerte croissance')),
    ('water_quality_alert', _('Alerte qualité eau')),
    ('harvest_reminder', _('Rappel récolte')),
    ('alert', _('Alerte générale')),

    # ===== COMMERCE =====
    ('order_confirmed', _('Commande confirmée')),
    ('order_shipped', _('Commande expédiée')),
    ('order_delivered', _('Commande livrée')),
    ('order_cancelled', _('Commande annulée')),
    ('payment_received', _('Paiement reçu')),
    ('delivery_scheduled', _('Livraison programmée')),
    ('product_recommendation', _('Recommandation produit')),
    ('low_stock_alert', _('Stock faible')),
    ('price_drop', _('Baisse de prix')),

    # ===== SUPPORT (futur) =====
    ('ticket_created', _('Ticket créé')),
    ('ticket_reply', _('Réponse ticket')),
    ('ticket_resolved', _('Ticket résolu')),
    ('ticket_reopened', _('Ticket réouvert')),
    ('ticket_assigned', _('Ticket assigné')),

    # ===== CHAT (futur) =====
    ('new_message', _('Nouveau message')),
    ('message_reply', _('Réponse message')),
    ('mention', _('Mention')),
    ('chat_invitation', _('Invitation chat')),
    ('group_created', _('Groupe créé')),

    # ===== SYSTEM =====
    ('system_update', _('Mise à jour système')),
    ('account_security', _('Sécurité compte')),
    ('maintenance', _('Maintenance')),
    ('welcome', _('Bienvenue')),
    ('password_reset', _('Réinitialisation mot de passe')),
    ('email_verification', _('Vérification email')),
]

# Canaux de notification disponibles
NOTIFICATION_CHANNELS = [
    ('in_app', _('In-app')),
    ('email', _('Email')),
    ('push', _('Push notification')),
    ('sms', _('SMS')),  # Futur
]

# Fréquences d'email
EMAIL_FREQUENCIES = [
    ('instant', _('Instant')),
    ('daily', _('Quotidien (résumé)')),
    ('weekly', _('Hebdomadaire (résumé)')),
    ('never', _('Jamais')),
]

# Priorités des notifications (pour futur tri)
NOTIFICATION_PRIORITIES = [
    ('low', _('Basse')),
    ('medium', _('Moyenne')),
    ('high', _('Haute')),
    ('urgent', _('Urgente')),
]

# Mapping types → canaux recommandés par défaut
DEFAULT_CHANNELS_BY_TYPE = {
    # Aquaculture - alertes importantes
    'mortality_alert': ['in_app', 'push', 'email'],
    'water_quality_alert': ['in_app', 'push'],
    'feeding_reminder': ['in_app'],
    'sampling_reminder': ['in_app'],
    'cycle_milestone': ['in_app'],

    # Commerce - confirmations importantes
    'order_confirmed': ['in_app', 'email'],
    'order_shipped': ['in_app', 'push'],
    'payment_received': ['in_app', 'email'],
    'order_cancelled': ['in_app', 'email'],

    # Support - interactions
    'ticket_reply': ['in_app', 'push', 'email'],
    'ticket_resolved': ['in_app', 'email'],

    # Chat - temps réel
    'new_message': ['in_app', 'push'],
    'mention': ['in_app', 'push'],

    # System - important
    'account_security': ['in_app', 'email'],
    'system_update': ['in_app'],
    'welcome': ['in_app', 'email'],
}

# Mapping types → priorités recommandées
DEFAULT_PRIORITY_BY_TYPE = {
    'mortality_alert': 'urgent',
    'water_quality_alert': 'high',
    'account_security': 'high',
    'order_confirmed': 'medium',
    'new_message': 'medium',
    'system_update': 'low',
}
