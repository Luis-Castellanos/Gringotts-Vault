/**
 * Bulk-categorize the review queue with Claude (Tier 2 of the categorization
 * plan). Gathers the distinct merchants still needing review, asks Claude to
 * map each to a category slug from the user's taxonomy (tool-use → structured
 * output), and writes the suggestion onto matching transactions. They stay
 * needs_review so you confirm them in Review.
 *
 *   POST /api/categorize   → { categorized, merchants, skipped }
 *
 * Requires ANTHROPIC_API_KEY in the environment. If it's absent the route
 * returns a clear 'not_configured' error and changes nothing — so the
 * "Categorize with Claude" button degrades gracefully until a key is added.
 * Model is overridable via ANTHROPIC_MODEL (defaults to Haiku).
 */

import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { categories, transactions } from '@/lib/db/schema';
import { fail, handler, ok } from '@/lib/api/respond';
import { UNCATEGORIZED_SLUG } from '@/lib/transactions/taxonomy';
import { getAnthropicKey, getAnthropicModel } from '@/lib/settings';

export const runtime = 'nodejs';

const MAX_MERCHANTS = 200;

type Assignment = { merchant: string; categorySlug: string };

export const POST = handler(async () => {
  // Distinct merchants among transactions still needing review.
  const pending = await db
    .selectDistinct({ merchant: transactions.merchant })
    .from(transactions)
    .where(and(eq(transactions.needsReview, true), isNotNull(transactions.merchant)));
  const merchants = pending.map((p) => p.merchant!).filter(Boolean).slice(0, MAX_MERCHANTS);

  if (merchants.length === 0) {
    return ok({ categorized: 0, merchants: 0, skipped: 0, message: 'Nothing left to categorize.' });
  }

  const apiKey = await getAnthropicKey();
  if (!apiKey) {
    return fail('not_configured', 'Add your Anthropic API key in Settings (or ANTHROPIC_API_KEY in .env) to enable Claude categorization.', 400);
  }
  const model = await getAnthropicModel();

  // Taxonomy for grounding: slug → id, plus a readable list with parent context.
  const cats = await db
    .select({ id: categories.id, slug: categories.slug, name: categories.name, parentId: categories.parentId })
    .from(categories)
    .where(eq(categories.isArchived, false));
  const idBySlug = new Map(cats.map((c) => [c.slug, c.id]));
  const nameById = new Map(cats.map((c) => [c.id, c.name]));
  const taxonomyText = cats
    .map((c) => `${c.slug}: ${c.parentId ? `${nameById.get(c.parentId) ?? '?'} / ` : ''}${c.name}`)
    .join('\n');

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      tools: [
        {
          name: 'assign_categories',
          description: 'Assign every merchant to the single best-fitting category slug from the taxonomy.',
          input_schema: {
            type: 'object',
            properties: {
              assignments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    merchant: { type: 'string' },
                    categorySlug: { type: 'string', description: 'A slug from the taxonomy, or uncategorized if unclear.' },
                  },
                  required: ['merchant', 'categorySlug'],
                },
              },
            },
            required: ['assignments'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'assign_categories' },
      messages: [
        {
          role: 'user',
          content:
            `Categorize each bank/card transaction merchant into my taxonomy. ` +
            `Use only the slugs below; if a merchant is ambiguous use "${UNCATEGORIZED_SLUG}".\n\n` +
            `Taxonomy (slug: [parent /] name):\n${taxonomyText}\n\n` +
            `Merchants:\n${merchants.map((m) => `- ${m}`).join('\n')}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    return fail('claude_error', `Claude request failed (${resp.status}). ${detail.slice(0, 200)}`, 502);
  }

  const json = (await resp.json()) as { content?: { type: string; input?: { assignments?: Assignment[] } }[] };
  const toolUse = json.content?.find((c) => c.type === 'tool_use');
  const assignments = toolUse?.input?.assignments ?? [];

  // Apply suggestions: set the category on matching needs_review rows, but keep
  // needs_review=true so the user confirms them in Review.
  let categorized = 0;
  let skipped = 0;
  for (const a of assignments) {
    const categoryId = idBySlug.get(a.categorySlug);
    if (!categoryId || a.categorySlug === UNCATEGORIZED_SLUG) {
      skipped++;
      continue;
    }
    const updated = await db
      .update(transactions)
      .set({ categoryId, updatedAt: new Date() })
      .where(and(eq(transactions.merchant, a.merchant), eq(transactions.needsReview, true)))
      .returning({ id: transactions.id });
    categorized += updated.length;
  }

  return ok({ categorized, merchants: merchants.length, skipped });
});
