'use strict';

module.exports = () => {

  function splitTopLevelBlocks(sourceText) {
    const blocks = [];
    const lines = sourceText.split('\n');
    let active = null;

    function finish() {
      if (!active) return;
      blocks.push({
        sourceText: active.lines.join('\n'),
        startLine: active.startLine,
        endLine: active.endLine,
      });
      active = null;
    }

    lines.forEach((raw, index) => {
      const line = index + 1;
      const text = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
      const blank = text.trim().length === 0;
      const indented = /^[ \t]/u.test(text);
      const topLevelComment = text.startsWith(';');

      if (!blank && !indented) finish();
      if (!active && !blank) active = { startLine: line, endLine: line, lines: [] };
      if (active) {
        active.lines.push(raw);
        if (!blank) active.endLine = line;
      }
      if (topLevelComment) finish();
    });
    finish();
    return blocks;
  }

  return { splitTopLevelBlocks };
};
