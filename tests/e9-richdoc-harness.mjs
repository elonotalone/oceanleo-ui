import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { AdvancedHostedDraftChannel } from '../src/shell/advanced-draft-hosted.ts';
import { SelectionCommandGate } from '../src/shell/selection-transactions.ts';

export function mountRoute(saveOverride) {
  const source = readFileSync('src/shell/advanced-routes/RichDocHostedRoute.tsx', 'utf8');
  const slots = []; let cursor = 0; let pending = []; const cleanups = [];
  const listeners = new Set(); const posted = []; const saved = []; const reports = [];
  const frame = { postMessage: message => posted.push(message) };
  const editorOrigin = 'https://docs.oceanleo.app';
  const inlineHandoff = { status: 'ready', source: { kind: 'inline', json: { type: 'doc' } } };
  const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && right.every((value, index) => value === left[index]);
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn, deps) { const i = cursor++; const prior = slots[i]; if (!prior?.__hookMemo || !sameDeps(prior.deps, deps)) slots[i] = { __hookMemo: true, deps, value: fn() }; return slots[i].value; },
    useCallback(fn, deps) { const i = cursor++; const prior = slots[i]; if (!prior?.__hookMemo || !sameDeps(prior.deps, deps)) slots[i] = { __hookMemo: true, deps, value: fn }; return slots[i].value; },
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
  let saveGateSequence = 0;
  const mocks = {
    "../advanced-draft-hosted": { AdvancedHostedDraftChannel },
    "../selection-transactions": { SelectionCommandGate },
    react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../AdvancedWorkbenchShell': { AdvancedWorkbenchShell: 'shell' },
    './mode-switch-gate': { useModeSwitchReady() {}, useModeSwitchHandoff: () => null },
    '../../client-ui/host-context': { useOptionalClientHost: () => null },
    '../hosted-local-origin': { clientHostedEmbedContext: () => ({ platform: 'web' }), hostedEmbedBaseForPlatform: (_kind, base) => base, hostedKernelChromeHidden: () => false },
    './editor-handoff': { handoffItemKey: item => item?.key || 'doc', peekNormalFaceHandoff: () => ({kind:'empty'}), useEditorHandoffSource: () => inlineHandoff, reportProSaved: (_key,item) => reports.push(item), bindProFaceHandoff: () => () => {}, openHostedSaveGate: () => { let resolve; let settled=false; const saveId=`save-${++saveGateSequence}`; const result=new Promise(r=>{resolve(r);}); const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);}; const timer=setTimeout(()=>finish({ok:false,error:'hosted save timeout'}),15); return { saveId, wait: () => result, acceptSnapshot(payload) { this.payload=payload; }, acceptSaveResult() { if(this.payload!=null) finish({ok:true,snapshot:this.payload}); }, rejectSaveResult(error) { finish({ok:false,error}); } }; } },
    './richdoc-pro-source': { collectRichDocText: () => '', isUmoNativeSaveId: id => String(id || '').startsWith('umo-save-'), handoffLooksLikeDocx: () => false, loadRichDocHostedState: async () => ({ok:true,source:{type:'doc',content:[{type:'paragraph'}]},converted:null,inspect:{kind:'richdoc',differences:[]},readOnly:false}), persistUmoPayload: async (input) => { const {payload} = input; saved.push(payload); if (saveOverride) return saveOverride(input); return {ok:true,item:{key:'doc',revisionId:'new'}}; } },
    '../doc-editors/rich-doc-hosted-embed': { richDocHostedEmbedBase: () => 'https://docs.oceanleo.app', RICHDOC_HOSTED_EMBED_ORIGIN:'https://docs.oceanleo.app', buildRichDocEmbedUrl: () => 'https://docs.oceanleo.app/editor', buildRichDocInitEnvelope: () => ({type:'init'}), buildRichDocHostedCommandSurface: () => ({}), hostedSelectionForToolbar: () => null, richDocHostedHostEditBarActive: () => false, sendRichDocHostedSelectionCommand: () => ({ok:false}) },
    '../editor-protocol': {
      EDITOR_PROTOCOL:'p',
      acceptEditorFrameMessage(event, gate) {
        if (event.source !== gate.frameWindow || event.origin !== gate.expectedOrigin || gate.expectedOrigin !== editorOrigin) return null;
        const message = event.data;
        if (!message || message.protocol !== 'p' || message.instanceId !== gate.instanceId || typeof message.type !== 'string') return null;
        return message;
      },
      asHostToEditorMessage: (message, instanceId) => message?.protocol === 'p' && message.instanceId === instanceId ? message : null,
      buildEditorEmbedUrl: (_base, options) => `${editorOrigin}/editor?instanceId=${encodeURIComponent(options.instanceId)}`,
      isValidEditorTargetOrigin: origin => origin === editorOrigin,
    },
    '../editor-sandbox-origin': { isTrustedEmbedEditorBase: () => true, embedEditorFrameSandbox: () => 'allow-scripts' },
    '../hosted-editor/index': { DEFAULT_EDITOR_MODE:'normal', buildSetModeMessage: () => ({}), buildHideChromeMessage: () => ({}) },
  };
  mocks['./editor-handoff'].openHostedSaveGate = () => {
    let settle;
    let settled = false;
    const saveId = `save-${++saveGateSequence}`;
    const result = new Promise(resolveResult => { settle = resolveResult; });
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      settle(value);
    };
    const timer = setTimeout(() => finish({ ok: false, error: 'hosted save timeout' }), 15);
    return {
      saveId,
      wait: () => result,
      acceptSnapshot(payload) { this.payload = payload; },
      acceptSaveResult() { if (this.payload != null) finish({ ok: true, snapshot: this.payload }); },
      rejectSaveResult(error) { finish({ ok: false, error }); },
    };
  };
  const generic = new Proxy({}, {get: () => () => null});
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require: name => mocks[name] ?? generic,window,document,fetch:async()=>({ok:true,json:async()=>({type:'doc'})}),setTimeout,clearTimeout,queueMicrotask,console});
  let item = {key:'doc',id:'doc',title:'doc',meta:{}};
  // Inline source keeps loading deterministic while exercising the real route effects.
  mocks['./richdoc-pro-source'].hostedStateFromResolvedJson = json => ({source:json,converted:null,inspect:null,readOnly:false});
  function attach(node) { if (!node || typeof node !== 'object') return; if (node.type === 'iframe') { node.props.ref.current={contentWindow:frame}; attachedInstanceId=new URL(node.props.src).searchParams.get('instanceId') || ''; node.props.onLoad(); } const children=node.props?.children; for (const child of Array.isArray(children)?children:[children]) attach(child); }
  let tree;
  let attachedInstanceId = '';
  function render() { cursor=0; tree=exports.RichDocHostedRoute({item}); attach(tree.props.adapter.stage); const jobs=pending;pending=[]; jobs.forEach(fn=>fn()); return tree.props.adapter; }
  render(); render();
  return {
    render, posted, saved, reports, frame, editorOrigin,
    currentItem: () => item,
    instanceId: () => attachedInstanceId,
    hide() { document.visibilityState='hidden'; document.emit('visibilitychange'); },
    pagehide() { windowEvents.emit('pagehide'); },
    setItem(next) { item = { ...item, ...next }; },
    message(data, event = {}) {
      const signed = { protocol: 'p', instanceId: attachedInstanceId, ...data };
      for (const fn of [...listeners]) fn({ data: signed, origin: editorOrigin, source: frame, ...event });
    },
    unmount() { cleanups.forEach(fn=>fn?.()); for(const slot of slots) if(slot?.current?.contentWindow) slot.current=null; },
    adapter: () => tree.props.adapter,
  };
}
