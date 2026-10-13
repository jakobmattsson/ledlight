'use strict';

type QuerySchema = {
  shape: Record<string, unknown>;
};
type QueryDefinition = {
  inputSchema: QuerySchema;
  execute(database: unknown, options: unknown, caches: unknown): unknown;
};
type QueryCandidate = {
  inputSchema?: {
    shape?: Record<string, unknown>;
    safeParse?(input: unknown): unknown;
  };
  execute?: (...args: never[]) => unknown;
};
type Definition = { name: string; relativePath: string; value: QueryCandidate };
type NamedQuery = Readonly<QueryDefinition & { name: string }>;
type QueryIndex = { definitions: ReadonlyArray<NamedQuery> };

export = ({ definitions }: { definitions: Definition[] }): QueryIndex => {
  const queries = definitions.map(({ name, relativePath, value: query }: Definition): NamedQuery => {
    if (!/^[a-z]+(?:-[a-z]+)*\.js$/u.test(relativePath)) {
      throw new TypeError(`Query definition must be directly inside list-definitions: ${relativePath}`);
    }
    if (typeof query.inputSchema?.safeParse !== 'function' ||
        !query.inputSchema.shape || typeof query.inputSchema.shape !== 'object' ||
        typeof query.execute !== 'function' || query.execute.length !== 3) {
      throw new TypeError(`${relativePath} must expose inputSchema and execute(database, options, caches)`);
    }
    return Object.freeze({
      inputSchema: query.inputSchema as QuerySchema,
      execute: query.execute as QueryDefinition['execute'],
      name,
    });
  });
  return { definitions: Object.freeze(queries) };
};
