import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { embedEditorOriginFor } from '../src/shell/workbench-embed-base.ts';
import { EDITOR_PROTOCOL, isTrustedEditorOrigin } from '../src/shell/editor-protocol.ts';

// Execute the production effect itself, with a controlled window/event queue.
// Origin resolution and trust validation are the real modules, not replicas.
const source = readFileSync(new URL('../src/shell/advanced-routes/EmbeddedRoute.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('EmbeddedRoute.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
let digestFunction;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'normalizedDigest') digestFunction = node.getText(ast);
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'useEffect') {
    const callback = node.arguments[0];
    if (callback && callback.getText(ast).includes('data.type !== DESIGN_SOURCE_ACK_TYPE')) effect = callback.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.ok(effect, 'production receipt listener effect must be found');
const code = ts.transpileModule(`${digestFunction}\nconst receiptEffect = ${effect};`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const runEffect = new Function('window', 'designComposite', 'designSourceBinding', 'isDurableLibraryItem', 'item', 'embeddedEditorBase', 'isTrustedEditorOrigin', 'designFrameContainerRef', 'EDITOR_PROTOCOL', 'DESIGN_SOURCE_ACK_TYPE', 'DESIGN_HANDSHAKE_TIMEOUT_MS', 'setDesignSourceReceipt', 'setDesignHandshakeError', 'embedEditorOriginFor', `${code}\nreturn receiptEffect();`);
const slot = 'https://p-1234567890abcdef1234567890abcdef.dev.oceanleo.com';
const otherSlot = 'https://p-abcdef1234567890abcdef1234567890.dev.oceanleo.com';

function fixture() {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const listeners = new Set();
  const timers = new Map();
  let seq = 0;
  const state = { receipt: null, error: '' };
  const win = {
    location: { host: new URL(slot).host, hostname: new URL(slot).hostname, origin: slot, search: `?design_embed_origin=${encodeURIComponent(slot)}` },
    addEventListener: (type, fn) => { if (type === 'message') listeners.add(fn); },
    removeEventListener: (type, fn) => listeners.delete(fn),
    setTimeout: fn => { timers.set(++seq, fn); return seq; },
    clearTimeout: id => timers.delete(id),
  };
  globalThis.window = win;
  globalThis.document = { cookie: '' };
  const frame = { src: `${slot}/embed/editor?instance=d4-instance`, contentWindow: {} };
  const item = { artifactId: 'own-fork', revisionId: 'revision-1' };
  const binding = { handshakeId: 'handshake-1', evidence: { sourceDigest: 'a'.repeat(64), revision: 3 } };
  const cleanup = runEffect(win, true, binding, () => true, item, 'https://design.oceanleo.com/embed/editor', isTrustedEditorOrigin, {current:{querySelector:()=>frame}}, EDITOR_PROTOCOL, 'design-source-ack', 20_000, v=>state.receipt=v, v=>state.error=v, embedEditorOriginFor);
  const data = { type:'design-source-ack', protocol:EDITOR_PROTOCOL, instanceId:'d4-instance', handshakeId:'handshake-1', ok:true, artifactId:'own-fork', artifactRevisionId:'revision-1', sourceDigest:'a'.repeat(64), projectRevision:3 };
  return {
    state, timers, data, frame,
    send(origin, overrides={}) { for (const receive of listeners) receive({origin, source:frame.contentWindow, data, ...overrides}); },
    close() { cleanup(); if (previousWindow === undefined) delete globalThis.window; else globalThis.window=previousWindow; if (previousDocument === undefined) delete globalThis.document; else globalThis.document=previousDocument; },
  };
}

test('UC-6: the current LeoDev iframe origin settles the design source receipt', () => {
  const f=fixture();
  try {
    f.send(slot);
    assert.equal(f.state.receipt?.artifactId, 'own-fork');
    assert.equal(f.state.receipt?.handshakeId, 'handshake-1');
    assert.equal(f.state.error, '');
    assert.equal(f.timers.size, 0, 'accepted receipt cancels the timeout');
  } finally { f.close(); }
});

test('UC-6: the same receipt from another origin cannot settle the handshake', () => {
  const f=fixture();
  try {
    for (const origin of [otherSlot, 'https://design.oceanleo.com', 'https://untrusted.invalid']) {
      f.send(origin);
      assert.equal(f.state.receipt, null, origin);
    }
    assert.equal(f.timers.size, 1);
    for (const timeout of f.timers.values()) timeout();
    assert.match(f.state.error, /design-handshake-timeout/);
  } finally { f.close(); }
});

test('UC-6: the accepted origin still requires the exact source, instance and revision evidence', () => {
  for (const change of [{protocol:'wrong'}, {instanceId:'wrong'}, {handshakeId:'wrong'}, {artifactId:'wrong'}, {artifactRevisionId:'wrong'}, {sourceDigest:'b'.repeat(64)}, {projectRevision:4}, {ok:false}]) {
    const f=fixture();
    try { f.send(slot,{data:{...f.data,...change}}); assert.equal(f.state.receipt,null); assert.notEqual(f.state.error,''); } finally { f.close(); }
  }
  const f=fixture();
  try { f.send(slot,{source:{}}); assert.equal(f.state.receipt,null); assert.equal(f.state.error,''); } finally { f.close(); }
});
