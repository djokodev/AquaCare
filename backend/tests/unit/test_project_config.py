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
        assert (
            beat_schedule['generate-daily-report-drafts']['task']
            == 'aquaculture.tasks.generate_daily_report_drafts_task'
        )
        assert (
            beat_schedule['generate-weekly-report-drafts']['task']
            == 'aquaculture.tasks.generate_weekly_report_drafts_task'
        )
        assert (
            beat_schedule['generate-monthly-report-drafts']['task']
            == 'aquaculture.tasks.generate_monthly_report_drafts_task'
        )
        assert beat_schedule['cleanup-jwt-blacklist']['task'] == 'accounts.tasks.cleanup_expired_tokens'


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
