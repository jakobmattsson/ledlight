'use strict';

type Facade = {
  runCli: { run(): void };
};

export = ({
  runCli,
}: Facade): Facade => ({
  runCli,
});
