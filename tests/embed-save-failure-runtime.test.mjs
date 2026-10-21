import "./helpers/w1-jsdom-window.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { useEmbedEditorMessages } from "../src/shell/use-embed-editor-messages.ts";
import { asEditorToHostMessage, EDITOR_PROTOCOL } from "../src/shell/editor-protocol.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("real message hook immediately forwards only valid frame-correlated hosted save errors", async () => {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  const frame = document.createElement("iframe");
  document.body.append(container, frame);
  const root = createRoot(container);
  const results = [];
  const statuses = [];
  const inputs = {
    iframeRef: { current: frame }, editorOrigin: "https://video.oceanleo.com", instanceId: "failure-save-runtime",
    item: { key: "runtime-video", id: "runtime-video", kind: "workflow", meta: {}, url: "https://video.oceanleo.com/opened" },
    mediaType: "file", siteId: "video", readyHandledRef: { current: false }, latestSelectionRef: { current: null },
    selectionGateRef: { current: {} }, projectRequestsRef: { current: new Map() }, latestProjectManifestRevisionRef: { current: null },
    sentRecoveryCaptureRequestsRef: { current: new Set() }, sentRecoveryRestoreRequestsRef: { current: new Set() }, artifactSaveOperationsRef: { current: new Map() },
    sendToEditor: () => true, sendOpenAsset() {}, setPhase() {}, setStatus: (status) => statuses.push(status), tt: (text) => text,
    onSaveResult: (result) => results.push(result),
  };
  function Host() { useEmbedEditorMessages(inputs); return null; }
  const send = async (message = {}, origin = inputs.editorOrigin, source = frame.contentWindow) => {
    await act(async () => window.dispatchEvent(new window.MessageEvent("message", { origin, source, data: { protocol: EDITOR_PROTOCOL, instanceId: inputs.instanceId, type: "error", message: "Private staging failed", code: "VIDEO_SAVE_FAILED", saveId: "save-9", retryable: true, ...message } })));
  };
  await act(async () => root.render(React.createElement(Host)));
  try {
    await send({}, "https://attacker.test");
    await send({}, inputs.editorOrigin, window);
    await send({ instanceId: "previous-instance" });
    await send({ saveId: "" });
    await send({ saveId: "x".repeat(129) });
    assert.equal(results.length, 0);
    await send({ code: "UNRELATED_EDITOR_ERROR" });
    assert.equal(results.length, 0);
    await send();
    assert.deepEqual(results, [{ ok: false, saveId: "save-9" }]);
    assert.equal(statuses.at(-1).retryable, true);
    assert.equal(inputs.artifactSaveOperationsRef.current.size, 0);
    assert.equal(asEditorToHostMessage({ protocol: EDITOR_PROTOCOL, instanceId: inputs.instanceId, type: "error", message: "Legacy error remains valid" }, inputs.instanceId)?.type, "error");
  } finally {
    await act(async () => root.unmount());
    container.remove(); frame.remove();
  }
});
