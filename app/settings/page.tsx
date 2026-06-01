import { asc, desc, eq, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { PageShell } from '@/components/PageShell';
import { db } from '@/lib/db/client';
import { accountTypeGroups, accountTypes, accounts, categories, transactions, vendorRules } from '@/lib/db/schema';
import { ANTHROPIC_KEY, MARKET_DATA_KEY, getAnthropicKey, getAnthropicModel, getSetting } from '@/lib/settings';
import { getProfile } from '@/lib/profile/load';
import { loadTaxonomyStyle } from '@/lib/taxonomy-style';
import { AccountsSettingsClient, type AcctRow } from '../accounts/AccountsSettingsClient';
import '../accounts/accounts-settings.css';
import { SettingsClient, type GroupRow, type TypeRow } from './SettingsClient';
import { SettingsTabs } from './SettingsTabs';
import { ProfileSettings } from './ProfileSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { SidebarSettings } from './SidebarSettings';
import { ClaudeSettings } from './ClaudeSettings';
import { MarketDataSettings } from './MarketDataSettings';
import { DangerZonePanel, MaintenancePanel } from './MaintenancePanel';
import { ExportPanel } from './ExportPanel';
import { MerchantSettings, type MerchantCategoryOption, type MerchantRow } from './MerchantSettings';
import { CategoriesClient, type CatNode } from '../categories/CategoriesClient';
import '../categories/categories.css';

export const metadata = { title: 'Settings · Vault' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const parentCat = alias(categories, 'settings_parent_cat');
  // Independent reads — taxonomy groups/types, per-type usage counts, and the
  // three Anthropic settings — fired together.
  const [groups, types, usage, dbKey, anthropicKey, model, marketDbKey, profile, cats, catsWithParents, catCounts, acctRows, taxStyle, acctStats, merchantRowsRaw] = await Promise.all([
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
    db
      .select({ id: categories.id, name: categories.name, color: categories.color, flowType: categories.flowType, parentId: categories.parentId, sortOrder: categories.sortOrder })
      .from(categories)
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db
      .select({
        id: categories.id,
        name: categories.name,
        color: categories.color,
        parentId: categories.parentId,
        parentName: parentCat.name,
      })
      .from(categories)
      .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
      .where(eq(categories.isArchived, false))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
    db.select({ catId: transactions.categoryId, n: sql<number>`count(*)::int` }).from(transactions).groupBy(transactions.categoryId),
    db.select().from(accounts).orderBy(asc(accounts.name)),
    loadTaxonomyStyle(),
    db
      .select({ accountId: transactions.accountId, count: sql<number>`count(*)::int`, balance: sql<string>`COALESCE(SUM(${transactions.amount}), 0)::text` })
      .from(transactions)
      .groupBy(transactions.accountId),
    db
      .select({
        merchant: transactions.merchant,
        transactionCount: sql<number>`count(*)::int`,
        categoryId: vendorRules.categoryId,
        source: vendorRules.source,
        categoryName: categories.name,
        parentCategoryName: parentCat.name,
        categoryColor: categories.color,
      })
      .from(transactions)
      .leftJoin(vendorRules, eq(transactions.merchant, vendorRules.merchant))
      .leftJoin(categories, eq(vendorRules.categoryId, categories.id))
      .leftJoin(parentCat, eq(categories.parentId, parentCat.id))
      .where(isNotNull(transactions.merchant))
      .groupBy(transactions.merchant, vendorRules.categoryId, vendorRules.source, categories.name, parentCat.name, categories.color)
      .orderBy(desc(sql<number>`count(*)::int`), asc(transactions.merchant)),
  ]);
  const countBySlug = new Map(usage.map((u) => [u.type, u.n]));
  const catCountById = new Map(catCounts.map((c) => [c.catId, c.n]));
  const catNodes: CatNode[] = cats.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    flowType: c.flowType,
    parentId: c.parentId,
    sortOrder: c.sortOrder,
    count: catCountById.get(c.id) ?? 0,
  }));
  const merchantCategories: MerchantCategoryOption[] = catsWithParents.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color ?? null,
    parentId: c.parentId ?? null,
    parentName: c.parentName ?? null,
  }));
  const merchantRows: MerchantRow[] = merchantRowsRaw.map((m) => ({
    merchant: m.merchant ?? '',
    transactionCount: Number(m.transactionCount),
    categoryId: m.categoryId ?? null,
    categoryName: m.categoryName ?? null,
    parentCategoryName: m.parentCategoryName ?? null,
    categoryColor: m.categoryColor ?? null,
    source: m.source ?? null,
  })).filter((m) => m.merchant.trim().length > 0);

  const acctStatById = new Map(acctStats.map((s) => [s.accountId, s]));
  const acctRowsView: AcctRow[] = acctRows.map((a) => {
    const s = acctStatById.get(a.id);
    return {
      id: a.id,
      name: a.name,
      institution: a.institution ?? '',
      last4: a.accountNumber ?? '',
      type: a.type,
      icon: taxStyle.typeIcon[a.type] ?? '📁',
      assetClass: a.assetClass,
      isActive: a.isActive,
      openedDate: a.openedAt ?? null,
      creditLimit: a.creditLimit != null ? Number(a.creditLimit) : null,
      apr: a.apr != null ? Number(a.apr) : null,
      apy: a.apy != null ? Number(a.apy) : null,
      interestRate: a.interestRate != null ? Number(a.interestRate) : null,
      monthlyPayment: a.monthlyPayment != null ? Number(a.monthlyPayment) : null,
      originalPrincipal: a.originalPrincipal != null ? Number(a.originalPrincipal) : null,
      maturityDate: a.maturityDate ?? null,
      accountSubtype: a.accountSubtype ?? null,
      count: s?.count ?? 0,
      balance: s ? Math.round(Number(s.balance) * 100) / 100 : 0,
    };
  });
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
    <PageShell variant="form">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] mb-4">Settings</h1>
      <SettingsTabs
        tabs={[
          { id: 'profile', label: 'Profile', content: <><ProfileSettings initial={profile} /><AppearanceSettings /></> },
          { id: 'sidebar', label: 'Sidebar', content: <SidebarSettings initialHidden={profile.navHidden} initialLayout={profile.navLayout} /> },
          { id: 'accounts', label: 'Accounts', content: <div className="acctset-page"><AccountsSettingsClient accounts={acctRowsView} /></div> },
          { id: 'merchants', label: 'Merchants', content: <MerchantSettings initialRows={merchantRows} categories={merchantCategories} /> },
          { id: 'account-types', label: 'Account Types', content: <SettingsClient groups={groupRows} rows={rows} /> },
          { id: 'categories', label: 'Categories', content: <div className="categories-page"><CategoriesClient nodes={catNodes} /></div> },
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
                <DangerZonePanel />
              </>
            ),
          },
        ]}
      />
    </PageShell>
  );
}
