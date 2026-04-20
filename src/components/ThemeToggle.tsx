'use client';

import { useLayoutEffect, useState } from 'react';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';

const STORAGE_KEY = 'sstv-theme';

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useLayoutEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    setIsDark((d) => {
      const next = !d;
      if (next) {
        document.documentElement.classList.add('dark');
        try {
          localStorage.setItem(STORAGE_KEY, 'dark');
        } catch {
          /* ignore */
        }
      } else {
        document.documentElement.classList.remove('dark');
        try {
          localStorage.setItem(STORAGE_KEY, 'light');
        } catch {
          /* ignore */
        }
      }
      return next;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      suppressHydrationWarning
      aria-pressed={isDark}
      aria-label="Toggle theme"
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="inline-flex h-9 min-h-[36px] min-w-[36px] items-center justify-center rounded-md border border-border bg-surface px-2 text-foreground transition-colors hover:bg-surface-button focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {isDark ? (
        <LightModeIcon sx={{ fontSize: 22 }} aria-hidden />
      ) : (
        <DarkModeIcon sx={{ fontSize: 22 }} aria-hidden />
      )}
    </button>
  );
}
