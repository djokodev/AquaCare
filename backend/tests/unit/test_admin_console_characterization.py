"""Caracterisation des contrats admin a preserver pendant le lot 1."""

from importlib.metadata import version
from pathlib import Path

import jazzmin
import pytest
from django.contrib import admin
from django.urls import reverse


@pytest.mark.django_db
def test_existing_custom_admin_urls_are_preserved():
    """Les URLs publiees avant le lot 1 restent stables."""
    assert reverse("admin:admin_badge_counts") == "/admin/api/badge-counts/"
    assert reverse("admin:chat_support_inbox") == "/admin/chat/inbox/"


def test_installed_jazzmin_sidebar_contract():
    """Documente le contrat Jazzmin 3.0.1 utilise par la surcharge locale."""
    jazzmin_root = Path(jazzmin.__file__).resolve().parent
    base_template = (jazzmin_root / "templates/admin/base.html").read_text()

    assert version("django-jazzmin") == "3.0.1"
    assert "{% block sidebar %}" in base_template
    assert 'id="jazzy-sidebar"' in base_template
    assert 'data-widget="pushmenu"' in base_template
    assert 'data-widget="treeview"' in base_template


def test_existing_admin_models_remain_registered():
    """Le nouveau site admin ne doit pas perdre les inscriptions existantes."""
    registered_labels = {
        model._meta.label_lower for model in admin.site._registry
    }

    assert "accounts.user" in registered_labels
    assert "accounts.farmprofile" in registered_labels
    assert "aquaculture.productioncycle" in registered_labels
    assert "commerce.order" in registered_labels
    assert "chat.conversation" in registered_labels
