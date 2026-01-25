/**
 * AquaCare Admin - Bilingual Translation System (FR/EN)
 * Uses ASCII-escaped Unicode to avoid encoding issues
 */

(function() {
    'use strict';

    // Detect current language
    function getCurrentLanguage() {
        // 1. Check django_language cookie
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].trim();
            if (cookie.startsWith('django_language=')) {
                return cookie.substring('django_language='.length);
            }
        }
        // 2. Check HTML lang attribute
        var htmlLang = document.documentElement.lang;
        if (htmlLang) {
            return htmlLang.substring(0, 2);
        }
        // 3. Default to French
        return 'fr';
    }

    var currentLang = getCurrentLanguage();
    console.log('[AquaCare Admin] Current language:', currentLang);

    // =========================================================================
    // TRANSLATION DICTIONARIES
    // =========================================================================

    // French to English translations (for English mode)
    var frenchToEnglish = {
        // Navigation
        'Tableau de bord': 'Dashboard',
        'Accueil': 'Home',
        'Actions r\u00e9centes': 'Recent Actions',
        'Mes actions': 'My Actions',
        'Aucune disponible': 'None available',
        'Administration du site': 'Site administration',

        // Navbar
        'Compte utilisateur': 'Account',
        'Voir le profil': 'See Profile',
        'Changer le mot de passe': 'Change password',
        'Choisir la langue': 'Choose language',

        // Support
        'Messagerie Support': 'Support Inbox',

        // CRUD buttons
        'Voir': 'View',
        'Modifier': 'Change',
        'Modification': 'Change',
        'Ajouter': 'Add',
        'Supprimer': 'Delete',
        'Enregistrer': 'Save',
        'Enregistrer et continuer': 'Save and continue editing',
        'Enregistrer et ajouter': 'Save and add another',
        'Enregistrer comme nouveau': 'Save as new',
        'Historique': 'History',
        'Afficher': 'View',

        // Filters
        'Rechercher': 'Search',
        'Filtrer': 'Filter',
        'Effacer les filtres': 'Clear all filters',
        'Valider': 'Go',
        'Ex\u00e9cuter l\'action': 'Run the selected action',

        // Selection
        'Tout s\u00e9lectionner': 'Select all',
        'S\u00e9lectionner': 'Select',
        'Aucun': 'None',
        'Tous': 'All',
        '\u00c9l\u00e9ments': 'Items',
        '\u00e9l\u00e9ment': 'item',
        '\u00e9l\u00e9ments': 'items',
        's\u00e9lectionn\u00e9(s)': 'selected',

        // Yes/No
        'Oui': 'Yes',
        'Non': 'No',
        'Inconnu': 'Unknown',
        'Vrai': 'True',
        'Faux': 'False',

        // Login/Logout
        'D\u00e9connexion': 'Log out',
        'Connexion': 'Log in',
        'Bienvenue': 'Welcome',
        'Bienvenue,': 'Welcome,',

        // Theme
        'Mode sombre': 'Dark Mode',
        'Mode clair': 'Light Mode',

        // Messages
        '\u00cates-vous s\u00fbr ?': 'Are you sure?',
        'Avec succ\u00e8s': 'Successfully',
        'Erreur': 'Error',

        // Periodic Tasks
        'T\u00e2ches p\u00e9riodiques': 'Periodic Tasks',
        'T\u00e2ches P\u00e9riodique': 'Periodic Tasks',
        'T\u00e2che p\u00e9riodique': 'Periodic Task',
        'Planifi\u00e9': 'Clocked',
        'Horaire': 'Clocked',
        'Intervalles': 'Intervals',
        'Intervales': 'Intervals',
        '\u00c9v\u00e9nements solaires': 'Solar Events',
        '\u00c9v\u00e8nements solaire': 'Solar Events',

        // Auth
        'Authentification et Autorisations': 'Authentication and Authorization',
        'Authentification et autorisation': 'Authentication and Authorization',
        'Groupes': 'Groups',
        'Groupe': 'Group',
        'Utilisateurs': 'Users',
        'Utilisateur': 'User',
        'Permissions': 'Permissions',

        // Pagination
        'Tout afficher': 'Show all',
        'Premier': 'First',
        'Dernier': 'Last',
        'Pr\u00e9c\u00e9dent': 'Previous',
        'Suivant': 'Next',

        // Forms
        'Aujourd\'hui': 'Today',
        'Maintenant': 'Now',
        'Effacer': 'Clear',
        'Annuler': 'Cancel',
        'Retirer': 'Remove',
        'Choisir': 'Choose',
        'Choisir un fichier': 'Choose a file',
        'Aucun fichier': 'No file chosen',
        'Requis': 'Required',
        'Optionnel': 'Optional',

        // Models
        'objet': 'object',
        'objets': 'objects',
        'Ajouter un autre': 'Add another',
        'Retirer ceci': 'Remove this',

        // JWT
        'Gestion des tokens': 'Token Management',
        'Tokens r\u00e9voqu\u00e9s': 'Blacklisted Tokens',
        'Tokens actifs': 'Outstanding Tokens',

        // Admin welcome
        'Bienvenue sur AquaCare Administration': 'Welcome to AquaCare Administration'
    };

    // English to French translations (for French mode)
    var englishToFrench = {
        // Navigation
        'Dashboard': 'Tableau de bord',
        'Home': 'Accueil',
        'Recent actions': 'Actions r\u00e9centes',
        'Recent Actions': 'Actions r\u00e9centes',
        'My actions': 'Mes actions',
        'My Actions': 'Mes actions',
        'None available': 'Aucune disponible',
        'Site administration': 'Administration du site',

        // Navbar
        'Account': 'Compte utilisateur',
        'See Profile': 'Voir le profil',
        'Change password': 'Changer le mot de passe',
        'Choose language': 'Choisir la langue',

        // Support
        'Support Inbox': 'Messagerie Support',

        // CRUD buttons
        'View': 'Voir',
        'Change': 'Modifier',
        'Add': 'Ajouter',
        'Delete': 'Supprimer',
        'Save': 'Enregistrer',
        'Save and continue editing': 'Enregistrer et continuer',
        'Save and add another': 'Enregistrer et ajouter',
        'Save as new': 'Enregistrer comme nouveau',
        'History': 'Historique',
        'View on site': 'Voir sur le site',

        // Filters
        'Search': 'Rechercher',
        'Filter': 'Filtrer',
        'Clear all filters': 'Effacer les filtres',
        'Go': 'Valider',
        'Run the selected action': 'Ex\u00e9cuter l\'action',

        // Selection
        'Select all': 'Tout s\u00e9lectionner',
        'Select': 'S\u00e9lectionner',
        'None': 'Aucun',
        'All': 'Tous',
        'Action': 'Action',
        'Actions': 'Actions',
        'Items': '\u00c9l\u00e9ments',
        'item': '\u00e9l\u00e9ment',
        'items': '\u00e9l\u00e9ments',
        'selected': 's\u00e9lectionn\u00e9(s)',

        // Yes/No
        'Yes': 'Oui',
        'No': 'Non',
        'Unknown': 'Inconnu',
        'True': 'Vrai',
        'False': 'Faux',

        // Login/Logout
        'Log out': 'D\u00e9connexion',
        'Log in': 'Connexion',
        'Welcome': 'Bienvenue',
        'Welcome,': 'Bienvenue,',

        // Theme
        'Dark Mode': 'Mode sombre',
        'Light Mode': 'Mode clair',
        'Toggle navigation': 'Basculer navigation',

        // Messages
        'Are you sure?': '\u00cates-vous s\u00fbr ?',
        'Successfully': 'Avec succ\u00e8s',
        'Error': 'Erreur',
        'successfully': 'avec succ\u00e8s',

        // Periodic Tasks
        'Periodic Tasks': 'T\u00e2ches p\u00e9riodiques',
        'Clocked': 'Planifi\u00e9',
        'Crontabs': 'Crontabs',
        'Intervals': 'Intervalles',
        'Periodic tasks': 'T\u00e2ches p\u00e9riodiques',
        'Solar events': '\u00c9v\u00e9nements solaires',

        // Auth
        'Authentication and Authorization': 'Authentification et Autorisations',
        'Groups': 'Groupes',
        'Group': 'Groupe',
        'Users': 'Utilisateurs',
        'User': 'Utilisateur',
        'Permissions': 'Permissions',

        // Pagination
        'Show all': 'Tout afficher',
        'First': 'Premier',
        'Last': 'Dernier',
        'Previous': 'Pr\u00e9c\u00e9dent',
        'Next': 'Suivant',

        // Forms
        'Today': 'Aujourd\'hui',
        'Now': 'Maintenant',
        'Clear': 'Effacer',
        'Cancel': 'Annuler',
        'Remove': 'Retirer',
        'Choose': 'Choisir',
        'Choose a file': 'Choisir un fichier',
        'No file chosen': 'Aucun fichier',
        'Required': 'Requis',
        'Optional': 'Optionnel',

        // Models
        'object': 'objet',
        'objects': 'objets',
        'Add another': 'Ajouter un autre',
        'Remove this': 'Retirer ceci',

        // JWT
        'Token Blacklist': 'Gestion des tokens',
        'Blacklisted Tokens': 'Tokens r\u00e9voqu\u00e9s',
        'Outstanding Tokens': 'Tokens actifs',
        'Blacklisted tokens': 'Tokens r\u00e9voqu\u00e9s',
        'Outstanding tokens': 'Tokens actifs'
    };

    // Select appropriate dictionary based on language
    var translations = (currentLang === 'en') ? frenchToEnglish : englishToFrench;
    console.log('[AquaCare Admin] Using translations:', currentLang === 'en' ? 'FR->EN' : 'EN->FR');

    // =========================================================================
    // TRANSLATION FUNCTIONS
    // =========================================================================

    function replaceText(element) {
        if (!element) return;

        if (element.nodeType === Node.TEXT_NODE) {
            var text = element.textContent.trim();
            if (text && translations[text]) {
                element.textContent = element.textContent.replace(text, translations[text]);
            }
        } else if (element.nodeType === Node.ELEMENT_NODE) {
            var tagName = element.tagName.toLowerCase();
            if (['input', 'textarea', 'script', 'style', 'select', 'option'].indexOf(tagName) === -1) {
                var children = element.childNodes;
                for (var i = 0; i < children.length; i++) {
                    replaceText(children[i]);
                }
            }
        }
    }

    function translateAttributes() {
        document.querySelectorAll('[title]').forEach(function(el) {
            var title = el.getAttribute('title');
            if (title && translations[title]) {
                el.setAttribute('title', translations[title]);
            }
        });

        document.querySelectorAll('[placeholder]').forEach(function(el) {
            var placeholder = el.getAttribute('placeholder');
            if (placeholder && translations[placeholder]) {
                el.setAttribute('placeholder', translations[placeholder]);
            }
        });

        document.querySelectorAll('input[type="submit"]').forEach(function(el) {
            var value = el.value;
            if (value && translations[value]) {
                el.value = translations[value];
            }
        });
    }

    function translateJazzminElements() {
        // Page title
        var pageTitle = document.querySelector('.content-header h1');
        if (pageTitle) {
            var text = pageTitle.textContent.trim();
            if (translations[text]) {
                pageTitle.textContent = translations[text];
            }
        }

        // Breadcrumb
        document.querySelectorAll('.breadcrumb-item').forEach(function(el) {
            var link = el.querySelector('a');
            if (link) {
                var text = link.textContent.trim();
                if (translations[text]) {
                    link.textContent = translations[text];
                }
            } else {
                var text = el.textContent.trim();
                if (translations[text]) {
                    el.textContent = translations[text];
                }
            }
        });

        // Card titles
        document.querySelectorAll('.card-title').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Sidebar navigation
        document.querySelectorAll('.nav-sidebar .nav-link p').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Object tools buttons
        document.querySelectorAll('.object-tools a').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // User dropdown menu
        document.querySelectorAll('.dropdown-menu .dropdown-item').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Timeline/Recent actions
        document.querySelectorAll('.timeline-header, .timeline-body').forEach(function(el) {
            replaceText(el);
        });

        // Info boxes
        document.querySelectorAll('.info-box-text, .info-box-number, .small-box .inner').forEach(function(el) {
            replaceText(el);
        });

        // Dashboard card links
        document.querySelectorAll('.model-link, .addlink, .changelink, .viewlink').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Section headers (card-header titles)
        document.querySelectorAll('.card-header').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Nav headers in sidebar
        document.querySelectorAll('.nav-header').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });
    }

    function applyTranslations() {
        replaceText(document.body);
        translateAttributes();
        translateJazzminElements();
    }

    function init() {
        applyTranslations();
        setTimeout(applyTranslations, 200);
        setTimeout(applyTranslations, 500);
        setTimeout(applyTranslations, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Observer for dynamically loaded elements
    var observer = new MutationObserver(function(mutations) {
        var shouldTranslate = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                shouldTranslate = true;
            }
        });
        if (shouldTranslate) {
            clearTimeout(window._translationTimeout);
            window._translationTimeout = setTimeout(applyTranslations, 100);
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

})();
