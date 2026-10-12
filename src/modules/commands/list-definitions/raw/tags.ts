'use strict';

import type { Command } from 'commander';

module.exports = ({ cliOptions: options }: any) => ({
  description: 'show tags',
  examples: [
    'ledlight tags --file main.ledger',
    'ledlight tags --file main.ledger --usage unused',
  ],
  configure(command: Command) {
    options.journal(command);
    options.usage(command, 'tag declarations');
    options.format(command);
  },
  prepareOutput(rows: Array<{ tag: string }>) {
    return rows.map(({ tag }) => tag);
  },
  formatCsv(names: string[], _cliOptions: unknown, { csvField }: { csvField(value: unknown): string }) {
    return `${['tag', ...names.map(csvField)].join('\n')}\n`;
  },
  formatText(names: string[]) {
    return names.length === 0 ? '' : `${names.join('\n')}\n`;
  },
});
