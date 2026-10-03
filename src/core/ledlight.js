'use strict';

module.exports = ({
  project: projectApi,
}) => {
  function openProject(startDirectory) {
    return projectApi.openProject(startDirectory);
  }

  return { openProject };
};
