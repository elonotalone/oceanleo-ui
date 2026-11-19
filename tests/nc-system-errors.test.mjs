import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const { AgentTranscriptBubble } = await import(await compileModule("src/shell/AgentTranscriptBubble.tsx", {
  "../i18n/ui/useUI": dataModule('export function useUI() { return (text) => text; }'),
  "./share/share-clipboard": dataModule('export async function writeClipboardText() { return true; }'),
  "../lib/cloud-computer-api": dataModule('export async function cloudComputerRequest() { return {}; } export function computerIdRequestField() { return {}; }'),
  "next/link": dataModule(`import React from ${JSON.stringify(reactUrl)}; export default function Link({children, ...props}) { return React.createElement("a", props, children); }`),
}));

for (const [role, kind] of [["system", "error"], ["assistant", "error"], ["system", "notice"], ["assistant", "notice"], ["system", "text"]]) {
  test(`${role}/${kind} uses a labelled small system line shared by cloud and ACP`, () => {
    const html = renderToStaticMarkup(React.createElement(AgentTranscriptBubble, {
      message: { id: 1, role, kind, content: 'provider <error>', meta: { sender: { kind: "agent", label: "An agent" } } },
    }));
    assert.match(html, new RegExp(`role="${kind === "error" ? "alert" : "status"}"`));
    assert.match(html, /text-\[12px\]/);
    assert.match(html, /系统错误|系统通知/);
    assert.match(html, /provider &lt;error&gt;/);
    assert.doesNotMatch(html, /data-agent-sender|rounded-2xl/);
    if (kind === "error") assert.match(html, /text-rose-600/);
  });
}

const { buildShareCardMessages } = await import(await compileModule("src/shell/share/ShareCard.tsx", {
  "../../i18n/ui/useUI": dataModule('export function useUI() { return (text) => text; }'),
  "./share-image": dataModule('export function downloadBlobs() {} export function renderShareCardImages() {}'),
}));

test("shared images label platform failures as system errors rather than the agent's words", () => {
  const [message] = buildShareCardMessages([
    { id: 1, role: "system", kind: "error", content: "provider invalid_api_key" },
  ], { user: "A person", assistant: "The agent" }, (text) => text);
  assert.equal(message.speaker, "系统错误");
  assert.equal(message.role, "assistant"); // layout side; the speaker identifies the source
  assert.match(JSON.stringify(message.blocks), /provider invalid_api_key/);
});
