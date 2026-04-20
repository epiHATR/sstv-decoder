'use client';

import { useSyncExternalStore } from 'react';

/**
 * True on narrow viewports or when running as an installed PWA (standalone).
 * Used to show icon-only action buttons (except settings FAB + theme toggle).
 */
function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mqNarrow = window.matchMedia('(max-width: 639px)');
  const mqStandalone = window.matchMedia('(display-mode: standalone)');
  mqNarrow.addEventListener('change', onStoreChange);
  mqStandalone.addEventListener('change', onStoreChange);
  return () => {
    mqNarrow.removeEventListener('change', onStoreChange);
    mqStandalone.removeEventListener('change', onStoreChange);
  };
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(max-width: 639px)').matches ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function useCompactActions(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
