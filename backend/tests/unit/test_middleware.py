"""
Tests unitaires pour les middleware personnalisés.

Teste le rate limiting, la détection de langue, etc.
"""
import pytest
import json
from unittest.mock import Mock, patch
from django.http import HttpRequest, JsonResponse
from django.contrib.auth import get_user_model
from django.test import RequestFactory
from apps.accounts.middleware import (
    UserLanguageMiddleware, 
    APIResponseLanguageMiddleware,
    LoginRateLimitMiddleware
)

User = get_user_model()


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
        with patch('django.contrib.auth.get_user_model') as mock_get_user:
            request = self.factory.get('/')
            request.user = Mock()
            request.user.is_authenticated = True
            request.user.language_preference = 'en'
            
            language = self.middleware.get_user_language(request)
            assert language == 'en'
    
    def test_accept_language_header_used_when_not_authenticated(self):
        """Test utilisation header Accept-Language."""
        request = self.factory.get('/', HTTP_ACCEPT_LANGUAGE='en-US,en;q=0.9')
        request.user = Mock()
        request.user.is_authenticated = False
        
        language = self.middleware.get_user_language(request)
        assert language == 'en'
    
    def test_french_header_detected(self):
        """Test détection français dans header."""
        request = self.factory.get('/', HTTP_ACCEPT_LANGUAGE='fr-FR,fr;q=0.9')
        request.user = Mock()
        request.user.is_authenticated = False
        
        language = self.middleware.get_user_language(request)
        assert language == 'fr'
    
    def test_default_french_when_no_preference(self):
        """Test français par défaut."""
        request = self.factory.get('/')
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
        should_limit = self.middleware.check_ip_limit('192.168.1.1')
        assert should_limit is False
    
    def test_ip_limit_reached_after_attempts(self):
        """Test limite IP atteinte après plusieurs tentatives."""
        ip = '192.168.1.100'
        
        # Simuler 5 tentatives dans la dernière minute
        import time
        current_time = time.time()
        self.middleware.ip_attempts[ip] = [
            current_time - 30,  # 30 secondes ago
            current_time - 25,
            current_time - 20,
            current_time - 15,
            current_time - 10
        ]
        
        should_limit = self.middleware.check_ip_limit(ip)
        assert should_limit is True
    
    def test_user_limit_reached_after_attempts(self):
        """Test limite utilisateur atteinte."""
        login_name = 'Jean Farmer'
        
        # Simuler 3 tentatives dans la dernière minute
        import time
        current_time = time.time()
        self.middleware.user_attempts[login_name] = [
            current_time - 30,
            current_time - 20,
            current_time - 10
        ]
        
        should_limit = self.middleware.check_user_limit(login_name)
        assert should_limit is True
    
    def test_old_attempts_cleaned_up(self):
        """Test nettoyage des anciennes tentatives."""
        ip = '192.168.1.200'
        
        # Ajouter des tentatives anciennes (> 1 minute)
        import time
        current_time = time.time()
        self.middleware.ip_attempts[ip] = [
            current_time - 120,  # 2 minutes ago (doit être supprimé)
            current_time - 90,   # 1.5 minutes ago (doit être supprimé)
            current_time - 30    # 30 seconds ago (doit rester)
        ]
        
        should_limit = self.middleware.check_ip_limit(ip)
        
        # Vérifier qu'une seule tentative reste
        assert len(self.middleware.ip_attempts[ip]) == 1
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
    
    def test_get_login_name_from_request_body(self):
        """Test extraction login_name du body JSON."""
        data = {'login_name': 'Jean Farmer', 'password': 'test123'}
        request = self.factory.post(
            '/api/accounts/login/',
            data=json.dumps(data),
            content_type='application/json'
        )
        
        login_name = self.middleware.get_login_name(request)
        assert login_name == 'Jean Farmer'
    
    def test_get_login_name_invalid_json(self):
        """Test extraction login_name avec JSON invalide."""
        request = self.factory.post(
            '/api/accounts/login/',
            data='invalid json',
            content_type='application/json'
        )
        
        login_name = self.middleware.get_login_name(request)
        assert login_name == ''
    
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