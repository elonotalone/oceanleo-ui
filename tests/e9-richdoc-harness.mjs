import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { AdvancedHostedDraftChannel } from '../src/shell/advanced-draft-hosted.ts';

export function mountRoute(saveOverride) {
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
    "../advanced-draft-hosted": { AdvancedHostedDraftChannel },
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

