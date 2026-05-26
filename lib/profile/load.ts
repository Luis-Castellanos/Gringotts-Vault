/**
 * Owner profile + sidebar prefs, persisted in the app_settings key/value table
 * (single-user app — no user row). Read on the server (Settings page, /api/profile)
 * and surfaced to the Sidebar via /api/profile.
 */

import { getSetting, setSetting } from '@/lib/settings';
import { ALL_NAV_HREFS, normalizeSections } from '@/components/nav-config';
import { DEFAULT_AVATAR_GRADIENT, type AvatarKind, type NavSection, type ProfileData } from './avatars';

const NAME_KEY = 'profile_name';
const KIND_KEY = 'profile_avatar_kind';
const GRADIENT_KEY = 'profile_avatar_gradient';
const IMAGE_KEY = 'profile_avatar_image';
const NAV_HIDDEN_KEY = 'nav_hidden';
const NAV_LAYOUT_KEY = 'nav_layout';

const VALID_HREFS = new Set<string>(ALL_NAV_HREFS);

function parseHidden(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    // Drop anything no longer in the nav (stale prefs after a rename/removal).
    return arr.filter((h): h is string => typeof h === 'string' && VALID_HREFS.has(h));
  } catch {
    return [];
  }
}

// The custom sidebar layout (sections + ordered pages). normalizeSections drops
// stale/duplicate hrefs and appends any new pages, so the result is always valid.
function parseLayout(raw: string | null): NavSection[] {
  if (!raw) return normalizeSections(null);
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSections(Array.isArray(parsed) ? (parsed as NavSection[]) : null);
  } catch {
    return normalizeSections(null);
  }
}

export async function getProfile(): Promise<ProfileData> {
  const [name, kind, gradient, image, navHidden, navLayout] = await Promise.all([
    getSetting(NAME_KEY),
    getSetting(KIND_KEY),
    getSetting(GRADIENT_KEY),
    getSetting(IMAGE_KEY),
    getSetting(NAV_HIDDEN_KEY),
    getSetting(NAV_LAYOUT_KEY),
  ]);
  return {
    name: name ?? '',
    avatarKind: kind === 'image' ? 'image' : 'gradient',
    avatarGradient: gradient || DEFAULT_AVATAR_GRADIENT,
    avatarImage: image || null,
    navHidden: parseHidden(navHidden),
    navLayout: parseLayout(navLayout),
  };
}

export type ProfilePatch = {
  name?: string;
  avatarKind?: AvatarKind;
  avatarGradient?: string;
  avatarImage?: string | null;
  navHidden?: string[];
  navLayout?: NavSection[];
};

export async function setProfile(patch: ProfilePatch): Promise<void> {
  const writes: Promise<void>[] = [];
  if (patch.name !== undefined) writes.push(setSetting(NAME_KEY, patch.name.trim() || null));
  if (patch.avatarKind !== undefined) writes.push(setSetting(KIND_KEY, patch.avatarKind));
  if (patch.avatarGradient !== undefined) writes.push(setSetting(GRADIENT_KEY, patch.avatarGradient || null));
  if (patch.avatarImage !== undefined) writes.push(setSetting(IMAGE_KEY, patch.avatarImage || null));
  if (patch.navHidden !== undefined) {
    const clean = patch.navHidden.filter((h) => VALID_HREFS.has(h));
    writes.push(setSetting(NAV_HIDDEN_KEY, JSON.stringify(clean)));
  }
  if (patch.navLayout !== undefined) {
    writes.push(setSetting(NAV_LAYOUT_KEY, JSON.stringify(normalizeSections(patch.navLayout))));
  }
  await Promise.all(writes);
}
