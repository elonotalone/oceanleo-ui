import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><body></body>", { url: "https://example.test/tasks/queue" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator })) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = pathToFileURL(require.resolve("react")).href;
const marker = "ONE queued while binding";
const react = dataModule(`
  export * from ${JSON.stringify(reactUrl)};
  import * as React from ${JSON.stringify(reactUrl)};
  export function useEffect(callback, deps) {
    // A committed render can still carry the old queued prompt when its
    // controller's asynchronous handoff completes. Hold that passive effect
    // until the completion microtask has cleared the authoritative queue.
    const queue = deps?.[0];
    if (queue?.text === ${JSON.stringify(marker)} && queue.queuedAt && deps?.[1] === true) {
      return React.useEffect(() => {
        if (!globalThis.__queueDispatches.length) return callback();
        globalThis.__deferredQueueEffect = callback;
      }, deps);
    }
    return React.useEffect(callback, deps);
  }
`);
const controller = dataModule(`
  import * as React from ${JSON.stringify(reactUrl)};
  export function useAgentDialog(input) {
    const [messages, setMessages] = React.useState([]);
    const [bound, setBound] = React.useState(false);
    globalThis.__confirmQueueBinding = () => setBound(true);
    return {
      program: 'codex', activeSession: 'native', programs: [], messages,
      attachments: [], attachmentFile() {}, models: [], configOptions: [], commands: [], sessions: [],
      selectedModel: '', selectedMode: '', modelSource: '', mode: null,
      busy: false, offline: false, occupancyLink: bound, occupancyAt: bound ? Date.now() : null, occupancyBusy: [],
      occupancyPendingAt: null, occupancyPendingSession: null, stopState: 'idle', sessionLoading: !bound,
      historyReplay: {}, reattachSeq: 0, restoredDraft: null,
      async send(text, messageId) {
        const id = messageId || 'dispatch-' + (globalThis.__queueDispatches.length + 1);
        globalThis.__queueDispatches.push({text, messageId:id});
        setMessages(current => [...current, {kind:'user', id:'frame:codex:'+id, messageId:id, text, delivery:{state:'sending'}}]);
        if (globalThis.__queueDispatches.length === 1) await new Promise(resolve => {globalThis.__completeQueueSend=resolve;});
        return true;
      },
      setProgram(){}, openSession(){}, newSession(){}, abort(){}, retryAttachment(){}, removeAttachment(){},
    };
  }
`);
const { useNativeThread } = await import(await compileModule("src/shell/task-native/useNativeThread.ts", {
  react,
  "./NativeModelPicker": dataModule("export function nativeModelPickerFor(){return null;}"),
  "../cloud-computer/legacy-dialog/useAgentDialogController": controller,
  "../../i18n/ui/useUI": dataModule("export function useUI(){return text=>text;}"),
  "../../lib/computer-task-api": dataModule("export async function getComputerTaskTranscript(){return {frames:[],session:{id:'queue-task',native_session_id:'native'}};}"),
}));

function Probe() {
  globalThis.__queueThread = useNativeThread({
    computer: { id: "queue-computer", node_online: true },
    session: { id: "queue-task", kind: "acp", program: "codex", native_session_id: "native" },
    enabled: true,
  });
  return null;
}

test("a deferred ready effect cannot dispatch a queued prompt again after its async handoff settles", async () => {
  globalThis.__queueDispatches = [];
  globalThis.__deferredQueueEffect = null;
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Probe)));
    assert.equal(globalThis.__queueThread.ready, false);
    await act(async () => assert.equal(globalThis.__queueThread.queue(marker), true));
    const queuedId = globalThis.__queueThread.messages.find(row => row.content === marker).meta.native_message_id;
    assert.equal(typeof queuedId, "string");
    assert.equal(globalThis.__queueDispatches.length, 0, "queued before binding readiness");
    await act(async () => globalThis.__confirmQueueBinding());
    assert.equal(globalThis.__queueDispatches.length, 1);
    assert.equal(globalThis.__queueDispatches[0].messageId, queuedId, "the queued identity survives binding");
    assert.equal(typeof globalThis.__deferredQueueEffect, "function", "captured a later committed queue snapshot");
    await act(async () => globalThis.__completeQueueSend());
    assert.equal(globalThis.__queueThread.pending, null);
    await act(async () => globalThis.__deferredQueueEffect());
    assert.equal(globalThis.__queueDispatches.length, 1, "one user action has exactly one immutable dispatch identity");
    assert.equal(globalThis.__queueThread.messages.filter(row=>row.role==='user' && row.content===marker).length, 1);
  } finally { act(() => root.unmount()); host.remove(); }
});
