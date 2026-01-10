/**
 * AquaCare Admin - Traductions françaises
 * Ce script remplace les textes anglais par leurs traductions françaises
 * Compatible avec Django Jazzmin Admin
 */

(function() {
    'use strict';

    // Dictionnaire de traductions complet
    var translations = {
        // Navigation et titres principaux
        'Dashboard': 'Tableau de bord',
        'Home': 'Accueil',
        'Recent actions': 'Actions récentes',
        'Recent Actions': 'Actions récentes',
        'My actions': 'Mes actions',
        'My Actions': 'Mes actions',
        'None available': 'Aucune disponible',
        'Site administration': 'Administration du site',

        // Boutons et actions CRUD
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

        // Filtres et recherche
        'Search': 'Rechercher',
        'Filter': 'Filtrer',
        'Clear all filters': 'Effacer les filtres',
        'Go': 'Valider',
        'Run the selected action': 'Exécuter l\'action',

        // Selection et actions de masse
        'Select all': 'Tout sélectionner',
        'Select': 'Sélectionner',
        'None': 'Aucun',
        'All': 'Tous',
        'Action': 'Action',
        'Actions': 'Actions',
        'Items': 'Éléments',
        'item': 'élément',
        'items': 'éléments',
        'selected': 'sélectionné(s)',

        // Oui/Non
        'Yes': 'Oui',
        'No': 'Non',
        'Unknown': 'Inconnu',
        'True': 'Vrai',
        'False': 'Faux',

        // Connexion/Deconnexion
        'Log out': 'Déconnexion',
        'Log in': 'Connexion',
        'Welcome': 'Bienvenue',
        'Welcome,': 'Bienvenue,',

        // Theme
        'Dark Mode': 'Mode sombre',
        'Light Mode': 'Mode clair',
        'Toggle navigation': 'Basculer navigation',

        // Messages
        'Are you sure?': 'Êtes-vous sûr ?',
        'Successfully': 'Avec succès',
        'Error': 'Erreur',
        'successfully': 'avec succès',

        // Periodic Tasks (django-celery-beat)
        'Periodic Tasks': 'Tâches périodiques',
        'Clocked': 'Planifié',
        'Crontabs': 'Crontabs',
        'Intervals': 'Intervalles',
        'Periodic tasks': 'Tâches périodiques',
        'Solar events': 'Événements solaires',

        // Authentication Django
        'Authentication and Authorization': 'Authentification et Autorisations',
        'Groups': 'Groupes',
        'Users': 'Utilisateurs',
        'Permissions': 'Permissions',

        // Pagination
        'Show all': 'Tout afficher',
        'First': 'Premier',
        'Last': 'Dernier',
        'Previous': 'Précédent',
        'Next': 'Suivant',

        // Formulaires
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

        // Modeles Django
        'object': 'objet',
        'objects': 'objets',
        'Add another': 'Ajouter un autre',
        'Remove this': 'Retirer ceci'
    };

    // Fonction pour remplacer le texte dans un element
    function replaceText(element) {
        if (!element) return;

        if (element.nodeType === Node.TEXT_NODE) {
            var text = element.textContent.trim();
            if (text && translations[text]) {
                element.textContent = element.textContent.replace(text, translations[text]);
            }
        } else if (element.nodeType === Node.ELEMENT_NODE) {
            var tagName = element.tagName.toLowerCase();
            // Ne pas modifier les inputs, textareas, scripts, styles, select
            if (['input', 'textarea', 'script', 'style', 'select', 'option'].indexOf(tagName) === -1) {
                var children = element.childNodes;
                for (var i = 0; i < children.length; i++) {
                    replaceText(children[i]);
                }
            }
        }
    }

    // Fonction pour traduire les attributs
    function translateAttributes() {
        // Traduire les attributs title
        document.querySelectorAll('[title]').forEach(function(el) {
            var title = el.getAttribute('title');
            if (title && translations[title]) {
                el.setAttribute('title', translations[title]);
            }
        });

        // Traduire les attributs placeholder
        document.querySelectorAll('[placeholder]').forEach(function(el) {
            var placeholder = el.getAttribute('placeholder');
            if (placeholder && translations[placeholder]) {
                el.setAttribute('placeholder', translations[placeholder]);
            }
        });

        // Traduire les attributs value des boutons submit
        document.querySelectorAll('input[type="submit"]').forEach(function(el) {
            var value = el.value;
            if (value && translations[value]) {
                el.value = translations[value];
            }
        });
    }

    // Traductions specifiques pour elements Jazzmin
    function translateJazzminElements() {
        // Titre de page Dashboard
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

        // Liens de navigation sidebar
        document.querySelectorAll('.nav-sidebar .nav-link p').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Boutons object-tools (View, Change, History, Delete)
        document.querySelectorAll('.object-tools a').forEach(function(el) {
            var text = el.textContent.trim();
            if (translations[text]) {
                el.textContent = translations[text];
            }
        });

        // Dropdown user menu
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

        // Info-box et small-box textes
        document.querySelectorAll('.info-box-text, .info-box-number, .small-box .inner').forEach(function(el) {
            replaceText(el);
        });
    }

    // Fonction principale d'application des traductions
    function applyTranslations() {
        replaceText(document.body);
        translateAttributes();
        translateJazzminElements();
    }

    // Appliquer les traductions quand le DOM est pret
    function init() {
        // Appliquer immediatement
        applyTranslations();

        // Reappliquer apres un delai (pour les elements charges dynamiquement)
        setTimeout(applyTranslations, 200);
        setTimeout(applyTranslations, 500);
        setTimeout(applyTranslations, 1000);
    }

    // Lancer l'initialisation
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Observer pour les elements charges dynamiquement (AJAX, etc.)
    var observer = new MutationObserver(function(mutations) {
        var shouldTranslate = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length > 0) {
                shouldTranslate = true;
            }
        });
        if (shouldTranslate) {
            // Debounce pour eviter trop d'appels
            clearTimeout(window._translationTimeout);
            window._translationTimeout = setTimeout(applyTranslations, 100);
        }
    });

    // Observer le body pour les changements
    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        });
    }

})();
