"""
Configuration Django Jazzmin pour AquaCare Admin.
Interface moderne avec controle d'acces RBAC.
"""

from django.utils.translation import gettext_lazy as _

# =============================================================================
# JAZZMIN SETTINGS - Configuration principale
# =============================================================================

JAZZMIN_SETTINGS = {
    # Branding
    "site_title": "AquaCare Admin",
    "site_header": "AquaCare",
    "site_brand": "AquaCare",
    "site_logo": None,
    "login_logo": None,
    "site_icon": None,
    "welcome_sign": _("Bienvenue sur AquaCare Administration"),
    "copyright": "AquaCare",

    # User display
    "user_avatar": None,

    # Search models
    "search_model": ["accounts.User", "accounts.FarmProfile"],

    # Top menu links
    "topmenu_links": [
        {"name": _("Accueil"), "url": "admin:index", "permissions": ["auth.view_user"]},
        {"name": _("Messagerie Support"), "url": "admin:chat_support_inbox", "permissions": ["chat.view_conversation"]},
        {"app": "accounts"},
    ],

    # Side menu configuration
    "show_sidebar": True,
    "navigation_expanded": True,
    "hide_apps": [],
    "hide_models": [],

    # Icons pour chaque app/model (FontAwesome 5)
    "icons": {
        # Auth
        "auth": "fas fa-users-cog",
        "auth.Group": "fas fa-layer-group",

        # Accounts
        "accounts": "fas fa-user-circle",
        "accounts.User": "fas fa-user",
        "accounts.FarmProfile": "fas fa-warehouse",

        # Aquaculture
        "aquaculture": "fas fa-fish",
        "aquaculture.ProductionCycle": "fas fa-sync-alt",
        "aquaculture.CycleLog": "fas fa-clipboard-list",
        "aquaculture.FeedingPlan": "fas fa-utensils",
        "aquaculture.SanitaryLog": "fas fa-notes-medical",
        "aquaculture.NutritionalGuide": "fas fa-book-open",
        "aquaculture.CycleMetrics": "fas fa-chart-line",

        # Commerce
        "commerce": "fas fa-shopping-cart",
        "commerce.Product": "fas fa-box",
        "commerce.Order": "fas fa-receipt",
        "commerce.OrderItem": "fas fa-list",

        # Notifications
        "notifications": "fas fa-bell",
        "notifications.Notification": "fas fa-envelope",
        "notifications.NotificationPreference": "fas fa-sliders-h",
        "notifications.PushToken": "fas fa-mobile-alt",

        # Chat / Support Client
        "chat": "fas fa-headset",
        "chat.Conversation": "fas fa-comment-dots",
        "chat.Message": "fas fa-comment",

        # Tâches périodiques (django-celery-beat)
        "django_celery_beat": "fas fa-clock",
        "django_celery_beat.PeriodicTask": "fas fa-tasks",
        "django_celery_beat.IntervalSchedule": "fas fa-stopwatch",
        "django_celery_beat.CrontabSchedule": "fas fa-calendar-alt",
        "django_celery_beat.SolarSchedule": "fas fa-sun",
        "django_celery_beat.ClockedSchedule": "fas fa-history",

        # Token Blacklist (simplejwt)
        "token_blacklist": "fas fa-ban",
        "token_blacklist.BlacklistedToken": "fas fa-user-slash",
        "token_blacklist.OutstandingToken": "fas fa-key",
    },

    # Ordre du menu lateral
    "order_with_respect_to": [
        "accounts",
        "accounts.User",
        "accounts.FarmProfile",
        "aquaculture",
        "commerce",
        "notifications",
        "chat",
        "auth",
        "django_celery_beat",
        "token_blacklist",
    ],

    # Custom links par app
    "custom_links": {
        "chat": [{
            "name": "Support Inbox",
            "url": "admin:chat_support_inbox",
            "icon": "fas fa-inbox",
            "permissions": ["chat.view_conversation"],
        }],
    },

    # Change form layout
    "changeform_format": "horizontal_tabs",
    "changeform_format_overrides": {
        "accounts.user": "horizontal_tabs",
        "aquaculture.productioncycle": "horizontal_tabs",
    },

    # Language chooser (FR/EN)
    "language_chooser": True,

    # Related modal
    "related_modal_active": True,

    # Custom CSS/JS
    "custom_css": "css/admin_custom.css",
    "custom_js": "js/admin_translations.js?v=3",

    # UI builder (desactiver en production)
    "show_ui_builder": False,
}

# =============================================================================
# JAZZMIN UI TWEAKS - Theme vert AquaCare
# =============================================================================

JAZZMIN_UI_TWEAKS = {
    "navbar_small_text": False,
    "footer_small_text": False,
    "body_small_text": False,
    "brand_small_text": False,
    "brand_colour": "navbar-success",  # Vert AquaCare
    "accent": "accent-success",
    "navbar": "navbar-success navbar-dark",  # Navbar verte
    "no_navbar_border": False,
    "navbar_fixed": True,
    "layout_boxed": False,
    "footer_fixed": False,
    "sidebar_fixed": True,
    "sidebar": "sidebar-dark-success",  # Sidebar verte
    "sidebar_nav_small_text": False,
    "sidebar_disable_expand": False,
    "sidebar_nav_child_indent": True,
    "sidebar_nav_compact_style": False,
    "sidebar_nav_legacy_style": False,
    "sidebar_nav_flat_style": False,
    "theme": "default",
    "dark_mode_theme": "darkly",
    "button_classes": {
        "primary": "btn-primary",
        "secondary": "btn-secondary",
        "info": "btn-info",
        "warning": "btn-warning",
        "danger": "btn-danger",
        "success": "btn-success",
    },
}
