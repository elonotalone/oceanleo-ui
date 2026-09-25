import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import ts from 'typescript';
import { compileModule } from './helpers/module-bench.mjs';

export const require = createRequire(import.meta.url);
export const reactUrl = pathToFileURL(require.resolve('react')).href;
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Baseline runs compile historical source in /tmp; the shared worktree is never rolled back.
export async function compileSubject(path, stubs = {}) {
  if (!process.env.G3_BASELINE_DIR || !existsSync(resolve(process.env.G3_BASELINE_DIR, path))) return compileModule(path, stubs);
  const source = readFileSync(resolve(process.env.G3_BASELINE_DIR, path), 'utf8');
  let output = ts.transpileModule(source, { compilerOptions: { removeComments: true, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const match of [...output.matchAll(/(?:from\s+|import\()(["'])([^"']+)\1/g)]) {
    const specifier = match[2];
    let url = stubs[specifier];
    if (!url && specifier.startsWith('.')) {
      const base = resolve(repo, dirname(path), specifier);
      const target = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map(s => base + s).find(candidate => existsSync(candidate) && statSync(candidate).isFile());
      if (!target) throw new Error(`Cannot resolve baseline import ${specifier}`);
      url = await compileModule(target, stubs);
    }
    if (!url) url = pathToFileURL(require.resolve(specifier)).href;
    output = output.replaceAll(`${match[1]}${specifier}${match[1]}`, JSON.stringify(url));
  }
  const dir = mkdtempSync(join(tmpdir(), 'g3-baseline-'));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  const target = join(dir, 'subject.mjs');
  writeFileSync(target, output);
  return pathToFileURL(target).href;
}

export async function mountDom(url = 'https://example.test/library') {
  const fabricRequire = createRequire(require.resolve('fabric/node'));
  const canvasEntry = fabricRequire.resolve('canvas');
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve('jsdom')).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url, pretendToBeVisual: true });
  const previous = new Map();
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true };
  for (const name of ['HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'MutationObserver']) globals[name] = dom.window[name];
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const container = dom.window.document.getElementById('root');
  const root = createRoot(container);
  return { dom, container, root, render: node => act(async () => root.render(node)), async close() {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  } };
}
export async function click(element) {
  if (!element) throw new Error('Expected a rendered button');
  await act(async () => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })));
}
