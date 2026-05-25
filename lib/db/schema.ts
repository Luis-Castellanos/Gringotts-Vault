/**
 * Drizzle schema — TypeScript port of schema.sql.
 *
 * Design principles mirror the SQL version:
 *   1. Sign convention: amount is signed from the account holder's perspective.
 *      Outflows negative, inflows positive, on every account type.
 *   2. Transfers between own accounts are flagged so they can be excluded
 *      from spending/income aggregations without losing records.
 *   3. Categories are hierarchical via parent_id.
 *   4. Imports are idempotent via content_hash.
 *   5. Balances are derived from transaction history (importing each account
 *      from inception). The balance_snapshots table is kept for accounts
 *      where transactions are incomplete (e.g. brokerage / retirement where
 *      transaction-level data may not include market-value changes), but is
 *      not populated by the standard load-master pipeline.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  date,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  check,
  customType,
  AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Postgres bytea <-> Node Buffer. Drizzle has no built-in bytea helper.
export const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const accountTypeEnum = pgEnum('account_type', [
  'checking',
  'savings',
  'credit_card',
  'brokerage',
  'retirement',
  'loan',
  'cash',
  'other',
]);

export const assetClassEnum = pgEnum('asset_class', ['asset', 'liability']);

// Reporting bucket for a category. Independent of a transaction's sign:
//   inflow   — income, gifts, unexpected refunds
//   outflow  — spending; cashback nets here as a positive-amount outflow row
//   transfer — money between your own accounts; excluded from spend/income
// This is the source of truth for Cashflow / income-vs-spending reports.
export const flowTypeEnum = pgEnum('flow_type', ['inflow', 'outflow', 'transfer']);

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

// account_types — the editable account/asset taxonomy. lib/account-types.ts
// holds the canonical seed; user-added types live only here. accounts.type
// references slug (plain text, not an enum, so the list can grow at runtime).
export const accountTypes = pgTable('account_types', {
  slug: text('slug').primaryKey(),
  label: text('label').notNull(),
  assetClass: assetClassEnum('asset_class').notNull().default('asset'),
  groupKey: text('group').notNull().default('other'),
  icon: text('icon'), // emoji
  color: text('color'), // hex; null → inherit the group color
  sortOrder: integer('sort_order').notNull().default(0),
  isArchived: boolean('is_archived').notNull().default(false),
  isBuiltin: boolean('is_builtin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// account_type_groups — the editable top-level parents (label + color + order).
// Seeded from lib/account-types.ts ACCOUNT_TYPE_GROUPS. Keys are fixed (built-in).
export const accountTypeGroups = pgTable('account_type_groups', {
  key: text('key').primaryKey(),
  label: text('label').notNull(),
  color: text('color').notNull().default('#94a3b8'),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    institution: text('institution'),
    accountNumber: text('account_number'),
    type: text('type').notNull().references(() => accountTypes.slug),
    assetClass: assetClassEnum('asset_class').notNull(),
    currency: text('currency').notNull().default('USD'),
    color: text('color'),
    icon: text('icon'),
    isActive: boolean('is_active').notNull().default(true),
    openedAt: date('opened_at'),
    closedAt: date('closed_at'),
    notes: text('notes'),
    // Type-specific fields. All nullable; only the ones relevant to a given
    // account type are populated (edited from the Accounts settings page).
    //   credit_card        → creditLimit, apr
    //   checking/savings    → apy
    //   loan                → interestRate, monthlyPayment, originalPrincipal, maturityDate
    //   brokerage/retirement→ accountSubtype (Roth / Traditional / 401(k) / HSA / Brokerage…)
    creditLimit: numeric('credit_limit', { precision: 14, scale: 2 }),
    apr: numeric('apr', { precision: 5, scale: 2 }),
    apy: numeric('apy', { precision: 6, scale: 3 }),
    interestRate: numeric('interest_rate', { precision: 6, scale: 3 }),
    monthlyPayment: numeric('monthly_payment', { precision: 14, scale: 2 }),
    originalPrincipal: numeric('original_principal', { precision: 14, scale: 2 }),
    maturityDate: date('maturity_date'),
    accountSubtype: text('account_subtype'),
    // Manual-entry credit-card metadata (Vault-managed, not from the parser).
    //   signupBonus → { amount, type, valuationCents, spendRequired, spendDeadline }
    //   benefits    → string[] of perks (travel credit, lounge access, …)
    signupBonus: jsonb('signup_bonus').$type<{
      amount: number;
      type: string;
      valuationCents: number;
      spendRequired: number;
      spendDeadline: string;
    }>(),
    benefits: jsonb('benefits').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index('accounts_active_idx').on(t.isActive).where(sql`${t.isActive}`),
    typeIdx: index('accounts_type_idx').on(t.type),
    closedAfterOpened: check(
      'accounts_closed_after_opened',
      sql`${t.closedAt} IS NULL OR ${t.openedAt} IS NULL OR ${t.closedAt} >= ${t.openedAt}`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// properties — real estate holdings (Real Estate page). A property is a house:
// its own market value + acquisition details, optionally linked to a mortgage
// account (accounts.type='mortgage') whose loan terms drive the amortization
// schedule. Equity = market_value − mortgage balance. Rental income/expenses
// and the principal/interest/escrow transaction split are a later phase; this
// table is the anchor that those will hang off.
// ---------------------------------------------------------------------------

export const properties = pgTable(
  'properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(), // label / nickname (defaults to the street line)
    street: text('street'),
    city: text('city'),
    state: text('state'),
    zip: text('zip'),
    // Plain text (not an enum) so new kinds can be added without a migration.
    propertyType: text('property_type').notNull().default('single_family'),
    beds: integer('beds'),
    baths: numeric('baths', { precision: 4, scale: 1 }), // allow half-baths (2.5)
    sqft: integer('sqft'),
    acquisitionDate: date('acquisition_date'),
    acquisitionPrice: numeric('acquisition_price', { precision: 14, scale: 2 }),
    marketValue: numeric('market_value', { precision: 14, scale: 2 }), // current estimate (manual)
    imageUrl: text('image_url'), // display src: an external URL, or /api/properties/[id]/photo for an upload
    image: bytea('image'), // uploaded photo bytes (stored in-DB so it travels with the database)
    imageMime: text('image_mime'),
    // Optional link to the mortgage liability account; its loan terms
    // (originalPrincipal / interestRate / monthlyPayment / maturityDate) drive
    // the amortization table, and its derived balance drives equity.
    mortgageAccountId: uuid('mortgage_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // Escrow sub-account (asset) this property's mortgage escrow accumulates in;
    // created on demand when a payment is first split with an escrow part.
    escrowAccountId: uuid('escrow_account_id').references(() => accounts.id, { onDelete: 'set null' }),
    isActive: boolean('is_active').notNull().default(true), // owned vs sold
    soldDate: date('sold_date'),
    soldPrice: numeric('sold_price', { precision: 14, scale: 2 }),
    sortOrder: integer('sort_order').notNull().default(0),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    mortgageIdx: index('properties_mortgage_idx').on(t.mortgageAccountId),
    activeIdx: index('properties_active_idx').on(t.isActive),
  }),
);

// ---------------------------------------------------------------------------
// categories — hierarchical via parent_id
// ---------------------------------------------------------------------------

export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id, {
      onDelete: 'restrict',
    }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    color: text('color'),
    icon: text('icon'),
    sortOrder: integer('sort_order').notNull().default(0),
    isIncome: boolean('is_income').notNull().default(false),
    // Reporting bucket — see flowTypeEnum. Default 'outflow' so any unclassified
    // category is treated as spending until reclassified.
    flowType: flowTypeEnum('flow_type').notNull().default('outflow'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex('categories_slug_unique').on(t.slug),
    parentIdx: index('categories_parent_idx').on(t.parentId),
    noSelfParent: check(
      'categories_no_self_parent',
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// imports — provenance for each parser run
// ---------------------------------------------------------------------------

export const imports = pgTable(
  'imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceFile: text('source_file').notNull(),
    statementPeriod: text('statement_period'),
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    // Set for in-app uploads so a document's transactions can be found/removed
    // precisely. Null for offline load-master imports. Set-null on doc delete
    // (removing a file without its data leaves the import + rows intact).
    documentId: uuid('document_id').references((): AnyPgColumn => documents.id, { onDelete: 'set null' }),
    rowCount: integer('row_count').notNull().default(0),
    // Structured statement bounds (statementPeriod is the human string).
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    // Statement-stated control totals, captured from the PDF summary independent
    // of the parsed rows — the audit page reconciles these against the derived
    // figures (sum of transactions, running-balance chain). Null when the format
    // doesn't print them or the parser doesn't extract them yet.
    beginningBalance: numeric('beginning_balance', { precision: 14, scale: 2 }),
    endingBalance: numeric('ending_balance', { precision: 14, scale: 2 }),
    statedCredits: numeric('stated_credits', { precision: 14, scale: 2 }),
    statedDebits: numeric('stated_debits', { precision: 14, scale: 2 }),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
  },
  (t) => ({
    accountIdx: index('imports_account_idx').on(t.accountId),
    documentIdx: index('imports_document_idx').on(t.documentId),
    importedAtIdx: index('imports_imported_at_idx').on(t.importedAt),
  }),
);

// ---------------------------------------------------------------------------
// documents — uploaded statement PDFs and their parse lifecycle.
// The file itself is stored as bytea so it travels with the database (no
// external blob store needed for self-hosting). The router fills detected_type
// / issuer / account_ids; status walks uploaded -> parsing -> parsed | failed
// | deferred | duplicate. content_hash dedups re-uploads of the same file.
// detected_type / status are plain text (not enums) so new statement types can
// be added without a schema migration.
// ---------------------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    contentHash: text('content_hash').notNull(),
    mimeType: text('mime_type').notNull().default('application/pdf'),
    byteSize: integer('byte_size').notNull(),
    data: bytea('data').notNull(),
    detectedType: text('detected_type').notNull().default('unknown'),
    detectedIssuer: text('detected_issuer'),
    accountIds: jsonb('account_ids').$type<string[]>(),
    accountLabel: text('account_label'),
    statementPeriod: text('statement_period'),
    status: text('status').notNull().default('uploaded'),
    transactionCount: integer('transaction_count').notNull().default(0),
    parseError: text('parse_error'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    parsedAt: timestamp('parsed_at', { withTimezone: true }),
  },
  (t) => ({
    contentHashUnique: uniqueIndex('documents_content_hash_unique').on(t.contentHash),
    uploadedAtIdx: index('documents_uploaded_at_idx').on(t.uploadedAt),
    statusIdx: index('documents_status_idx').on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// vendor_rules — the "master vendor list": normalized merchant -> category.
// Tier 1 of categorization. Applied deterministically at ingest so repeat
// merchants are auto-categorized; learned/strengthened when the user confirms
// a category in Review (source = confirmed). Seeded from the master.xlsx.
// ---------------------------------------------------------------------------

export const vendorRules = pgTable(
  'vendor_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    merchant: text('merchant').notNull(), // normalized (cleanMerchant output)
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    source: text('source').notNull().default('manual'), // master | manual | claude | confirmed
    hitCount: integer('hit_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    merchantUnique: uniqueIndex('vendor_rules_merchant_unique').on(t.merchant),
  }),
);

// ---------------------------------------------------------------------------
// paystubs — parsed paychecks (different shape than bank transactions). Linked
// to the source document. Feeds the Payroll page once wired.
// ---------------------------------------------------------------------------

export type PaystubLine = { label: string; amount: number };
export type PaystubTaxSettings = {
  filingStatus: string | null;
  federal: string | null;
  claimDependent: number | null;
  deduction: number | null;
  otherIncome: number | null;
  allowances: number | null;
  additionalAllowances: number | null;
  twoJobs: string | null;
  supplementalType: string | null;
};

export const paystubs = pgTable(
  'paystubs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    payDate: date('pay_date'),
    payPeriod: text('pay_period'),
    voucher: text('voucher'),
    employer: text('employer'),
    baseComp: numeric('base_comp', { precision: 14, scale: 2 }),
    gross: numeric('gross', { precision: 14, scale: 2 }),
    net: numeric('net', { precision: 14, scale: 2 }),
    deductionsTotal: numeric('deductions_total', { precision: 14, scale: 2 }),
    taxesTotal: numeric('taxes_total', { precision: 14, scale: 2 }),
    employerTotal: numeric('employer_total', { precision: 14, scale: 2 }),
    hours: numeric('hours', { precision: 8, scale: 2 }),
    nonCashFringe: numeric('non_cash_fringe', { precision: 14, scale: 2 }),
    deposits: jsonb('deposits').$type<{ bank: string; last4: string; amount: number }[]>(),
    // Per-line breakdowns extracted from the stub. Each is [{label, amount}].
    // Only populated when their sum reconciles to the section total (parser-side
    // gate), so a present array can be trusted to add up.
    earnings: jsonb('earnings').$type<PaystubLine[]>(),
    deductions: jsonb('deductions').$type<PaystubLine[]>(),
    taxes: jsonb('taxes').$type<PaystubLine[]>(),
    employerContributions: jsonb('employer_contributions').$type<PaystubLine[]>(),
    imputed: jsonb('imputed').$type<PaystubLine[]>(),
    // The employee's W-4 elections (filing status, dependents, allowances).
    taxSettings: jsonb('tax_settings').$type<PaystubTaxSettings>(),
    sourceFile: text('source_file'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    voucherUnique: uniqueIndex('paystubs_voucher_unique').on(t.voucher),
    payDateIdx: index('paystubs_pay_date_idx').on(t.payDate),
  }),
);

// app_settings — small key/value store for app-level config (e.g. the Anthropic
// API key + model for Claude categorization). Lives in the DB so it's editable
// in Settings and travels with the deployment.
export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// transactions — the core ledger
// ---------------------------------------------------------------------------

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    // Real Estate attribution (manual tag). A transaction also rolls up to a
    // property implicitly when it sits on that property's mortgage/escrow account
    // — see lib/properties/financials.ts. Manual tag overrides/extends that.
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),

    date: date('date').notNull(),
    postedDate: date('posted_date'),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    // Running account balance printed on the statement row (bank statements
    // only; null for credit cards). Powers the audit page's row-by-row
    // balance-chain reconciliation.
    balance: numeric('balance', { precision: 14, scale: 2 }),
    currency: text('currency').notNull().default('USD'),

    rawDescription: text('raw_description').notNull(),
    merchant: text('merchant'),

    needsReview: boolean('needs_review').notNull().default(false),
    isTransfer: boolean('is_transfer').notNull().default(false),
    transferPairId: uuid('transfer_pair_id').references((): AnyPgColumn => transactions.id, {
      onDelete: 'set null',
    }),
    // True when this transaction is broken into transaction_splits parts. The
    // amount stays unchanged (balances untouched); category/flow reports expand
    // the splits instead of using this row's categoryId. See lib/transactions/split.
    isSplit: boolean('is_split').notNull().default(false),

    notes: text('notes'),
    tags: text('tags').array(),

    importId: uuid('import_id').references(() => imports.id, { onDelete: 'set null' }),
    statementPeriod: text('statement_period'),
    sourceFile: text('source_file'),

    contentHash: text('content_hash').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    contentHashUnique: uniqueIndex('transactions_content_hash_unique').on(t.contentHash),
    accountDateIdx: index('transactions_account_date_idx').on(t.accountId, t.date),
    dateIdx: index('transactions_date_idx').on(t.date),
    categoryIdx: index('transactions_category_idx').on(t.categoryId),
    reviewIdx: index('transactions_review_idx').on(t.needsReview).where(sql`${t.needsReview}`),
    transferIdx: index('transactions_transfer_idx').on(t.isTransfer).where(sql`${t.isTransfer}`),
    merchantIdx: index('transactions_merchant_idx').on(t.merchant),
    propertyIdx: index('transactions_property_idx').on(t.propertyId),
    stmtPeriodIdx: index('transactions_stmt_period_idx').on(t.statementPeriod),
    noSelfTransfer: check(
      'transactions_no_self_transfer',
      sql`${t.transferPairId} IS NULL OR ${t.transferPairId} <> ${t.id}`,
    ),
  }),
);

// ---------------------------------------------------------------------------
// transaction_splits — break one transaction into categorized parts.
//
// The parent transaction's `amount` is left untouched, so account balances are
// unaffected (sum of transactions is unchanged). Category/flow reports expand a
// split parent (transactions.is_split = true) into its parts instead of using
// the parent's own category. A transfer part (e.g. mortgage principal → the
// loan account, or escrow → an escrow account) additionally creates a real
// destination transaction in the target account, linked via transfer_txn_id, so
// the money actually moves between accounts. Parts must sum to the parent amount.
// First consumer: the mortgage payment split (principal / interest / escrow).
// ---------------------------------------------------------------------------

export const transactionSplits = pgTable(
  'transaction_splits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    isTransfer: boolean('is_transfer').notNull().default(false),
    // The +leg created in the destination account for a transfer part.
    transferTxnId: uuid('transfer_txn_id').references((): AnyPgColumn => transactions.id, { onDelete: 'set null' }),
    label: text('label'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    txnIdx: index('transaction_splits_txn_idx').on(t.transactionId),
  }),
);

// ---------------------------------------------------------------------------
// balance_snapshots — for accounts where balance ≠ sum(transactions)
// ---------------------------------------------------------------------------

export const balanceSnapshots = pgTable(
  'balance_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    asOfDate: date('as_of_date').notNull(),
    balance: numeric('balance', { precision: 14, scale: 2 }).notNull(),
    source: text('source'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniquePerDay: uniqueIndex('balance_snapshots_unique_per_day').on(t.accountId, t.asOfDate),
    accountDateIdx: index('balance_snapshots_account_date_idx').on(t.accountId, t.asOfDate),
  }),
);

// ---------------------------------------------------------------------------
// Inferred types — use these throughout the app
// ---------------------------------------------------------------------------

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
export type NewBalanceSnapshot = typeof balanceSnapshots.$inferInsert;

export type Import = typeof imports.$inferSelect;
export type NewImport = typeof imports.$inferInsert;
