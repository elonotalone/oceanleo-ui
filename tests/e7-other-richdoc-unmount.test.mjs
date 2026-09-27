import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function mountRoute(saveOverride) {
  const source = readFileSync('src/shell/advanced-routes/RichDocHostedRoute.tsx', 'utf8');
  const slots = []; let cursor = 0; let pending = []; const cleanups = [];
  const listeners = new Set(); const posted = []; const saved = []; const reports = [];
  const frame = { postMessage: message => posted.push(message) };
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); }, useCallback(fn) { cursor++; return fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps?.some((d,j) => d !== slots[i][j])) { slots[i] = deps; pending.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const jsx = (type, props) => ({ type, props });
  function eventTarget() {
    const events = new Map();
    return { addEventListener(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); }, removeEventListener(name, fn) { events.get(name)?.delete(fn); }, emit(name) { for (const fn of [...(events.get(name) ?? [])]) fn({type:name}); } };
  }
  const document = { ...eventTarget(), visibilityState: 'visible' };
  const windowEvents = eventTarget();
  const window = { location: { origin: 'https://host.example' }, addEventListener(name, fn) { if (name === 'message') listeners.add(fn); else windowEvents.addEventListener(name, fn); }, removeEventListener(name, fn) { if (name === 'message') listeners.delete(fn); else windowEvents.removeEventListener(name, fn); } };
  const mocks = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../AdvancedWorkbenchShell': { AdvancedWorkbenchShell: 'shell' },
    './mode-switch-gate': { useModeSwitchReady() {}, useModeSwitchHandoff: () => null },
    './editor-handoff': { handoffItemKey: () => 'doc', peekNormalFaceHandoff: () => ({kind:'empty'}), useEditorHandoffSource: () => ({status:'ready', source:null}), reportProSaved: (_key,item) => reports.push(item), bindProFaceHandoff: () => () => {}, openHostedSaveGate: () => { let resolve; return { saveId:'save', wait: () => new Promise(r => resolve=r), acceptSnapshot(payload) { this.payload=payload; }, acceptSaveResult() { resolve?.({ok:true,snapshot:this.payload}); } }; } },
    './richdoc-pro-source': { collectRichDocText: () => '', handoffLooksLikeDocx: () => false, persistUmoPayload: async (input) => { const {payload} = input; saved.push(payload); if (saveOverride) return saveOverride(input); return {ok:true,item:{key:'doc',revisionId:'new'}}; } },
    '../doc-editors/rich-doc-hosted-embed': { richDocHostedEmbedBase: () => 'https://docs.oceanleo.app', RICHDOC_HOSTED_EMBED_ORIGIN:'https://docs.oceanleo.app', buildRichDocEmbedUrl: () => 'https://docs.oceanleo.app/editor', buildRichDocInitEnvelope: () => ({type:'init'}) },
    '../editor-protocol': { EDITOR_PROTOCOL:'p', acceptEditorFrameMessage: event => event.data, asHostToEditorMessage: x => x, isValidEditorTargetOrigin: () => true },
    '../editor-sandbox-origin': { isTrustedEmbedEditorBase: () => true, embedEditorFrameSandbox: () => 'allow-scripts' },
    '../hosted-editor/index': { DEFAULT_EDITOR_MODE:'normal', buildSetModeMessage: () => ({}), buildHideChromeMessage: () => ({}) },
  };
  const generic = new Proxy({}, {get: () => () => null});
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require: name => mocks[name] ?? generic,window,document,fetch:async()=>({ok:true,json:async()=>({type:'doc'})}),setTimeout,clearTimeout,console});
  const item = {key:'doc',id:'doc',title:'doc',meta:{}};
  // Inline source keeps loading deterministic while exercising the real route effects.
  mocks['./editor-handoff'].useEditorHandoffSource = () => ({status:'ready',source:{kind:'inline',json:{type:'doc'}}});
  mocks['./richdoc-pro-source'].hostedStateFromResolvedJson = json => ({source:json,converted:null,inspect:null,readOnly:false});
  function attach(node) { if (!node || typeof node !== 'object') return; if (node.type === 'iframe') { node.props.ref.current={contentWindow:frame}; node.props.onLoad(); } const children=node.props?.children; for (const child of Array.isArray(children)?children:[children]) attach(child); }
  let tree;
  function render() { cursor=0; tree=exports.RichDocHostedRoute({item}); attach(tree.props.adapter.stage); const jobs=pending;pending=[]; jobs.forEach(fn=>fn()); return tree.props.adapter; }
  render(); render();
  return { render, posted, saved, reports, hide() { document.visibilityState='hidden'; document.emit('visibilitychange'); }, pagehide() { windowEvents.emit('pagehide'); }, message(data) { for (const fn of [...listeners]) fn({data}); }, unmount() { cleanups.forEach(fn=>fn?.()); for(const slot of slots) if(slot?.current?.contentWindow) slot.current=null; }, adapter: () => tree.props.adapter };
}

test('real RichDoc route saves cached dirty document after unmount', async () => {
  const host=mountRoute();
  host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture');
  assert.ok(capture,'dirty must proactively capture document');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'latest'}}});
  const adapter=host.render(); assert.equal(adapter.persistence.dirty,true,'snapshot is not a server save');
  host.unmount(); const result=await adapter.persistence.flush();
  assert.equal(result.ok,true); assert.deepEqual(JSON.parse(JSON.stringify(host.saved)),[{text:'latest'}]); assert.equal(host.reports.length,1);
});

test('real RichDoc route refuses stale cache after unmount', async () => {
  const host=mountRoute(); host.message({type:'dirty',dirty:true,revision:1});
  const capture=host.posted.findLast(m=>m.type==='recovery-capture'); assert.ok(capture);
  host.message({type:'recovery-snapshot',ok:true,recoveryId:capture.recoveryId,snapshot:{revision:1,payload:{text:'old'}}});
  host.message({type:'dirty',dirty:true,revision:2}); const adapter=host.render();host.unmount();
  const result=await adapter.persistence.flush(); assert.equal(result.ok,false);assert.equal(host.saved.length,0);assert.equal(host.reports.length,0);
});


test('RichDoc repeats a committed flush without uploading another revision', async () => {
  const host=mountRoute();host.message({type:'dirty',dirty:true,revision:1});
  const request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  const adapter=host.render();assert.equal((await adapter.persistence.flush()).ok,true);
  assert.ok(host.posted.findLast(m=>m.type==='save-result').saveId);
  host.unmount();assert.equal((await adapter.persistence.flush()).ok,true);assert.equal(host.saved.length,1);
});

test('RichDoc concurrent flush shares upload; newer edit stays dirty and next save uses committed base', async () => {
  let finish;const bases=[];
  const host=mountRoute(input=>{bases.push(input.item);return new Promise(resolve=>{finish=resolve;});});
  host.message({type:'dirty',dirty:true,revision:1});
  let request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'one'}}});
  let adapter=host.render();const first=adapter.persistence.flush();const second=adapter.persistence.flush();assert.equal(first,second);
  host.message({type:'dirty',dirty:true,revision:2});finish({ok:true,item:{key:'doc',revisionId:'committed-one'}});
  assert.equal((await first).ok,false);assert.equal(host.render().persistence.dirty,true);assert.equal(host.reports.length,0);
  request=host.posted.findLast(m=>m.type==='recovery-capture');
  host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:2,payload:{text:'two'}}});
  adapter=host.render();host.unmount();const latest=adapter.persistence.flush();assert.equal(bases[1].revisionId,'committed-one');finish({ok:true,item:{key:'doc',revisionId:'committed-two'}});assert.equal((await latest).ok,true);
});

test('RichDoc rejects uncorrelated or mismatched revision snapshots', async()=>{
  for(const kind of ['id','revision']) {
    const host=mountRoute();host.message({type:'dirty',dirty:true,revision:4});const request=host.posted.findLast(m=>m.type==='recovery-capture');
    host.message({type:'recovery-snapshot',ok:true,recoveryId:kind==='id'?'foreign':request.recoveryId,snapshot:{revision:kind==='revision'?3:4,payload:{text:'wrong'}}});
    const adapter=host.render();host.unmount();assert.equal((await adapter.persistence.flush()).ok,false);assert.equal(host.saved.length,0);
  }
});


test('RichDoc hidden/pagehide saves dirty cached edits once and ignores clean events', async()=>{
  for (const trigger of ['hide', 'pagehide']) {
    let finish;
    const host=mountRoute(()=>new Promise(resolve=>{finish=resolve;}));
    host[trigger]();assert.equal(host.saved.length,0);assert.equal(host.posted.filter(m=>m.type==='recovery-capture').length,0);
    host.message({type:'dirty',dirty:true,revision:1});const request=host.posted.findLast(m=>m.type==='recovery-capture');
    host.message({type:'recovery-snapshot',ok:true,recoveryId:request.recoveryId,snapshot:{revision:1,payload:{text:'background'}}});
    host.render();host[trigger]();
    assert.equal(host.saved.length,1,'dirty background event must start saving');
    host.hide();host.pagehide();assert.equal(host.saved.length,1,'simultaneous events share the upload');
    finish({ok:true,item:{key:'doc',revisionId:'background-saved'}});await new Promise(resolve=>setImmediate(resolve));
    host.hide();host.pagehide();assert.equal(host.saved.length,1,'committed edit is not uploaded again');
    host.unmount();host.hide();host.pagehide();assert.equal(host.saved.length,1,'listeners removed on unmount');
  }
});
