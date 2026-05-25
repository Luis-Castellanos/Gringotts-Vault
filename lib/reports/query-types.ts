/**
 * Shared types + option lists for the custom report builder. No DB import, so
 * the schema (jsonb column type), the API, and the client UI can all reference
 * the same definition.
 */

export type GroupByDim = 'category' | 'merchant' | 'account' | 'month';
export type FlowFilter = 'outflow' | 'inflow' | 'all';

export type ReportQueryDef = {
  groupBy: GroupByDim;
  flow: FlowFilter;
  from: string | null; // YYYY-MM-DD
  to: string | null; // YYYY-MM-DD
  minAmount: number | null; // absolute dollars
  maxAmount: number | null;
};

export type ReportResultRow = { key: string; label: string; total: number; count: number };
export type ReportResult = {
  rows: ReportResultRow[];
  total: number;
  count: number;
};

export type SavedQuery = { id: string; name: string; definition: ReportQueryDef; createdAt: string };

export const GROUP_BY_OPTIONS: { id: GroupByDim; label: string }[] = [
  { id: 'category', label: 'Category' },
  { id: 'merchant', label: 'Merchant' },
  { id: 'account', label: 'Account' },
  { id: 'month', label: 'Month' },
];

export const FLOW_OPTIONS: { id: FlowFilter; label: string }[] = [
  { id: 'outflow', label: 'Spending' },
  { id: 'inflow', label: 'Income' },
  { id: 'all', label: 'All (excl. transfers)' },
];

export const DEFAULT_QUERY: ReportQueryDef = {
  groupBy: 'category',
  flow: 'outflow',
  from: null,
  to: null,
  minAmount: null,
  maxAmount: null,
};
