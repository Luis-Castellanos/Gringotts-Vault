/**
 * Loads the live (user-edited) presentation for the account taxonomy — group
 * colors/labels and per-type icons/colors — so pages can render the same look
 * the Settings editor defines. Server-only (queries the DB). Falls back to the
 * built-in defaults in lib/account-types for anything not set.
 */

import { asc } from 'drizzle-orm';
import { unstable_cache } from 'next/cache';

import { db } from '@/lib/db/client';
import { accountTypeGroups, accountTypes } from '@/lib/db/schema';
import { accountTypeIcon } from '@/lib/account-types';

/**
 * Cache tag for the account-taxonomy reference data. Mutation routes (the
 * account-types / account-type-groups editors) call `revalidateTag` with this so
 * the cached read refreshes immediately on edit; the `revalidate` TTL is just a
 * backstop. See loadTaxonomyStyle.
 */
export const TAXONOMY_TAG = 'account-taxonomy';

export type TaxonomyStyle = {
  groupColor: Record<string, string>;
  groupLabel: Record<string, string>;
  typeIcon: Record<string, string>;
  typeColor: Record<string, string | null>;
};

async function loadTaxonomyStyleUncached(): Promise<TaxonomyStyle> {
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

/**
 * The account taxonomy's presentation (group colors/labels, per-type icons/
 * colors), rendered on Accounts / Net Worth / Files. It changes only via the
 * Settings account-type editor, so it's cached across requests and invalidated
 * by tag on edit (TAXONOMY_TAG) — a safe win since it's pure reference data, not
 * ledger data.
 */
export const loadTaxonomyStyle = unstable_cache(loadTaxonomyStyleUncached, ['taxonomy-style'], {
  tags: [TAXONOMY_TAG],
  revalidate: 3600,
});
