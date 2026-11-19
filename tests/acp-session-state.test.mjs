import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const api = await import(await compileModule("src/lib/acp-frames-api.ts", {
  "./auth/client": dataModule("export async function accessToken(){ return 'test-only'; }"),
  "./auth/config": dataModule("export function gatewayBase(){ return 'https://gw.test'; }"),
}));

test("a late socket subscriber receives both link and config state without another transcript row", async () => {
  const original = globalThis.WebSocket;
  let socket;
  globalThis.WebSocket = class {
    constructor() { socket = this; }
    close() {}
  };
  const stream = api.openFrames("late-task", 100);
  const events = [];
  const unsubscribe = stream.rows$.subscribe((event) => events.push(event));
  try {
    for (let i = 0; i < 12 && !socket; i++) await Promise.resolve();
    assert.ok(socket);
    socket.onopen();
    const state = { models: { currentModelId: "fable-5.2", availableModels: [] } };
    socket.onmessage({ data: JSON.stringify({ link: "attached", config_state: state }) });
    socket.onmessage({ data: JSON.stringify({ config_state: { models: { currentModelId: "server-change" } } }) });
    assert.deepEqual(events.slice(1), [
      { type: "link", link: "attached" },
      { type: "config", configState: state },
      { type: "config", configState: { models: { currentModelId: "server-change" } } },
    ]);
  } finally { unsubscribe(); stream.close(); globalThis.WebSocket = original; }
});

const { useAcpFrames } = await import(await compileModule("src/shell/acp-task/useAcpFrames.ts", {
  "../../lib/acp-frames-api": dataModule(`
    export async function getFrame(){ throw new Error("unexpected full frame"); }
    export async function getHistoryWindow(taskId) { return {
      rows: [], tail_id: 100, next_before: null, has_more: false, capped: false,
      link: "attached", config_state: {models: {currentModelId: taskId + "-model"}}
    }; }
    export function openFrames(){ return {
      close(){}, rows$: {subscribe(listener){globalThis.__sessionListener = listener; return () => {};}}
    }; }
  `),
  "../task-open-cache": dataModule("export function readTaskConversationAnchor(){ return null; }"),
}));
let view;
function Probe({ taskId }) { view = useAcpFrames(taskId, true); return null; }
const settle = async () => { for (let i = 0; i < 8; i++) await act(async () => {}); };

test("history state reaches the hook before streaming; new snapshots and task switches remain authoritative", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Probe, { taskId: "one" })));
    await settle();
    assert.equal(view.link, "attached");
    assert.equal(view.configState.models.currentModelId, "one-model");
    await act(async () => globalThis.__sessionListener({ type: "config", configState: { models: { currentModelId: "fable-5.2" } } }));
    assert.equal(view.configState.models.currentModelId, "fable-5.2");
    await act(async () => globalThis.__sessionListener({ type: "state", state: "disconnected" }));
    assert.equal(view.configState.models.currentModelId, "fable-5.2", "socket loss must not replace the known model");
    await act(async () => root.render(React.createElement(Probe, { taskId: "two" })));
    await settle();
    assert.equal(view.configState.models.currentModelId, "two-model");
  } finally { await act(async () => root.unmount()); host.remove(); delete globalThis.__sessionListener; }
});
