export interface LedgerAmount {
  quantity: string;
  commodity: string;
}

export interface SourceLocation {
  source: string;
  line: number;
  column: number;
}

export interface LedgerTag {
  name: string;
  value: string | null;
}

export interface LedgerComment {
  text: string;
  key: string | null;
  value: string | null;
  location: SourceLocation;
}

export interface LedgerCost {
  total: boolean;
  amount: LedgerAmount;
}

export interface LedgerPosting {
  type: 'posting';
  account: string;
  amount: LedgerAmount | null;
  lotCost: LedgerCost | null;
  cost: LedgerCost | null;
  balanceAssignment: LedgerAmount | null;
  balanceAssertion: LedgerAmount | null;
  postingDate: string | null;
  comments: LedgerComment[];
  tags?: LedgerTag[];
  location: SourceLocation;
}

interface LedgerEntryBase {
  location: SourceLocation;
}

export type LedgerEntry =
  | (LedgerEntryBase & { type: 'include'; path: string; comment: string | null })
  | (LedgerEntryBase & { type: 'account' | 'tag'; name: string; comment: string | null })
  | (LedgerEntryBase & { type: 'commodity'; symbol: string; comment: string | null;
    properties: Array<{ name: string; value: string | null; comment: string | null;
      location: SourceLocation }> })
  | (LedgerEntryBase & { type: 'price'; date: string; commodity: string;
    price: LedgerAmount; comment: string | null })
  | (LedgerEntryBase & { type: 'comment'; text: string })
  | (LedgerEntryBase & { type: 'transaction'; date: string; description: string;
    postings: LedgerPosting[]; comments: LedgerComment[]; tags?: LedgerTag[] });

export interface LedgerSyntaxTree {
  source: string;
  entries: LedgerEntry[];
}

export interface ParseLedgerOptions {
  source?: string;
}

export interface WarningInstance {
  source: string;
  line: number;
  column: number;
  startLine: number;
  endLine: number;
}

export interface WarningGroup {
  code: string;
  message: string;
  instances: WarningInstance[];
}

export interface DateRangeOptions {
  from?: string;
  to?: string;
}

export interface AccountSelectionOptions {
  accounts?: string[];
}

export type DateBasis = 'posting' | 'transaction';
export type Valuation = 'cost' | 'market';
export type Usage = 'all' | 'used' | 'unused';

export interface AggregateOptions extends DateRangeOptions, AccountSelectionOptions {
  dateBasis?: DateBasis;
  valuation?: Valuation;
  groupBy?: 'account' | 'commodity';
  denominate?: boolean;
  withValuationValue?: boolean;
  invert?: boolean;
  includeTotal?: boolean;
}

export interface AggregateRow extends LedgerAmount {
  account?: string;
  valuationValue?: string;
  isTotal?: true;
}

export interface TotalHistoryOptions extends DateRangeOptions, AccountSelectionOptions {
  dateBasis?: DateBasis;
  valuation?: Valuation;
  invert?: boolean;
}

export interface TotalHistoryRow {
  date: string;
  amount: string;
  commodity: string;
}

export interface UnrealizedGainsOptions extends AccountSelectionOptions {
  to?: string;
  dateBasis?: DateBasis;
}

export interface InvestmentPerformanceOptions extends DateRangeOptions, AccountSelectionOptions {
  commodities?: string[];
}

export interface InvestmentPerformancePoint {
  date: string;
  value: number;
  netContributions: number;
  profitLoss: number;
  timeWeightedReturn: number | null;
  timeWeightedReturnAnnualized: number | null;
  moneyWeightedReturn: number | null;
  moneyWeightedReturnTotal: number | null;
}

export interface InvestmentPerformanceResult {
  from: string | null;
  to: string | null;
  commodities: string[];
  valuationCommodity: string;
  openingValue: number;
  endingValue: number;
  netContributions: number;
  profitLoss: number;
  timeWeightedReturn: number | null;
  timeWeightedReturnAnnualized: number | null;
  moneyWeightedReturn: number | null;
  moneyWeightedReturnTotal: number | null;
  points: InvestmentPerformancePoint[];
}

export interface AccountRow {
  account: string;
  comment: string | null;
  used: boolean;
  transactionCount: number;
}

export interface CommodityRow {
  commodity: string;
  comment: string | null;
  format: string | null;
  isDefault: boolean;
  used: boolean;
}

export interface PriceRow {
  date: string;
  baseCommodity: string;
  quoteQuantity: string;
  quoteCommodity: string;
  comment: string | null;
}

export interface ResolvedAmount extends LedgerAmount {
  balance: string;
}

export interface QueryCost extends LedgerAmount {
  isTotal: boolean;
}

export interface PostingRow {
  postingId: number;
  postingDate: string;
  account: string;
  postingComments: string[];
  transactionId: number;
  transactionDate: string;
  description: string;
  transactionComments: string[];
  transactionTags?: LedgerTag[];
  postingTags?: LedgerTag[];
  filename: string;
  transactionSourceLine: number;
  amounts: ResolvedAmount[];
  amount: LedgerAmount | null;
  lotCost: QueryCost | null;
  cost: QueryCost | null;
  balanceAssignment: LedgerAmount | null;
  balanceAssertion: LedgerAmount | null;
}

export interface TransactionPosting {
  postingDate: string;
  account: string;
  comments: string[];
  tags?: LedgerTag[];
  amount: LedgerAmount | null;
  lotCost: QueryCost | null;
  cost: QueryCost | null;
  balanceAssignment: LedgerAmount | null;
  balanceAssertion: LedgerAmount | null;
  amounts: LedgerAmount[];
}

export interface TransactionRow {
  transactionId: number;
  transactionDate: string;
  description: string;
  comments: string[];
  tags?: LedgerTag[];
  postings: TransactionPosting[];
}

export interface TransactionCollection {
  order: 'newest' | 'oldest';
  totalTransactions: number;
  transactions: TransactionRow[];
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

export interface Journal {
  journalPath: string;
  databasePath: string;
  warnings: ReadonlyArray<WarningGroup>;
  validate(): string;
  print(options?: { density?: 'compact' | 'spacious'; sortDeclarations?: boolean }): string;
  aggregate(options?: AggregateOptions): AggregateRow[];
  totalHistory(options?: TotalHistoryOptions): TotalHistoryRow[];
  unrealizedGains(options?: UnrealizedGainsOptions): AggregateRow[];
  investmentPerformance(options?: InvestmentPerformanceOptions): InvestmentPerformanceResult;
  accounts(options?: AccountSelectionOptions & { usage?: Usage }): AccountRow[];
  tags(options?: { usage?: Usage }): Array<{ tag: string; used: boolean }>;
  commodities(options?: { usage?: Usage }): CommodityRow[];
  prices(options?: { mode?: 'effective' | 'directives' }): PriceRow[];
  transactions(options?: AccountSelectionOptions & { id?: number | string;
    order?: 'newest' | 'oldest'; page?: number | string; pageSize?: number | string }): TransactionCollection;
  postings(options?: DateRangeOptions & AccountSelectionOptions): PostingRow[];
}
