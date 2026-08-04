/**
 * Badges de notification temps réel pour la sidebar AquaCare Admin.
 * Interroge l'URL nommee rendue par AquaCareAdminSite toutes les 60 secondes.
 */
(function () {
  'use strict';

  // Ne pas exécuter sur la page de login
  if (document.body && document.body.classList.contains('login')) return;

  const SECTIONS = ['chat', 'cycle_logs', 'sanitary_logs', 'orders', 'production_reports', 'dispatch_logs', 'activity_alerts', 'reports'];
  const sidebar = document.getElementById('jazzy-sidebar');
  const badgeUrl = sidebar && sidebar.dataset.badgeUrl;
  if (!badgeUrl) return;

  function injectBadge(key, count) {
    document.querySelectorAll('[data-badge-key="' + key + '"]').forEach(function (link) {
      var badge = link.querySelector('.admin-nav-badge');
      if (count > 0) {
        badge.hidden = false;
        badge.textContent = count > 99 ? '99+' : String(count);
      } else {
        badge.hidden = true;
        badge.textContent = '';
      }
    });
  }

  function fetchCounts() {
    fetch(badgeUrl, { credentials: 'same-origin' })
      .then(function (response) {
        // admin_view() redirige vers login si non authentifié → reçoit HTML
        var contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) return null;
        return response.json();
      })
      .then(function (data) {
        if (!data) return;
        SECTIONS.forEach(function (key) {
          injectBadge(key, data[key] || 0);
        });
      })
      .catch(function () {
        // Silencieux sur erreur réseau — les badges existants restent affichés
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    fetchCounts();
    setInterval(fetchCounts, 60000);
  });
})();
