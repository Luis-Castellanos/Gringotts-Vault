/**
 * Owner avatar — an uploaded image, or initials on a gradient/solid preset.
 * Shared by the Sidebar chip, the Settings editor preview, and the login screen.
 * Pure presentational; pass the profile fields in.
 */

import { initialsFromName, presetCss, type AvatarKind } from '@/lib/profile/avatars';

export function Avatar({
  name,
  kind,
  gradient,
  image,
  size = 32,
  className = '',
}: {
  name: string;
  kind: AvatarKind;
  gradient: string;
  image: string | null;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (kind === 'image' && image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt={name || 'Profile'}
        style={dim}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      style={{ ...dim, background: presetCss(gradient) }}
      className={`rounded-full flex items-center justify-center font-semibold text-white shrink-0 ${className}`}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }} className="leading-none tracking-tight">
        {initialsFromName(name)}
      </span>
    </div>
  );
}
