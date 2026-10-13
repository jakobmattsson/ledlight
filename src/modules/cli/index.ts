'use strict';

type Facade = {
  runCli: ReturnType<typeof import('./internal/run-cli')>;
};

export = ({
  runCli,
}: Facade): Facade => ({
  runCli,
});
