/**
 * Theme management for Jibble Work Tracker
 * Persists theme choice to localStorage and syncs with OS preference.
 */

const THEME_KEY = 'jibble-theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);
  return saved;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  root.removeAttribute('data-theme');

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }

  localStorage.setItem(THEME_KEY, theme);
}

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

// Watch OS-level changes and update 'system' theme automatically
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSavedTheme() === 'system') applyTheme('system');
  });
}
