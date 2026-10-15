'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts: typeof import('typescript') = require('typescript');

const repositoryRoot = path.resolve(__dirname, '../../..');
const unitSourceRoot = path.join(repositoryRoot, 'tests/unit/src');
const sourceRoot = path.join(repositoryRoot, 'src');

function testFilesIn(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: import('node:fs').Dirent) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return testFilesIn(entryPath);
    return entry.isFile() && entry.name.endsWith('.test.ts') ? [entryPath] : [];
  });
}

test('each source unit test matches a source file at the same relative path', () => {
  const missingSources = testFilesIn(unitSourceRoot)
    .map((testFile) => path.relative(unitSourceRoot, testFile).replace(/\.test\.ts$/u, '.ts'))
    .filter((relativePath) => !fs.existsSync(path.join(sourceRoot, relativePath)))
    .sort();

  assert.deepEqual(missingSources, [], 'Unit tests without matching source files');
});

function directlyLoadedSourceFiles(testFile: string): string[] {
  const source = ts.createSourceFile(testFile, fs.readFileSync(testFile, 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const loaded: string[] = [];

  function recordSourceFile(specifier: string, baseDirectory: string): void {
    const resolved = path.resolve(baseDirectory, specifier);
    const relativeToSource = path.relative(sourceRoot, resolved);
    if (relativeToSource === '..' || relativeToSource.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToSource)) return;
    const extension = path.extname(resolved);
    loaded.push(extension === '.js' || extension === '.ts'
      ? `${resolved.slice(0, -extension.length)}.ts` : `${resolved}.ts`);
  }

  function visit(node: import('typescript').Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
        (node.expression.text === 'require' || node.expression.text === 'resolveRepositoryModule' ||
          node.expression.text === 'resolveTestModule')) {
      const argument = node.arguments[0];
      if (!argument || !ts.isStringLiteralLike(argument)) {
        loaded.push('<dynamic require or module resolution>');
      } else {
        recordSourceFile(argument.text, node.expression.text === 'require'
          ? path.dirname(testFile) : repositoryRoot);
      }
    } else if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly &&
        ts.isStringLiteralLike(node.moduleSpecifier)) {
      recordSourceFile(node.moduleSpecifier.text, path.dirname(testFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return [...new Set(loaded)].sort();
}

test('each source unit test directly loads only its matching production file', () => {
  const violations = testFilesIn(unitSourceRoot).flatMap((testFile) => {
    const expected = path.join(sourceRoot,
      path.relative(unitSourceRoot, testFile).replace(/\.test\.ts$/u, '.ts'));
    const loaded = directlyLoadedSourceFiles(testFile);
    return loaded.length === 1 && loaded[0] === expected ? [] : [{
      test: path.relative(unitSourceRoot, testFile),
      loaded: loaded.map((fileName) => fileName.startsWith(sourceRoot)
        ? path.relative(sourceRoot, fileName) : fileName),
    }];
  });

  assert.deepEqual(violations, [], 'Unit tests must load only their matching source file');
});
