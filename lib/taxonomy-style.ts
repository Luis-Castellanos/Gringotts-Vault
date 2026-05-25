/**
 * Loads the live (user-edited) presentation for the account taxonomy — group
 * colors/labels and per-type icons/colors — so pages can render the same look
 * the Settings editor defines. Server-only (queries the DB). Falls back to the
 * built-in defaults in lib/account-types for anything not set.
 */

import { asc } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accountTypeGroups, accountTypes } from '@/lib/db/schema';
import { accountTypeIcon } from '@/lib/account-types';

export type TaxonomyStyle = {
  groupColor: Record<string, string>;
  groupLabel: Record<string, string>;
  typeIcon: Record<string, string>;
  typeColor: Record<string, string | null>;
};

export async function loadTaxonomyStyle(): Promise<TaxonomyStyle> {
  const [groups, types] = await Promise.all([
    db.select().from(accountTypeGroups).orderBy(asc(accountTypeGroups.sortOrder)),
    db.select({ slug: accountTypes.slug, icon: accountTypes.icon, color: accountTypes.color }).from(accountTypes),
  ]);
  return {
    groupColor: Object.fromEntries(groups.map((g) => [g.key, g.color])),
    groupLabel: Object.fromEntries(groups.map((g) => [g.key, g.label])),
    typeIcon: Object.fromEntries(types.map((t) => [t.slug, t.icon ?? accountTypeIcon(t.slug)])),
    typeColor: Object.fromEntries(types.map((t) => [t.slug, t.color])),
  };
}
