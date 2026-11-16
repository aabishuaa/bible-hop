// A very small router: the path in the address bar names the screen.
import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

window.addEventListener('popstate', notify);

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  if (path === location.pathname + location.search) return;
  if (opts.replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  window.scrollTo(0, 0);
  notify();
}

export function back(fallback = '/'): void {
  if (history.length > 1 && document.referrer !== '' ? true : history.state !== null || history.length > 2) history.back();
  else navigate(fallback, { replace: true });
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname + location.search,
  );
}
