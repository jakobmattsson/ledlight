'use strict';

type QueryCandidate = {
  inputSchema?: { safeParse?: (...args: never[]) => unknown };
  execute?: (...args: never[]) => unknown;
};
type Definition<T extends QueryCandidate> = { name: string; relativePath: string; value: T };
type NamedQuery<T extends QueryCandidate> = Readonly<T & { name: string }>;
type QueryIndex<T extends QueryCandidate> = { definitions: ReadonlyArray<NamedQuery<T>> };

export = <T extends QueryCandidate>({ definitions }: { definitions: Definition<T>[] }): QueryIndex<T> => {
  const queries = definitions.map(({ name, relativePath, value: query }: Definition<T>): NamedQuery<T> => {
    if (!/^[a-z]+(?:-[a-z]+)*\.js$/u.test(relativePath)) {
      throw new TypeError(`Query definition must be directly inside list-definitions: ${relativePath}`);
    }
    if (typeof query.inputSchema?.safeParse !== 'function' ||
        typeof query.execute !== 'function' || query.execute.length !== 3) {
      throw new TypeError(`${relativePath} must expose inputSchema and execute(database, options, caches)`);
    }
    return Object.freeze({ ...query, name });
  });
  return { definitions: Object.freeze(queries) };
};
