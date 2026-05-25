/** Asset-class display labels — pure (no DB), safe to import from client UI. */

const ASSET_CLASS_LABEL: Record<string, string> = {
  equity: 'Stocks',
  etf: 'ETFs',
  mutual_fund: 'Mutual funds',
  bond: 'Bonds',
  cash: 'Cash',
  crypto: 'Crypto',
  option: 'Options',
  other: 'Other',
};

export const assetClassLabel = (k: string): string => ASSET_CLASS_LABEL[k] ?? k;
