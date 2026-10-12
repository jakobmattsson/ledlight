'use strict';

module.exports = ({ resolve }) => {
  const { apiDefinitions, openJournal, withJournalText } = resolve('project');
  return Object.freeze({ apiDefinitions, openJournal, withJournalText });
};
