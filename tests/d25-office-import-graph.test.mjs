import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
function imports(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const edges = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) specifier = node.moduleSpecifier;
    if (ts.isExportDeclaration(node) && !node.isTypeOnly) specifier = node.moduleSpecifier;
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      const base = resolve(dirname(file), specifier.text);
      const target = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'].map(ext => base + ext).find(p => existsSync(p) && /\.[cm]?[jt]sx?$/.test(p));
      if (target) edges.push(target);
    }
    ts.forEachChild(node, visit);
  }
  visit(source); return edges;
}
function pathBetween(start, end, seen = new Set()) {
  if (start === end) return [start];
  if (seen.has(start)) return null; seen.add(start);
  for (const dependency of imports(start)) {
    const path = pathBetween(dependency, end, seen);
    if (path) return [start, ...path];
  }
  return null;
}
test('Office validation never imports the cache facade, directly or transitively', () => {
  const validator = resolve(root, 'src/shell/doc-editors/office-file.ts');
  const facade = resolve(root, 'src/shell/office-editor/office-source-cache.ts');
  assert.equal(pathBetween(validator, facade), null, 'office-file must only depend on the byte-store leaf');
  assert.ok(pathBetween(facade, validator), 'facade still supplies Office kind validation');
});
test('byte-store leaf has no import path back to either Office caller', () => {
  const leaf = resolve(root, 'src/shell/office-editor/office-byte-store.ts');
  assert.ok(existsSync(leaf), 'shared byte-store leaf exists');
  for (const file of ['src/shell/doc-editors/office-file.ts', 'src/shell/office-editor/office-source-cache.ts']) {
    assert.equal(pathBetween(leaf, resolve(root, file)), null, file);
  }
});
