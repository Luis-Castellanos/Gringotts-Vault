// lib/parser/types.ts

export type ParsedTransaction = {
  accountId: string;
  date: string;              // ISO 'YYYY-MM-DD'
  postedDate?: string;
  amount: string;            // signed decimal string with 2 places
  rawDescription: string;
  category: string;
  subcategory: string;
  isTransfer: boolean;
  transferCounterparty?: {
    institution?: string;
    accountType?: string;
    last4?: string;
  };
};

export type ParsedStatement = {
  folderSlug: string;
  statementPeriod: string;
  transactions: ParsedTransaction[];
  subAccountsFound: Array<{ accountNumber: string; accountName: string }>;
  parserName: string;
  parserVersion: string;
  warnings?: string[];
};

export type ParserContext = {
  sourceFile: string;
  fileHash: string;
  folderSlug: string;
  accountsByNumber: Record<string, string>;
};

export type DetectorFn = (text: string, filename: string) => boolean;
export type ParserFn = (text: string, ctx: ParserContext) => ParsedStatement;

export type ParserModule = {
  parse: ParserFn;
  detect: DetectorFn;
  name: string;
  version: string;
};
