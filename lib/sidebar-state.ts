/**
 * Shared sidebar state — open/closed + width. Persists to localStorage and
 * broadcasts a CustomEvent so the Sidebar and TopBar stay in sync without
 * needing a React context (both are independent client trees mounted in
 * different parts of the page).
 */

export const SIDEBAR_EVENT = 'vault:sidebar';
export const SIDEBAR_OPEN_KEY = 'vault:sidebar:open';
export const SIDEBAR_WIDTH_KEY = 'vault:sidebar:width';

export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 200;
export const SIDEBAR_MAX_WIDTH = 420;

export type SidebarState = { open: boolean; width: number };

export function readSidebarState(): SidebarState {
  if (typeof window === 'undefined') {
    return { open: true, width: SIDEBAR_DEFAULT_WIDTH };
  }
  let open = true;
  let width = SIDEBAR_DEFAULT_WIDTH;
  try {
    const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
    if (raw === 'false') open = false;
  } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) {
        width = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, n));
      }
    }
  } catch { /* ignore */ }
  return { open, width };
}

export function writeSidebarState(patch: Partial<SidebarState>) {
  if (typeof window === 'undefined') return;
  const current = readSidebarState();
  const next = { ...current, ...patch };
  try {
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(next.open));
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next.width));
  } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent<SidebarState>(SIDEBAR_EVENT, { detail: next }));
}
