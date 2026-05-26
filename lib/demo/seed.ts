/**
 * Seed (or reseed) the demo database with rich sample data. DESTRUCTIVE: it
 * wipes the data tables first, so only ever point it at the throwaway demo DB
 * (the /api/demo/reset route is gated by DEMO_MODE; the CLI requires --force).
 *
 * Order: ensure taxonomy (account types/groups + categories) → wipe → insert
 * accounts → properties → transactions/holdings → leases/maintenance/capex →
 * paystubs → goals → profile + tax workspace.
 */

import { db } from '@/lib/db/client';
import * as S from '@/lib/db/schema';
import { wipeAllData } from '@/lib/admin/reset';
import { restoreCategoryTaxonomy } from '@/lib/categories/seed';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_GROUPS } from '@/lib/account-types';
import { setProfile } from '@/lib/profile/load';
import { saveWorkspace } from '@/lib/tax/workspace-store';
import { buildDemoData } from './data';

const num = (v: number | null | undefined) => (v == null ? null : String(v));

async function ensureTaxonomy() {
  for (const g of ACCOUNT_TYPE_GROUPS) {
    await db.insert(S.accountTypeGroups).values({ key: g.key, label: g.label, color: g.color }).onConflictDoNothing();
  }
  for (let i = 0; i < ACCOUNT_TYPES.length; i++) {
    const t = ACCOUNT_TYPES[i]!;
    await db
      .insert(S.accountTypes)
      .values({ slug: t.slug, label: t.label, assetClass: t.assetClass, groupKey: t.group, icon: t.icon, sortOrder: i, isBuiltin: true })
      .onConflictDoNothing();
  }
  await restoreCategoryTaxonomy();
}

export async function seedDemo(): Promise<Record<string, number>> {
  await ensureTaxonomy();

  // Wipe data (wipeAllData covers most tables; goals are extra).
  await db.delete(S.goalAccounts);
  await db.delete(S.goals);
  await wipeAllData();

  const data = buildDemoData();
  const counts: Record<string, number> = {};

  // Accounts
  await db.insert(S.accounts).values(
    data.accounts.map((x) => ({
      id: x.id,
      name: x.name,
      displayName: x.accountNumber ? `${x.name} ••${x.accountNumber}` : x.name,
      institution: x.institution ?? null,
      accountNumber: x.accountNumber ?? null,
      type: x.type,
      assetClass: x.assetClass,
      openedAt: x.openedAt ?? null,
      creditLimit: num(x.creditLimit),
      apr: num(x.apr),
      apy: num(x.apy),
      interestRate: num(x.interestRate),
      monthlyPayment: num(x.monthlyPayment),
      originalPrincipal: num(x.originalPrincipal),
      maturityDate: x.maturityDate ?? null,
      accountSubtype: x.accountSubtype ?? null,
      signupBonus: x.signupBonus ?? null,
      benefits: x.benefits ?? null,
    })),
  );
  counts.accounts = data.accounts.length;

  // Properties (reference mortgage/escrow accounts)
  await db.insert(S.properties).values(
    data.properties.map((p) => ({
      id: p.id, name: p.name, street: p.street, city: p.city, state: p.state, zip: p.zip,
      propertyType: p.propertyType, useType: p.useType,
      propertyTaxAnnual: num(p.propertyTaxAnnual), insuranceAnnual: num(p.insuranceAnnual),
      beds: p.beds, baths: num(p.baths), sqft: p.sqft,
      acquisitionDate: p.acquisitionDate, acquisitionPrice: num(p.acquisitionPrice), landValuePct: num(p.landValuePct),
      marketValue: num(p.marketValue), mortgageAccountId: p.mortgageAccountId ?? null, escrowAccountId: p.escrowAccountId ?? null,
      isActive: true,
    })),
  );
  counts.properties = data.properties.length;

  // Resolve category slug → id
  const cats = await db.select({ id: S.categories.id, slug: S.categories.slug }).from(S.categories);
  const catBySlug = new Map(cats.map((c) => [c.slug, c.id]));

  // Transactions — single insert so self-referential transferPairId resolves.
  await db.insert(S.transactions).values(
    data.transactions.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      categoryId: t.categorySlug ? catBySlug.get(t.categorySlug) ?? null : null,
      propertyId: t.propertyId ?? null,
      date: t.date,
      amount: String(t.amount),
      currency: 'USD',
      rawDescription: t.raw,
      merchant: t.merchant,
      needsReview: false,
      isTransfer: t.isTransfer ?? false,
      transferPairId: t.transferPairId ?? null,
      contentHash: t.id,
    })),
  );
  counts.transactions = data.transactions.length;

  // Holdings
  await db.insert(S.holdings).values(
    data.holdings.map((x) => ({
      id: x.id, accountId: x.accountId, symbol: x.symbol, name: x.name, assetClass: x.assetClass,
      quantity: num(x.quantity), costBasis: num(x.costBasis), statementPrice: num(x.statementPrice), statementValue: num(x.statementValue), asOf: x.asOf,
    })),
  );
  counts.holdings = data.holdings.length;

  if (data.leases.length)
    await db.insert(S.leases).values(data.leases.map((l) => ({ id: l.id, propertyId: l.propertyId, unit: l.unit, tenantName: l.tenantName, tenantContact: l.tenantContact, rentAmount: num(l.rentAmount), depositAmount: num(l.depositAmount), startDate: l.startDate, endDate: l.endDate, status: l.status })));
  counts.leases = data.leases.length;

  if (data.maintenance.length)
    await db.insert(S.maintenance).values(data.maintenance.map((m) => ({ id: m.id, propertyId: m.propertyId, title: m.title, status: m.status, category: m.category, vendor: m.vendor, cost: num(m.cost), openedAt: m.openedAt, completedAt: m.completedAt })));
  counts.maintenance = data.maintenance.length;

  if (data.capex.length)
    await db.insert(S.capex).values(data.capex.map((c) => ({ id: c.id, propertyId: c.propertyId, description: c.description, cost: num(c.cost)!, placedInService: c.placedInService, usefulLifeYears: c.usefulLifeYears })));
  counts.capex = data.capex.length;

  // Paystubs
  await db.insert(S.paystubs).values(
    data.paystubs.map((p) => ({
      id: p.id, payDate: p.payDate, payPeriod: p.payPeriod, voucher: p.voucher, employer: p.employer,
      gross: num(p.gross), net: num(p.net), deductionsTotal: num(p.deductionsTotal), taxesTotal: num(p.taxesTotal), employerTotal: num(p.employerTotal), hours: num(p.hours),
      earnings: p.earnings, deductions: p.deductions, taxes: p.taxes, employerContributions: p.employerContributions,
    })),
  );
  counts.paystubs = data.paystubs.length;

  // Goals + assignments
  for (const g of data.goals) {
    await db.insert(S.goals).values({ id: g.id, name: g.name, type: g.type, targetAmount: num(g.targetAmount), targetDate: g.targetDate, monthlyContribution: num(g.monthlyContribution), growthRatePct: num(g.growthRatePct), icon: g.icon ?? null, color: g.color ?? null });
    for (const accountId of g.accountIds) await db.insert(S.goalAccounts).values({ goalId: g.id, accountId, useEntireBalance: true });
  }
  counts.goals = data.goals.length;

  // Profile + tax workspace
  await setProfile({ name: data.profile.name, navHidden: data.profile.navHidden });
  await saveWorkspace(data.taxWorkspace);

  return counts;
}
