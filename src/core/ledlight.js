'use strict';

module.exports = ({
  project: projectApi,
}) => {
  function openJournal(journalPath) {
    return projectApi.openJournal(journalPath);
  }

  return { openJournal };
};
