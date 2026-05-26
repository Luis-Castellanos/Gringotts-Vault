/**
 * The canonical category/sub-category glyph — its keyword emoji on a tint of its
 * color. Use this anywhere a category surfaces (filters, dropdowns, settings,
 * reports) so the iconography is consistent everywhere. See lib/categories/icons.
 */

import { iconFor, iconBg } from '@/lib/categories/icons';

export function CategoryIcon({ name, color, size = 20 }: { name: string; color?: string | null; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0 leading-none"
      style={{ width: size, height: size, background: iconBg(color ?? null), fontSize: Math.round(size * 0.56) }}
      aria-hidden
    >
      {iconFor(name)}
    </span>
  );
}
