import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ---------------------------------------------------------------------------
// jsdom（经 fabric 的依赖树拿到；与 cloud-browser-rendered.test.mjs 同款设置）
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://leoimage.oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

// ---------------------------------------------------------------------------
// 替身
// ---------------------------------------------------------------------------

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);

const clipboardStub = dataModule(`
  globalThis.__clipboard = [];
  export async function writeClipboardText(text) {
    globalThis.__clipboard.push(text);
    return true;
  }
`);

const clientStub = dataModule(`
  export class ShareLinkError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }
  globalThis.__shareCalls = [];
  export async function createShareLink(input) {
    globalThis.__shareCalls.push(input);
    return { shareId: "abc123", url: "https://leoimage.oceanleo.com/share/abc123" };
  }
`);

const cardStub = dataModule(`
  globalThis.__imageCalls = [];
  export function buildShareCardMessages(messages) {
    return messages.map((message) => ({
      role: message.role,
      speaker: message.role === "user" ? "我" : "OceanLeo",
      blocks: [],
    }));
  }
  export async function generateShareCard(input) {
    globalThis.__imageCalls.push(input);
    return { blobs: [{ size: 10 }], layout: { pages: [{ index: 1 }] }, formulaFailures: 0 };
  }
`);

const docxStub = dataModule(`
  globalThis.__docxCalls = [];
  export async function shareMessagesToDocxBlob(input) {
    globalThis.__docxCalls.push(input);
    return { size: 20 };
  }
  export function downloadBlob(blob, name) {
    globalThis.__docxCalls.push({ downloaded: name });
  }
`);

const { useShareMode } = await import(
  await compileModule("src/shell/share/useShareMode.ts", {
    "../../i18n/ui/useUI": uiStub,
    "./share-clipboard": clipboardStub,
    "./share-client": clientStub,
    "./ShareCard": cardStub,
    "./share-docx": docxStub,
  })
);

const { ShareActionBar, ShareCheckbox } = await import(
  await compileModule("src/shell/share/ShareActionBar.tsx", {
    "../../i18n/ui/useUI": uiStub,
  })
);

const { AgentTranscriptBubble } = await import(
  await compileModule("src/shell/AgentTranscriptBubble.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
  })
);

// ---------------------------------------------------------------------------
// 会话样本
// ---------------------------------------------------------------------------

const messages = [
  { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
  { id: 2, role: "assistant", kind: "step", content: "正在读取文件" },
  { id: 3, role: "assistant", kind: "ui_action", content: "" },
  { id: 4, role: "assistant", kind: "text", content: "同比增长 12%。" },
  { id: 5, role: "assistant", kind: "text", content: "" },
  {
    id: 6,
    role: "assistant",
    kind: "text",
    content: "海报做好了",
    meta: { artifact: { type: "image", title: "海报", url: "https://x/y.png" } },
  },
];

function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return {
    host,
    unmount: () => act(() => root.unmount()),
  };
}

/** 把 hook 的返回值透出来，供测试直接驱动。 */
function harness(input, onState) {
  function Harness() {
    const share = useShareMode(input);
    onState(share);
    return React.createElement(ShareActionBar, { share });
  }
  return React.createElement(Harness);
}

function mountShare(input = { messages, taskId: "task-1", title: "同比分析" }) {
  let state = null;
  const mounted = mount(harness(input, (value) => (state = value)));
  return { ...mounted, get: () => state };
}

test("可选消息剔除步骤条、隐形指令与空消息，产物卡片保留", () => {
  const view = mountShare();
  assert.deepEqual(
    view.get().selectable.map((message) => message.id),
    [1, 4, 6],
  );
  view.unmount();
});

test("进入 / 退出选段模式，退出时勾选清零", () => {
  const view = mountShare();
  assert.equal(view.get().active, false);
  act(() => view.get().enter());
  assert.equal(view.get().active, true);
  assert.equal(view.get().selectedCount, 0);
  act(() => view.get().toggle(4));
  assert.equal(view.get().selectedCount, 1);
  act(() => view.get().exit());
  assert.equal(view.get().active, false);
  assert.equal(view.get().selectedCount, 0);
  view.unmount();
});

test("从某条消息上的分享图标进入，会预先勾上那一条", () => {
  const view = mountShare();
  act(() => view.get().enter(6));
  assert.equal(view.get().active, true);
  assert.deepEqual([...view.get().selectedIds], [6]);
  view.unmount();
});

test("逐条勾选可反选；全选是开关，再点一次全不选", () => {
  const view = mountShare();
  act(() => view.get().enter());
  act(() => view.get().toggle(1));
  act(() => view.get().toggle(4));
  assert.equal(view.get().selectedCount, 2);
  act(() => view.get().toggle(4));
  assert.equal(view.get().selectedCount, 1);
  act(() => view.get().toggleAll());
  assert.equal(view.get().allSelected, true);
  assert.equal(view.get().selectedCount, 3);
  act(() => view.get().toggleAll());
  assert.equal(view.get().selectedCount, 0);
  view.unmount();
});

test("Copy Text 的输出与选中集合一致，且保持原对话顺序", async () => {
  globalThis.__clipboard = [];
  const view = mountShare();
  act(() => view.get().enter());
  // 故意先勾后面那条，输出仍应按对话顺序
  act(() => view.get().toggle(4));
  act(() => view.get().toggle(1));
  await act(async () => {
    await view.get().copyText();
  });
  assert.equal(globalThis.__clipboard.length, 1);
  assert.equal(
    globalThis.__clipboard[0],
    ["**我**", "帮我算个同比", "", "**OceanLeo**", "同比增长 12%。"].join("\n"),
  );
  assert.equal(view.get().notice.tone, "ok");
  view.unmount();
});

test("Copy Link 只把选中的 message_ids 交给后端，复制回来的是分享地址", async () => {
  globalThis.__clipboard = [];
  globalThis.__shareCalls = [];
  const view = mountShare();
  act(() => view.get().enter(6));
  await act(async () => {
    await view.get().copyLink();
  });
  assert.deepEqual(globalThis.__shareCalls, [
    { taskId: "task-1", messageIds: [6] },
  ]);
  assert.equal(
    globalThis.__clipboard[0],
    "https://leoimage.oceanleo.com/share/abc123",
  );
  view.unmount();
});

test("没有勾选时四个动作都拒绝执行，并提示先勾选", async () => {
  globalThis.__clipboard = [];
  globalThis.__imageCalls = [];
  globalThis.__docxCalls = [];
  const view = mountShare();
  act(() => view.get().enter());
  await act(async () => {
    await view.get().copyText();
  });
  await act(async () => {
    await view.get().generateImage();
  });
  await act(async () => {
    await view.get().generateDocument();
  });
  assert.equal(globalThis.__clipboard.length, 0);
  assert.equal(globalThis.__imageCalls.length, 0);
  assert.equal(globalThis.__docxCalls.length, 0);
  assert.equal(view.get().notice.tone, "error");
  view.unmount();
});

test("生成长图把 Copy Link 的同一个地址交给二维码", async () => {
  globalThis.__imageCalls = [];
  const view = mountShare();
  act(() => view.get().enter());
  act(() => view.get().toggleAll());
  await act(async () => {
    await view.get().generateImage();
  });
  assert.equal(globalThis.__imageCalls.length, 1);
  assert.equal(
    globalThis.__imageCalls[0].link,
    "https://leoimage.oceanleo.com/share/abc123",
  );
  assert.equal(globalThis.__imageCalls[0].title, "同比分析");
  assert.equal(view.get().preview.blobs.length, 1);
  act(() => view.get().closePreview());
  assert.equal(view.get().preview, null);
  view.unmount();
});

test("操作条给全 6 个动作，取消退回普通模式", () => {
  const view = mountShare();
  act(() => view.get().enter());
  const labels = [...view.host.querySelectorAll("button")].map((button) =>
    button.textContent.trim(),
  );
  for (const expected of [
    "全选",
    "复制文本",
    "复制链接",
    "生成长图",
    "生成文档",
    "取消",
  ]) {
    assert.ok(labels.includes(expected), `操作条缺「${expected}」`);
  }
  const cancel = [...view.host.querySelectorAll("button")].find(
    (button) => button.textContent.trim() === "取消",
  );
  act(() => cancel.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  assert.equal(view.get().active, false);
  view.unmount();
});

test("选段模式下每条消息左侧出现圆形勾选框；普通模式下没有", () => {
  const message = { id: 4, role: "assistant", kind: "text", content: "同比增长 12%。" };
  let toggled = 0;
  const selecting = mount(
    React.createElement(AgentTranscriptBubble, {
      message,
      selectMode: true,
      selected: false,
      onSelectToggle: () => {
        toggled += 1;
      },
    }),
  );
  const box = selecting.host.querySelector('[role="checkbox"]');
  assert.ok(box, "选段模式应当有勾选框");
  assert.equal(box.getAttribute("aria-checked"), "false");
  act(() => box.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  assert.ok(toggled >= 1);
  selecting.unmount();

  const normal = mount(
    React.createElement(AgentTranscriptBubble, { message, selectMode: false }),
  );
  assert.equal(normal.host.querySelector('[role="checkbox"]'), null);
  normal.unmount();
});

test("普通模式下每条回答底下有复制 / 重做 / 分享三个小图标", () => {
  const message = { id: 4, role: "assistant", kind: "text", content: "同比增长 12%。" };
  let regenerated = 0;
  let shared = 0;
  const view = mount(
    React.createElement(AgentTranscriptBubble, {
      message,
      onRegenerate: () => {
        regenerated += 1;
      },
      onShare: () => {
        shared += 1;
      },
    }),
  );
  const labels = [...view.host.querySelectorAll("button")].map((button) =>
    button.getAttribute("aria-label"),
  );
  assert.deepEqual(labels, ["复制", "重做", "分享"]);
  const [, redo, share] = view.host.querySelectorAll("button");
  act(() => redo.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  act(() => share.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  assert.equal(regenerated, 1);
  assert.equal(shared, 1);
  view.unmount();
});

test("勾选框与消息渲染都在，用户消息也能被选中", () => {
  const view = mount(
    React.createElement(AgentTranscriptBubble, {
      message: { id: 1, role: "user", kind: "text", content: "帮我算个同比" },
      selectMode: true,
      selected: true,
      onSelectToggle: () => {},
    }),
  );
  const box = view.host.querySelector('[role="checkbox"]');
  assert.equal(box.getAttribute("aria-checked"), "true");
  assert.ok(view.host.textContent.includes("帮我算个同比"));
  view.unmount();
});
