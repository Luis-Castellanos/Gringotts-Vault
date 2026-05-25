import { asc, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accountTypeGroups, accountTypes, accounts } from '@/lib/db/schema';
import { Sidebar } from '@/components/Sidebar';
import { ANTHROPIC_KEY, getAnthropicKey, getAnthropicModel, getSetting } from '@/lib/settings';
import { SettingsClient, type GroupRow, type TypeRow } from './SettingsClient';
import { ClaudeSettings } from './ClaudeSettings';
import { ExportPanel } from './ExportPanel';

export const metadata = { title: 'Settings · Vault' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const groups = await db.select().from(accountTypeGroups).orderBy(asc(accountTypeGroups.sortOrder));
  const types = await db.select().from(accountTypes).orderBy(asc(accountTypes.sortOrder));
  const usage = await db
    .select({ type: accounts.type, n: sql<number>`count(*)::int` })
    .from(accounts)
    .groupBy(accounts.type);
  const countBySlug = new Map(usage.map((u) => [u.type, u.n]));

  const dbKey = await getSetting(ANTHROPIC_KEY);
  const hasKey = !!(await getAnthropicKey());
  const model = await getAnthropicModel();
  const keySource = dbKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'env' : 'none';

  const groupRows: GroupRow[] = groups.map((g) => ({ key: g.key, label: g.label, color: g.color }));
  const rows: TypeRow[] = types.map((t) => ({
    slug: t.slug,
    label: t.label,
    group: t.groupKey,
    assetClass: t.assetClass,
    icon: t.icon ?? '📁',
    color: t.color,
    isArchived: t.isArchived,
    isBuiltin: t.isBuiltin,
    count: countBySlug.get(t.slug) ?? 0,
  }));

  return (
    <div className="flex min-h-[calc(100vh_-_44px)]">
      <Sidebar />
      <div className="flex-1 flex justify-center">
        <main className="w-full max-w-[1180px] px-10 pt-8 pb-20">
          <h1 className="text-[22px] font-semibold tracking-[-0.01em] mb-1">Settings</h1>
          <p className="text-[13px] text-text-tertiary mb-8">Manage Vault’s account taxonomy and preferences.</p>
          <SettingsClient groups={groupRows} rows={rows} />
          <ClaudeSettings hasKey={hasKey} keySource={keySource} model={model} />
          <ExportPanel />
        </main>
      </div>
    </div>
  );
}
