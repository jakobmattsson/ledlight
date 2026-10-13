'use strict';

import type { Journal } from '../../public-api';

type ProjectFacade = {
  apiDefinitions: Readonly<Record<string, { inputs: string[] }>>;
  openJournal(journalPath: string): Journal;
  withJournalText<Result>(content: string, baseDirectory: string,
    operation: (journal: Journal) => Result): Result;
};

export = ({ project: { apiDefinitions, openJournal, withJournalText } }: { project: ProjectFacade }): ProjectFacade =>
  ({ apiDefinitions, openJournal, withJournalText });
