'use strict';

type Facade = {
  run(): void;
};

export = ({
  runCli: { run },
}: { runCli: Facade }): Facade => ({
  run,
});
