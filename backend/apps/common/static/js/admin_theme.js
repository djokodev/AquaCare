/**
 * Thème de l'admin : Automatique (suit le réglage du Mac/PC), Clair ou Sombre.
 * Le choix est gardé dans ce navigateur (localStorage). Chargé dans <head>
 * sans « defer » pour appliquer le thème avant l'affichage (pas de flash).
 */
(function () {
  'use strict';
  var KEY = 'aquacare-admin-theme';
  var ORDER = ['auto', 'light', 'dark'];
  var script = document.currentScript;

  function read() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }

  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* navigation privée */ }
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme === 'auto') { root.removeAttribute('data-theme'); } else { root.setAttribute('data-theme', theme); }
    root.style.colorScheme = theme === 'auto' ? 'light dark' : theme;
    // Thème sombre Jazzmin (Bootswatch) : chargé selon le choix.
    var link = document.getElementById('jazzmin-dark-mode-theme');
    if (link) {
      link.media = theme === 'dark' ? 'all' : (theme === 'light' ? 'not all' : '(prefers-color-scheme: dark)');
    }
  }

  function label(theme) {
    return (script && script.dataset['label' + theme.charAt(0).toUpperCase() + theme.slice(1)]) || theme;
  }

  var current = read();
  apply(current);

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.main-header .navbar-nav.ml-auto');
    if (!nav) return;
    var item = document.createElement('li');
    item.className = 'nav-item';
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-link btn btn-link aq-theme-toggle';
    button.setAttribute('aria-live', 'polite');
    function render() {
      button.textContent = label(current);
      button.title = (script && script.dataset.labelHint) || '';
    }
    button.addEventListener('click', function () {
      current = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length];
      save(current);
      apply(current);
      render();
    });
    render();
    item.appendChild(button);
    nav.insertBefore(item, nav.firstChild);
  });
})();
