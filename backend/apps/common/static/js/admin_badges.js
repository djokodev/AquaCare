/**
 * Badges de notification temps réel pour la sidebar AquaCare Admin.
 * Poll /admin/api/badge-counts/ toutes les 60 secondes.
 */
(function () {
  'use strict';

  // Ne pas exécuter sur la page de login
  if (document.body && document.body.classList.contains('login')) return;

  const SECTIONS = [
    { key: 'chat',               urlPath: '/admin/chat/conversation/' },
    { key: 'cycle_logs',         urlPath: '/admin/aquaculture/cyclelog/' },
    { key: 'sanitary_logs',      urlPath: '/admin/aquaculture/sanitarylog/' },
    { key: 'orders',             urlPath: '/admin/commerce/order/' },
    { key: 'production_reports', urlPath: '/admin/aquaculture/productionreport/' },
    { key: 'dispatch_logs',      urlPath: '/admin/aquaculture/reportdispatchlog/' },
  ];

  function injectBadge(urlPath, count) {
    var links = document.querySelectorAll('.nav-sidebar .nav-link');
    links.forEach(function (link) {
      if (!link.href || link.href.indexOf(urlPath) === -1) return;

      var badge = link.querySelector('.aquacare-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'aquacare-badge badge badge-danger';
          badge.style.cssText = 'margin-left:4px;font-size:10px;vertical-align:middle;min-width:18px;text-align:center;';
          var p = link.querySelector('p');
          if (p) p.after(badge);
        }
        badge.textContent = count > 99 ? '99+' : String(count);
      } else if (badge) {
        badge.remove();
      }
    });
  }

  function fetchCounts() {
    fetch('/admin/api/badge-counts/', { credentials: 'same-origin' })
      .then(function (response) {
        // admin_view() redirige vers login si non authentifié → reçoit HTML
        var contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;
        return response.json();
      })
      .then(function (data) {
        if (!data) return;
        SECTIONS.forEach(function (section) {
          injectBadge(section.urlPath, data[section.key] || 0);
        });
      })
      .catch(function () {
        // Silencieux sur erreur réseau — les badges existants restent affichés
      });
  }

  function setupClickClear() {
    SECTIONS.forEach(function (section) {
      document.querySelectorAll('.nav-sidebar .nav-link').forEach(function (link) {
        if (link.href && link.href.indexOf(section.urlPath) !== -1) {
          link.addEventListener('click', function () {
            var badge = link.querySelector('.aquacare-badge');
            if (badge) badge.remove();
          });
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetchCounts();
    setupClickClear();
    setInterval(fetchCounts, 60000);
  });
})();
