'use strict';

type ProjectModule = ReturnType<typeof import('./internal/project')>;
type ProjectFacade = Pick<ProjectModule, 'apiDefinitions' | 'openJournal' | 'withJournalText'>;

export = ({ project: { apiDefinitions, openJournal, withJournalText } }: { project: ProjectModule }): ProjectFacade =>
  ({ apiDefinitions, openJournal, withJournalText });
