from django.utils import translation
from django.utils.translation import gettext as _


class UserLanguageMiddleware:
    """
    Middleware qui détecte et applique automatiquement la langue préférée.
    
    Logique de détection :
    1. Si utilisateur connecté : utilise sa langue préférée
    2. Sinon : utilise l'header Accept-Language
    3. Par défaut : français (public cible Afrique centrale)
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Détecter la langue préférée
        language = self.get_user_language(request)
        
        # Activer la langue
        translation.activate(language)
        request.LANGUAGE_CODE = language
        
        response = self.get_response(request)
        
        # Désactiver la langue après la réponse
        translation.deactivate()
        
        return response
    
    def get_user_language(self, request):
        """
        Détermine la langue à utiliser pour cette requête.
        
        Args:
            request: Requête HTTP Django
            
        Returns:
            str: Code langue ('fr' ou 'en')
        """
        # 1. Si utilisateur connecté, utiliser sa préférence
        if hasattr(request, 'user') and request.user.is_authenticated:
            if hasattr(request.user, 'language_preference'):
                return request.user.language_preference
        
        # 2. Utiliser l'header Accept-Language
        accept_language = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
        
        # Analyser l'header Accept-Language
        if 'en' in accept_language.lower():
            return 'en'
        elif 'fr' in accept_language.lower():
            return 'fr'
        
        # 3. Par défaut : français (contexte MAVECAM)
        return 'fr'


class APIResponseLanguageMiddleware:
    """
    Middleware qui ajoute la langue actuelle aux réponses API.
    
    Ajoute un header X-Content-Language pour informer le client mobile
    de la langue utilisée dans la réponse.
    """
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        
        # Ajouter le header de langue pour les API
        if request.path.startswith('/api/'):
            current_language = translation.get_language() or 'fr'
            response['X-Content-Language'] = current_language
        
        return response


class LoginRateLimitMiddleware:
    """
    Middleware de rate limiting pour les tentatives de connexion.
    
    Limite les tentatives de connexion pour prévenir les attaques par force brute.
    Spécialement important pour l'API mobile MAVECAM.
    
    Règles :
    - Max 5 tentatives par IP par minute
    - Max 3 tentatives par utilisateur par minute
    - Blocage progressif en cas d'abus répété
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        # Cache simple en mémoire (en production, utiliser Redis)
        self.ip_attempts = {}
        self.user_attempts = {}
    
    def __call__(self, request):
        # Vérifier le rate limiting avant traitement
        if self.should_rate_limit(request):
            from django.http import JsonResponse
            return JsonResponse({
                'error': _('Trop de tentatives de connexion. Veuillez patienter.'),
                'retry_after': 60
            }, status=429)
        
        response = self.get_response(request)
        
        # Enregistrer les tentatives après traitement
        if self.is_login_attempt(request, response):
            self.record_attempt(request, response)
        
        return response
    
    def is_login_attempt(self, request, response):
        """Vérifie si c'est une tentative de connexion."""
        return (
            request.path == '/api/accounts/login/' and 
            request.method == 'POST'
        )
    
    def should_rate_limit(self, request):
        """Vérifie si la requête doit être rate limitée."""
        if not self.is_login_request(request):
            return False
        
        ip = self.get_client_ip(request)
        
        # Vérifier les tentatives par IP
        if self.check_ip_limit(ip):
            return True
        
        # Vérifier les tentatives par utilisateur (si login_name fourni)
        login_name = self.get_login_name(request)
        if login_name and self.check_user_limit(login_name):
            return True
        
        return False
    
    def is_login_request(self, request):
        """Vérifie si c'est une requête de login."""
        return (
            request.path == '/api/accounts/login/' and 
            request.method == 'POST'
        )
    
    def check_ip_limit(self, ip):
        """Vérifie la limite par IP."""
        import time
        current_time = time.time()
        
        if ip not in self.ip_attempts:
            return False
        
        # Nettoyer les tentatives anciennes (> 1 minute)
        self.ip_attempts[ip] = [
            attempt for attempt in self.ip_attempts[ip]
            if current_time - attempt < 60
        ]
        
        # Vérifier la limite (5 tentatives par minute)
        return len(self.ip_attempts[ip]) >= 5
    
    def check_user_limit(self, login_name):
        """Vérifie la limite par utilisateur."""
        import time
        current_time = time.time()
        
        if login_name not in self.user_attempts:
            return False
        
        # Nettoyer les tentatives anciennes
        self.user_attempts[login_name] = [
            attempt for attempt in self.user_attempts[login_name]
            if current_time - attempt < 60
        ]
        
        # Vérifier la limite (3 tentatives par minute)
        return len(self.user_attempts[login_name]) >= 3
    
    def record_attempt(self, request, response):
        """Enregistre une tentative de connexion."""
        import time
        current_time = time.time()
        
        # Enregistrer seulement les tentatives échouées
        if response.status_code != 200:
            ip = self.get_client_ip(request)
            login_name = self.get_login_name(request)
            
            # Enregistrer par IP
            if ip not in self.ip_attempts:
                self.ip_attempts[ip] = []
            self.ip_attempts[ip].append(current_time)
            
            # Enregistrer par utilisateur
            if login_name:
                if login_name not in self.user_attempts:
                    self.user_attempts[login_name] = []
                self.user_attempts[login_name].append(current_time)
    
    def get_client_ip(self, request):
        """Récupère l'IP du client."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
    
    def get_login_name(self, request):
        """Récupère le login_name de la requête."""
        try:
            import json
            body = json.loads(request.body.decode('utf-8'))
            return body.get('login_name', '')
        except:
            return ''