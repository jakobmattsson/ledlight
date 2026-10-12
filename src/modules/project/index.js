'use strict';

module.exports = ({ project: { apiDefinitions, openJournal, withJournalText } }) => {
  return Object.freeze({ apiDefinitions, openJournal, withJournalText });
};
