import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  publishAgentSelection,
  readAgentSelection,
  resetAgentReviewInbox,
  subscribeAgentSelection,
} from "../src/shell/agent-review/inbox.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { QuickActionChips } = await import(await compileModule(
  "src/shell/quick-actions/QuickActionChips.tsx",
  {
    "../../i18n/ui/useUI": dataModule("export function useUI(){return value=>value;}"),
    "../plugin-command": dataModule("export function currentPluginCommandSurface(){return null;}"),
  },
));

test("real quick actions render with a mounted toolbar without publishing during render", async () => {
  resetAgentReviewInbox();
  const container = document.createElement("div");
  const toolbar = document.createElement("div");
  toolbar.setAttribute("data-selection-kind", "text");
  toolbar.setAttribute("data-selection-id", "paragraph-1");
  toolbar.setAttribute("aria-label", "选中的文字");
  document.body.append(toolbar, container);
  const root = createRoot(container);
  let commits = 0;
  let publications = 0;
  const fired = [];
  const stop = subscribeAgentSelection(() => { publications += 1; });
  const render = () => React.createElement(React.StrictMode, null,
    React.createElement(React.Profiler, { id: "quick-actions", onRender: () => { commits += 1; } },
      React.createElement(QuickActionChips, {
        editorId: "richdoc", onFire: (prompt) => fired.push(prompt),
      }),
    ),
  );
  try {
    // The DOM fallback may initialize once, but its notification must never
    // create the render → selection publish → same-component bump loop.
    await act(async () => root.render(render()));
    assert.ok(commits < 10);
    await act(async () => publishAgentSelection({
      kind: "text", id: "paragraph-1", summary: "这是实时选中的完整正文，不是工具栏标签",
    }));
    const before = publications;
    await act(async () => root.render(render()));
    assert.equal(publications, before, "an ordinary rerender is read-only");
    assert.match(readAgentSelection().summary, /完整正文/);
    assert.ok(commits < 15, `bounded render count: ${commits}`);
    const button = container.querySelector("[data-quick-action-chip]");
    assert.ok(button, "real catalog chips should be available");
    await act(async () => button.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(fired.length, 1);
    assert.match(fired[0], /完整正文/, "click uses the live native selection, not a DOM label");
  } finally {
    await act(async () => root.unmount());
    stop();
    toolbar.remove();
    container.remove();
    resetAgentReviewInbox();
  }
});
