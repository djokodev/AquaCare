"""
Tests unitaires pour la configuration projet aquacare_api.
"""

from __future__ import annotations

import json
from importlib import reload
from unittest.mock import patch

import pytest
from django.db.utils import DatabaseError
from django.test import RequestFactory

import aquacare_api
import aquacare_api.celery as celery_module
import aquacare_api.settings as project_settings
from aquacare_api.urls import api_root, health_check


class TestProjectUrls:
    def test_api_root_returns_expected_contract(self):
        request = RequestFactory().get('/api/')

        response = api_root(request)

        payload = json.loads(response.content)
        assert response.status_code == 200
        assert payload['api'] == 'AquaCare API'
        assert payload['documentation']['swagger'] == '/api/docs/'
        assert payload['endpoints']['accounts'] == '/api/accounts/'
        assert payload['endpoints']['notifications'] == '/api/notifications/'

    def test_health_check_returns_healthy_status_when_database_is_available(self):
        request = RequestFactory().get('/api/health/')

        with patch('django.db.connection.ensure_connection') as mock_connection:
            response = health_check(request)

        payload = json.loads(response.content)
        assert response.status_code == 200
        assert payload == {
            'status': 'healthy',
            'database': 'connected',
            'cache': 'connected',
            'api': 'operational',
        }
        mock_connection.assert_called_once()

    def test_health_check_returns_unhealthy_status_when_database_fails(self):
        request = RequestFactory().get('/api/health/')

        with patch(
            'django.db.connection.ensure_connection',
            side_effect=DatabaseError('db down'),
        ):
            response = health_check(request)

        payload = json.loads(response.content)
        assert response.status_code == 503
        assert payload['status'] == 'unhealthy'
        assert payload['database'] == 'disconnected'
        assert payload['cache'] == 'connected'
        assert payload['api'] == 'degraded'
        assert 'error' not in payload

    def test_health_check_returns_unhealthy_status_when_cache_fails(self):
        request = RequestFactory().get('/api/health/')

        with patch('django.db.connection.ensure_connection'), patch(
            'aquacare_api.urls.cache.get',
            side_effect=RuntimeError('cache down'),
        ):
            response = health_check(request)

        payload = json.loads(response.content)
        assert response.status_code == 503
        assert payload['status'] == 'unhealthy'
        assert payload['database'] == 'connected'
        assert payload['cache'] == 'disconnected'
        assert payload['api'] == 'degraded'
        assert 'error' not in payload


class TestCeleryConfiguration:
    def test_package_exports_same_celery_app(self):
        assert aquacare_api.celery_app is celery_module.app

    def test_default_settings_module_constant_is_stable(self):
        assert celery_module.DEFAULT_DJANGO_SETTINGS_MODULE == 'aquacare_api.settings.development'

    def test_beat_schedule_contains_expected_periodic_tasks(self):
        beat_schedule = celery_module.app.conf.beat_schedule

        assert (
            beat_schedule['cleanup-old-notifications']['task']
            == 'notifications.tasks.cleanup_old_notifications'
        )
        assert (
            beat_schedule['send-scheduled-notifications']['task']
            == 'notifications.tasks.send_scheduled_notifications'
        )
        assert beat_schedule['cleanup-jwt-blacklist']['task'] == 'accounts.tasks.cleanup_expired_tokens'

        # Direction A: les brouillons de rapports ne sont plus générés
        # automatiquement — uniquement à la demande (app/admin).
        automatic_report_tasks = {
            'generate-daily-report-drafts',
            'generate-weekly-report-drafts',
            'generate-monthly-report-drafts',
        }
        assert automatic_report_tasks.isdisjoint(beat_schedule.keys())


class TestSettingsModuleResolution:
    def test_resolve_settings_module_defaults_to_development(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.delenv('DJANGO_SETTINGS_MODULE', raising=False)

        assert project_settings._resolve_settings_module() == 'aquacare_api.settings.development'

    def test_resolve_settings_module_uses_environment_value(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv('DJANGO_SETTINGS_MODULE', 'aquacare_api.settings.production')

        assert project_settings._resolve_settings_module() == 'aquacare_api.settings.production'

    def test_settings_init_selects_test_settings_when_env_requests_it(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ):
        monkeypatch.setenv('DJANGO_SETTINGS_MODULE', 'aquacare_api.settings.test')

        reloaded_settings = reload(project_settings)

        assert reloaded_settings._resolve_settings_module() == 'aquacare_api.settings.test'
        assert reloaded_settings.DEBUG is False


def test_api_docs_are_staff_only_when_not_public(settings):
    from rest_framework.permissions import AllowAny, IsAdminUser

    from aquacare_api.urls import api_docs_view_kwargs

    settings.API_DOCS_PUBLIC = False
    assert api_docs_view_kwargs()['permission_classes'] == [IsAdminUser]
    settings.API_DOCS_PUBLIC = True
    assert api_docs_view_kwargs()['permission_classes'] == [AllowAny]


def test_production_settings_hide_api_docs_by_default():
    import ast
    from pathlib import Path

    source = (Path(__file__).resolve().parents[2] / 'aquacare_api/settings/production.py').read_text()
    assert "API_DOCS_PUBLIC = config('API_DOCS_PUBLIC', default=False, cast=bool)" in source
    ast.parse(source)
