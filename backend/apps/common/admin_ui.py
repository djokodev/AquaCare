"""
Petits blocs HTML partagés par les écrans d'administration.

Toutes les couleurs passent par les classes « .aq-* » de admin_custom.css
(thème clair et sombre). Aucun style en ligne, aucune couleur en dur : un test
le vérifie sur les fichiers admin.
"""

from __future__ import annotations

from django.utils.html import format_html

TONES = {"ok", "warn", "danger", "info", "muted"}

EMPTY = format_html('<span class="aq-muted">{}</span>', "—")


def badge(label, tone: str = "muted"):
    """Pastille de statut : ok (vert), warn (orange), danger (rouge), info (bleu), muted."""
    if tone not in TONES:
        tone = "muted"
    return format_html('<span class="aq-badge aq-badge--{}">{}</span>', tone, label)


def link_button(url: str, label, *, strong: bool = False, danger: bool = False, new_tab: bool = False):
    """Petit bouton-lien pour les colonnes d'action des listes."""
    classes = "aq-link-btn"
    if strong:
        classes += " aq-link-btn--strong"
    if danger:
        classes += " aq-link-btn--danger"
    if new_tab:
        return format_html(
            '<a class="{}" href="{}" target="_blank" rel="noopener">{}</a>', classes, url, label
        )
    return format_html('<a class="{}" href="{}">{}</a>', classes, url, label)


def muted(text):
    return format_html('<span class="aq-muted">{}</span>', text)
