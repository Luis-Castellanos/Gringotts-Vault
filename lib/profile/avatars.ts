/**
 * Avatar presets + helpers. Client-safe (no DB import) so the Sidebar, the
 * Settings editor, and the login screen can all share them. An avatar is either
 * an uploaded image (stored as a data URL) or one of these gradient/solid
 * presets shown behind the user's initials.
 */

export type AvatarKind = 'gradient' | 'image';

export type AvatarPreset = { id: string; label: string; css: string };

// `css` is a ready-to-use CSS `background` value (gradient or solid color).
export const AVATAR_PRESETS: readonly AvatarPreset[] = [
  { id: 'monarch', label: 'Monarch', css: 'linear-gradient(135deg, #fb923c 0%, #c2410c 100%)' },
  { id: 'amber', label: 'Amber', css: 'linear-gradient(135deg, #fbbf24 0%, #b45309 100%)' },
  { id: 'rose', label: 'Rose', css: 'linear-gradient(135deg, #fb7185 0%, #be123c 100%)' },
  { id: 'violet', label: 'Violet', css: 'linear-gradient(135deg, #c084fc 0%, #6d28d9 100%)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(135deg, #38bdf8 0%, #1d4ed8 100%)' },
  { id: 'teal', label: 'Teal', css: 'linear-gradient(135deg, #2dd4bf 0%, #0d9488 100%)' },
  { id: 'forest', label: 'Forest', css: 'linear-gradient(135deg, #34d399 0%, #047857 100%)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg, #f97316 0%, #db2777 100%)' },
  { id: 'graphite', label: 'Graphite', css: '#374151' },
  { id: 'slate', label: 'Slate', css: '#475569' },
  { id: 'plum', label: 'Plum', css: '#6d28d9' },
  { id: 'ink', label: 'Ink', css: '#1f2937' },
];

export const DEFAULT_AVATAR_GRADIENT = 'monarch';

/** CSS background for a preset id, falling back to the default. */
export function presetCss(id: string | null | undefined): string {
  return (AVATAR_PRESETS.find((p) => p.id === id) ?? AVATAR_PRESETS[0]!).css;
}

/** 1–2 letter initials from a name; '?' when empty. */
export function initialsFromName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export type ProfileData = {
  name: string;
  avatarKind: AvatarKind;
  avatarGradient: string;
  avatarImage: string | null;
  navHidden: string[];
  navOrder: string[];
};

/** Event the Settings editor dispatches so the Sidebar updates without a reload. */
export const PROFILE_EVENT = 'vault:profile';
