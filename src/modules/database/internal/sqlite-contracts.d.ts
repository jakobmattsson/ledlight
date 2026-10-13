type SqliteValue = string | number | bigint | boolean | null | Uint8Array;

export type Statement<Row = unknown> = {
  all(...parameters: SqliteValue[]): Row[];
  get(...parameters: SqliteValue[]): Row | undefined;
  run(...parameters: SqliteValue[]): unknown;
  pluck(): Statement<Row>;
  raw(): Statement<Row extends unknown[] ? Row : unknown[]>;
};

export type SqliteDatabase = {
  prepare<Row = unknown>(sql: string): Statement<Row>;
  pragma(sql: string, options?: { simple: boolean }): unknown;
  transaction<Result>(callback: () => Result): { (): Result; immediate(): Result };
  exec(sql: string): unknown;
  aggregate(name: string, options: {
    start: () => { coefficient: bigint; scale: number };
    step: (total: { coefficient: bigint; scale: number }, value: string | null) => { coefficient: bigint; scale: number };
    result: (total: { coefficient: bigint; scale: number }) => string;
  }): void;
  function(name: string, options: { deterministic: boolean },
    callback: (left: string | null, right: string | null) => string | number | null): void;
  close(): void;
};

export type SqliteConstructor = new (databasePath: string,
  options?: { readonly?: boolean; fileMustExist?: boolean }) => SqliteDatabase;
