import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as cache from '../src/shell/office-editor/office-source-cache.ts';

// Execute the actual component's hook setup through its loading effect. We record
// React's dependency equality rule without running a DOM or a network parser.
const source = readFileSync(new URL('../src/shell/library-viewers.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('viewers.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
for (const component of ['PptViewer', 'DocumentViewer', 'SpreadsheetViewer']) test(`${component}: callback, labels and re-signed URL do not schedule another load; revision does`, () => {
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === component);
  const effectIndex = fn.body.statements.findIndex(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(ast) === 'useEffect');
  assert.ok(effectIndex >= 0);
  const setup = fn.body.statements.slice(0, effectIndex + 1).map(n => n.getText(ast)).join('\n');
  let cursor = 0, refs = [], previous, scheduled = 0;
  const useRef = value => refs[cursor++] ||= { current: value };
  const useEffect = (_callback, deps) => { if (!previous || deps.some((v, i) => !Object.is(v, previous[i]))) scheduled++; previous = deps; };
  const helpers = { useUI: () => x => x, useRef, useEffect, useState: value => [typeof value === 'function' ? value() : value, () => {}], useMemo: fn => fn(), useCallback: fn => fn,
    asRecords: v => Array.isArray(v) ? v : [], deckStructuredSourceUrl: () => '', structuredDeckSourceCandidate: () => '', deckPreviewLogicalSize: () => ({ width: 960, height: 540 }), extension: () => 'docx', officePackageKindForItem: () => component === 'DocumentViewer' ? 'docx' : 'pptx', ...cache };
  const js = ts.transpileModule(setup, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const run = new Function(...Object.keys(helpers), 'item', 'onResourceError', js);
  const item = (url = 'https://assets.oceanleo.app/a.pptx', revisionId = 'r1') => ({ url, revisionId, artifactId: 'a', title: 'A', kind: 'ppt', meta: { slides: [{ title: 'Label' }] }, artifact: { artifactId: 'a', revisionId, renditions: { full: { url, revisionId, purpose: 'full' } } } });
  const render = a => { cursor = 0; run(...Object.values(helpers), a, () => {}); };
  render(item()); assert.equal(scheduled, 1);
  render(item()); assert.equal(scheduled, 1, 'new callback/metadata reference must not restart parser');
  render(item('https://assets.oceanleo.app/new-signature.pptx')); assert.equal(scheduled, 1, 'same revision new URL must not restart parser');
  render(item('https://assets.oceanleo.app/new-signature.pptx', 'r2')); assert.equal(scheduled, 2);
});
