import { asc, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { accountTypeGroups, accountTypes, accounts } from '@/lib/db/schema';
import { ANTHROPIC_KEY, MARKET_DATA_KEY, getAnthropicKey, getAnthropicModel, getSetting } from '@/lib/settings';
import { getProfile } from '@/lib/profile/load';
import { SettingsClient, type GroupRow, type TypeRow } from './SettingsClient';
import { SettingsTabs } from './SettingsTabs';
import { ProfileSettings } from './ProfileSettings';
import { SidebarSettings } from './SidebarSettings';
import { ClaudeSettings } from './ClaudeSettings';
import { MarketDataSettings } from './MarketDataSettings';
import { MaintenancePanel } from './MaintenancePanel';
import { ExportPanel } from './ExportPanel';

export const metadata = { title: 'Settings · Vault' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  // Independent reads — taxonomy groups/types, per-type usage counts, and the
  // three Anthropic settings — fired together.
  const [groups, types, usage, dbKey, anthropicKey, model, marketDbKey, profile] = await Promise.all([
    db.select().from(accountTypeGroups).orderBy(asc(accountTypeGroups.sortOrder)),
    db.select().from(accountTypes).orderBy(asc(accountTypes.sortOrder)),
    db
      .select({ type: accounts.type, n: sql<number>`count(*)::int` })
      .from(accounts)
      .groupBy(accounts.type),
    getSetting(ANTHROPIC_KEY),
    getAnthropicKey(),
    getAnthropicModel(),
    getSetting(MARKET_DATA_KEY),
    getProfile(),
  ]);
  const countBySlug = new Map(usage.map((u) => [u.type, u.n]));
  const hasKey = !!anthropicKey;
  const keySource = dbKey ? 'settings' : process.env.ANTHROPIC_API_KEY ? 'env' : 'none';
  const hasMarketKey = !!(marketDbKey || process.env.MARKET_DATA_KEY);
  const marketKeySource = marketDbKey ? 'settings' : process.env.MARKET_DATA_KEY ? 'env' : 'none';

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
    <main className="w-full max-w-[1180px] px-10 pt-6 pb-20">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] mb-4">Settings</h1>
      <SettingsTabs
        tabs={[
          { id: 'profile', label: 'Profile', content: <ProfileSettings initial={profile} /> },
          { id: 'sidebar', label: 'Sidebar', content: <SidebarSettings initialHidden={profile.navHidden} /> },
          { id: 'accounts', label: 'Account Types', content: <SettingsClient groups={groupRows} rows={rows} /> },
          {
            id: 'integrations',
            label: 'Integrations',
            content: (
              <>
                <ClaudeSettings hasKey={hasKey} keySource={keySource} model={model} />
                <MarketDataSettings hasKey={hasMarketKey} keySource={marketKeySource} />
              </>
            ),
          },
          {
            id: 'data',
            label: 'Data & Export',
            content: (
              <>
                <MaintenancePanel />
                <ExportPanel />
              </>
            ),
          },
        ]}
      />
    </main>
  );
}
