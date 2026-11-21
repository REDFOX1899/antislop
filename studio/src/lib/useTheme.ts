'use client';

import { useCallback, useEffect, useState } from 'react';

export type StudioTheme = 'dark' | 'light';

const STORAGE_KEY = 'antislop-theme';

function applyThemeToDocument(theme: StudioTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  if (meta) {
    meta.content = theme;
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<StudioTheme>('dark');

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
        applyThemeToDocument(stored);
      } else {
        const attr = document.documentElement.dataset.theme;
        const resolved: StudioTheme = attr === 'light' ? 'light' : 'dark';
        setThemeState(resolved);
        applyThemeToDocument(resolved);
      }
    } catch {
      applyThemeToDocument('dark');
    }

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
        applyThemeToDocument(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = useCallback((next: StudioTheme) => {
    setThemeState(next);
    applyThemeToDocument(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked — theme still applies for current session
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [setTheme, theme]);

  return { theme, setTheme, toggleTheme };
}
