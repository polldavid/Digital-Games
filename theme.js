/* =========================================================
   Shared light/dark theme controller for Digital Games.
   - Reads a saved preference (localStorage), else falls back
     to the OS setting via prefers-color-scheme.
   - Wires up any element marked [data-theme-toggle].
   - Persists the user's choice across pages and visits.

   A tiny inline snippet in each page's <head> sets the theme
   BEFORE first paint (no flash); this file reconciles the
   toggle button and handles clicks.
   ========================================================= */
(function () {
  'use strict';
  var KEY = 'dg-theme';

  function systemDark() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function saved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || saved() || (systemDark() ? 'dark' : 'light');
  }
  function updateButton(theme) {
    var b = document.querySelector('[data-theme-toggle]');
    if (!b) return;
    b.textContent = theme === 'dark' ? '☀️' : '🌙';
    b.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    b.setAttribute('title', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    updateButton(theme);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var theme = currentTheme();
    setTheme(theme);
    var b = document.querySelector('[data-theme-toggle]');
    if (b) {
      b.addEventListener('click', function () {
        setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });
    }
    // If the user hasn't chosen explicitly, follow later OS changes.
    if (!saved() && window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onChange = function (e) { if (!saved()) setTheme(e.matches ? 'dark' : 'light'); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  });
})();
