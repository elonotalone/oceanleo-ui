import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('Image leaves Photopea even when flush fails', async () => {
  const source = readFileSync('src/shell/advanced-routes/ImageRoute.tsx', 'utf8');
  const start = source.indexOf('  const setEditorMode = useCallback(');
  const end = source.indexOf('\n\n  /**', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const changes = [];
  const notices = [];
  const flushes = [];
  const code = ts.transpileModule(
    source.slice(start, end) + '\nglobalThis.change=setEditorMode;',
    {compilerOptions: {target: ts.ScriptTarget.ES2022}},
  ).outputText;
  const context = {
    Error,
    useCallback: (fn) => fn,
    applyImageL0Mode: (mode) => ({mode}),
    pluginMode: 'pro',
    activeItem: {},
    frozenCanvasUrl() {},
    photopeaSession: {
      leave: async () => {
        throw new Error('leave must not gate the switch');
      },
    },
    saveBeforeNewConversation: async () => {
      flushes.push('flush');
      throw new Error('upload failed');
    },
    makePhotopeaSession() {},
    setImportNotice: (x) => notices.push(x),
    setPluginModeState: (x) => changes.push(x),
  };
  vm.runInNewContext(code, context);
  context.change('normal');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(changes, ['normal']);
  assert.deepEqual(notices, []);
  assert.deepEqual(flushes, ['flush']);
});
