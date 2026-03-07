"""
Tests unitaires pour les middleware personnalisés.

Teste le rate limiting, la détection de langue, etc.
"""
import json
import time
from unittest.mock import Mock, patch

import pytest
from accounts.middleware import APIResponseLanguageMiddleware, LoginRateLimitMiddleware, UserLanguageMiddleware
from django.contrib.auth import get_user_model
from django.contrib.sessions.middleware import SessionMiddleware
from django.core.cache import cache
from django.http import JsonResponse
from django.test import RequestFactory

User = get_user_model()


def add_session_to_request(request):
    """Helper pour ajouter une session à une requête de test."""
    middleware = SessionMiddleware(lambda x: x)
    middleware.process_request(request)
    request.session.save()
    return request


@pytest.mark.django_db
class TestUserLanguageMiddleware:
    """
    Tests pour la détection automatique de langue.
    """

    def setup_method(self):
        """Configuration pour chaque test."""
        self.factory = RequestFactory()
        self.get_response = Mock(return_value=Mock())
        self.middleware = UserLanguageMiddleware(self.get_response)
    
    def test_user_language_preference_used_when_authenticated(self):
        """Test utilisation langue préférée utilisateur connecté."""
        # Créer un utilisateur avec préférence EN
        with patch("django.contrib.auth.get_user_model"):
            request = self.factory.get('/')
            request = add_session_to_request(request)
            request.user = Mock()
            request.user.is_authenticated = True
            request.user.language_preference = 'en'

            language = self.middleware.get_user_language(request)
            assert language == 'en'
    
    def test_accept_language_header_used_when_not_authenticated(self):
        """Test utilisation header Accept-Language."""
        request = self.factory.get('/', HTTP_ACCEPT_LANGUAGE='en-US,en;q=0.9')
        request = add_session_to_request(request)
        request.user = Mock()
        request.user.is_authenticated = False

        language = self.middleware.get_user_language(request)
        assert language == 'en'
    
    def test_french_header_detected(self):
        """Test détection français dans header."""
        request = self.factory.get('/', HTTP_ACCEPT_LANGUAGE='fr-FR,fr;q=0.9')
        request = add_session_to_request(request)
        request.user = Mock()
        request.user.is_authenticated = False

        language = self.middleware.get_user_language(request)
        assert language == 'fr'
    
    def test_default_french_when_no_preference(self):
        """Test français par défaut."""
        request = self.factory.get('/')
        request = add_session_to_request(request)
        request.user = Mock()
        request.user.is_authenticated = False

        language = self.middleware.get_user_language(request)
        assert language == 'fr'


class TestAPIResponseLanguageMiddleware:
    """
    Tests pour l'ajout du header de langue dans les réponses API.
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.factory = RequestFactory()
        self.get_response = Mock()
        self.middleware = APIResponseLanguageMiddleware(self.get_response)
    
    def test_language_header_added_for_api_requests(self):
        """Test ajout header langue pour requêtes API."""
        request = self.factory.get('/api/accounts/profile/')
        response = JsonResponse({'test': 'data'})
        self.get_response.return_value = response
        
        with patch('django.utils.translation.get_language', return_value='fr'):
            result = self.middleware(request)
            
        assert result == response
        # Vérifier que le header a été ajouté
        assert result.get('X-Content-Language') == 'fr'
    
    def test_no_header_for_non_api_requests(self):
        """Test pas de header pour requêtes non-API."""
        request = self.factory.get('/admin/')
        response = JsonResponse({'test': 'data'})
        self.get_response.return_value = response
        
        result = self.middleware(request)
        
        assert result == response
        # Vérifier qu'aucun header n'a été ajouté
        assert result.get('X-Content-Language') is None


@pytest.mark.django_db
class TestLoginRateLimitMiddleware:
    """
    Tests pour le rate limiting des connexions.
    """
    
    def setup_method(self):
        """Configuration pour chaque test."""
        self.factory = RequestFactory()
        self.get_response = Mock()
        self.middleware = LoginRateLimitMiddleware(self.get_response)
        cache.clear()
    
    def test_non_login_request_not_rate_limited(self):
        """Test que les requêtes non-login ne sont pas limitées."""
        request = self.factory.get('/api/accounts/profile/')
        
        should_limit = self.middleware.should_rate_limit(request)
        assert should_limit is False
    
    def test_login_request_detected(self):
        """Test détection requête de login."""
        request = self.factory.post('/api/accounts/login/')
        
        is_login = self.middleware.is_login_request(request)
        assert is_login is True
    
    def test_ip_limit_not_reached_initially(self):
        """Test limite IP pas atteinte initialement."""
        ip = '192.168.1.1'
        should_limit = self.middleware._check_limit(
            self.middleware._cache_key_ip(ip),
            self.middleware.ip_limit,
            self.middleware.window_seconds,
        )
        assert should_limit is False
    
    def test_ip_limit_reached_after_attempts(self):
        """Test limite IP atteinte après plusieurs tentatives."""
        ip = '192.168.1.100'
        
        # Simuler 5 tentatives dans la dernière minute
        current_time = time.time()
        cache.set(self.middleware._cache_key_ip(ip), [
            current_time - 30,  # 30 secondes ago
            current_time - 25,
            current_time - 20,
            current_time - 15,
            current_time - 10
        ], timeout=60)
        
        should_limit = self.middleware._check_limit(
            self.middleware._cache_key_ip(ip),
            self.middleware.ip_limit,
            self.middleware.window_seconds,
        )
        assert should_limit is True

    def test_user_limit_reached_after_attempts(self):
        """Test limite utilisateur atteinte."""
        login_name = 'Jean Farmer'
        
        # Simuler 3 tentatives dans la dernière minute
        current_time = time.time()
        cache.set(self.middleware._cache_key_user(login_name), [
            current_time - 30,
            current_time - 20,
            current_time - 10
        ], timeout=60)
        
        should_limit = self.middleware.check_user_limit(login_name)
        assert should_limit is True
    
    def test_old_attempts_cleaned_up(self):
        """Test nettoyage des anciennes tentatives."""
        ip = '192.168.1.200'
        
        # Ajouter des tentatives anciennes (> 1 minute)
        current_time = time.time()
        key = self.middleware._cache_key_ip(ip)
        cache.set(key, [
            current_time - 120,  # 2 minutes ago (doit être supprimé)
            current_time - 90,   # 1.5 minutes ago (doit être supprimé)
            current_time - 30    # 30 seconds ago (doit rester)
        ], timeout=60)
        
        should_limit = self.middleware._check_limit(
            self.middleware._cache_key_ip(ip),
            self.middleware.ip_limit,
            self.middleware.window_seconds,
        )
        remaining_attempts = cache.get(key, [])
        
        # Vérifier qu'une seule tentative reste
        assert len(remaining_attempts) == 1
        assert should_limit is False  # Pas encore la limite
    
    def test_get_client_ip_with_forwarded_header(self):
        """Test récupération IP avec header X-Forwarded-For."""
        request = self.factory.post('/api/accounts/login/')
        request.META['HTTP_X_FORWARDED_FOR'] = '192.168.1.1, 10.0.0.1'
        
        ip = self.middleware.get_client_ip(request)
        assert ip == '192.168.1.1'  # Première IP de la liste
    
    def test_get_client_ip_without_forwarded_header(self):
        """Test récupération IP sans header forwarded."""
        request = self.factory.post('/api/accounts/login/')
        request.META['REMOTE_ADDR'] = '192.168.1.2'
        
        ip = self.middleware.get_client_ip(request)
        assert ip == '192.168.1.2'
    
    def test_get_login_identifier_from_login_name(self):
        """Test extraction login_name du body JSON."""
        data = {'login_name': 'Jean Farmer', 'password': 'test123'}
        request = self.factory.post(
            '/api/accounts/login/',
            data=json.dumps(data),
            content_type='application/json'
        )

        login_identifier = self.middleware.get_login_identifier(request)
        assert login_identifier == 'jean farmer'

    def test_get_login_identifier_from_phone_number(self):
        """Test extraction phone_number du body JSON."""
        data = {'phone_number': '+237690111222', 'password': 'test123'}
        request = self.factory.post(
            '/api/accounts/login/',
            data=json.dumps(data),
            content_type='application/json'
        )

        login_identifier = self.middleware.get_login_identifier(request)
        assert login_identifier == '+237690111222'

    def test_get_login_identifier_invalid_json(self):
        """Test extraction identifiant avec JSON invalide."""
        request = self.factory.post(
            '/api/accounts/login/',
            data='invalid json',
            content_type='application/json'
        )

        login_identifier = self.middleware.get_login_identifier(request)
        assert login_identifier == ''

    def test_phone_number_user_limit_reached_after_attempts(self):
        """Test limite utilisateur egalement appliquee via phone_number."""
        phone_number = '+237690444444'

        current_time = time.time()
        cache.set(self.middleware._cache_key_user(phone_number), [
            current_time - 30,
            current_time - 20,
            current_time - 10,
        ], timeout=60)

        request = self.factory.post(
            '/api/accounts/login/',
            data=json.dumps({'phone_number': phone_number, 'password': 'faux'}),
            content_type='application/json'
        )
        request.META['REMOTE_ADDR'] = '192.168.1.70'

        should_limit = self.middleware.should_rate_limit(request)
        assert should_limit is True
    
    def test_rate_limit_response_format(self):
        """Test format de réponse quand rate limit atteint."""
        request = self.factory.post('/api/accounts/login/')
        request.META['REMOTE_ADDR'] = '192.168.1.50'
        
        # Forcer le rate limiting
        with patch.object(self.middleware, 'should_rate_limit', return_value=True):
            response = self.middleware(request)
        
        assert isinstance(response, JsonResponse)
        assert response.status_code == 429
        
        # Vérifier le contenu de la réponse
        response_data = json.loads(response.content.decode())
        assert 'error' in response_data
        assert 'retry_after' in response_data
        assert response_data['retry_after'] == 60
