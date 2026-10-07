// 设置 → 邮件：Account 同行布局（左内容、右按键；空表单默认不露出）。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/mail-section-layout.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/settings/mail",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLFormElement: window.HTMLFormElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const { createRoot } = await import("react-dom/client");

const reactUrl = pathToFileURL(require.resolve("react")).href;

function snapshot(overrides = {}) {
  return {
    domain: "bot.oceanleo.com",
    address: {
      id: "addr-1",
      kind: "main",
      name: "",
      instructions: "",
      local_part: "elonlee63",
      email: "elonlee63@bot.oceanleo.com",
    },
    workflows: [],
    senders: [],
    inbox: [],
    ...overrides,
  };
}

const STUBS = {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (zh) => zh;
    }
  `),
  "../../AuthDialog": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AuthPanel() {
      return React.createElement("div", { "data-auth-panel": "" }, "auth");
    }
  `),
  "../../../shell/share/share-clipboard": dataModule(`
    export async function writeClipboardText(value) {
      globalThis.__mailCopied = value;
      return true;
    }
  `),
  "../../../lib/mail-api": dataModule(`
    function store() {
      return globalThis.__mailApi;
    }
    export async function getMail() {
      return store().getMail();
    }
    export async function renameMailAddress(localPart) {
      return store().renameMailAddress(localPart);
    }
    export async function addMailWorkflow(input) {
      return store().addMailWorkflow(input);
    }
    export async function deleteMailWorkflow(id) {
      return store().deleteMailWorkflow(id);
    }
    export async function addMailSender(email) {
      return store().addMailSender(email);
    }
    export async function deleteMailSender(id) {
      return store().deleteMailSender(id);
    }
  `),
};

const { MailSection } = await import(
  await compileModule("src/pages/settings/mail/MailSection.tsx", STUBS)
);

function resetStubs(data = snapshot()) {
  globalThis.__mailCopied = "";
  globalThis.__mailApi = {
    data,
    renamed: [],
    workflows: [],
    deletedWorkflows: [],
    senders: [],
    deletedSenders: [],
    async getMail() {
      return { ok: true, data: this.data };
    },
    async renameMailAddress(localPart) {
      this.renamed.push(localPart);
      this.data = {
        ...this.data,
        address: {
          ...this.data.address,
          local_part: localPart,
          email: `${localPart}@${this.data.domain}`,
        },
      };
      return { ok: true, data: this.data };
    },
    async addMailWorkflow(input) {
      this.workflows.push(input);
      const item = {
        id: `wf-${this.data.workflows.length + 1}`,
        kind: "workflow",
        name: input.name,
        instructions: input.instructions,
        local_part: input.local_part,
        email: `${input.local_part}@${this.data.domain}`,
      };
      this.data = { ...this.data, workflows: [...this.data.workflows, item] };
      return { ok: true, data: this.data };
    },
    async deleteMailWorkflow(id) {
      this.deletedWorkflows.push(id);
      this.data = { ...this.data, workflows: this.data.workflows.filter((item) => item.id !== id) };
      return { ok: true, data: this.data };
    },
    async addMailSender(email) {
      this.senders.push(email);
      const item = { id: `s-${this.data.senders.length + 1}`, email };
      this.data = { ...this.data, senders: [...this.data.senders, item] };
      return { ok: true, data: this.data };
    },
    async deleteMailSender(id) {
      this.deletedSenders.push(id);
      this.data = { ...this.data, senders: this.data.senders.filter((item) => item.id !== id) };
      return { ok: true, data: this.data };
    },
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount() {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(MailSection, { variant: "pane" }));
  });
  await flush();
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(el) {
  assert.ok(el, "click target");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

test("默认只展示已有内容和右侧按键，不摊开空输入框", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    const pane = host.querySelector('[data-settings-pane="mail"]');
    assert.ok(pane);
    assert.equal(pane.getAttribute("data-mail-editor"), "none");
    assert.match(host.textContent, /OceanLeo 的邮箱/);
    assert.equal(host.querySelector("[data-mail-address]").textContent.trim(), "elonlee63@bot.oceanleo.com");
    assert.match(host.querySelector("[data-mail-copy]").textContent, /复制/);
    assert.match(host.textContent, /自定义地址/);
    assert.equal(host.querySelector("[data-mail-custom-address]").textContent.trim(), "elonlee63@bot.oceanleo.com");
    assert.match(host.querySelector("[data-mail-change-address]").textContent, /更改/);
    assert.match(host.querySelector("[data-mail-add-workflow]").textContent, /添加/);
    assert.match(host.querySelector("[data-mail-add-sender]").textContent, /添加/);
    assert.equal(host.querySelector("[data-mail-address-form]"), null);
    assert.equal(host.querySelector("[data-mail-workflow-form]"), null);
    assert.equal(host.querySelector("[data-mail-sender-form]"), null);
    assert.equal(host.querySelector("input"), null);
    assert.equal(host.querySelector("textarea"), null);
    assert.match(host.textContent, /还没有由邮件创建的任务/);
    for (const key of ["data-mail-copy", "data-mail-change-address", "data-mail-add-workflow", "data-mail-add-sender"]) {
      const button = host.querySelector(`[${key}]`);
      assert.ok(button, key);
      assert.ok(button.className.includes("font-medium"), `${key} 右侧按键字重太细`);
    }
  } finally {
    await unmount();
  }
});

test("点更改才出现地址输入框；取消后收回", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-mail-change-address]"));
    assert.ok(host.querySelector("[data-mail-address-form]"));
    assert.equal(host.querySelector("[data-mail-prefix]").value, "elonlee63");
    assert.match(host.textContent, /@bot.oceanleo.com/);
    await click(host.querySelector("[data-mail-address-form] button[type='button']"));
    assert.equal(host.querySelector("[data-mail-address-form]"), null);
    assert.ok(host.querySelector("[data-mail-change-address]"));
  } finally {
    await unmount();
  }
});

test("点工作流添加才出现前缀 / 名称 / 指令；点发件人添加才出现邮箱框", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-mail-add-workflow]"));
    assert.ok(host.querySelector("[data-mail-workflow-form]"));
    assert.ok(host.querySelector("[data-mail-workflow-prefix]"));
    assert.ok(host.querySelector("[data-mail-workflow-name]"));
    assert.ok(host.querySelector("[data-mail-workflow-instructions]"));
    await click(host.querySelector("[data-mail-cancel-workflow]"));
    assert.equal(host.querySelector("[data-mail-workflow-form]"), null);
    await click(host.querySelector("[data-mail-add-sender]"));
    assert.ok(host.querySelector("[data-mail-sender-form]"));
    assert.ok(host.querySelector("[data-mail-sender-email]"));
    await click(host.querySelector("[data-mail-cancel-sender]"));
    assert.equal(host.querySelector("[data-mail-sender-form]"), null);
  } finally {
    await unmount();
  }
});

test("已有工作流和发件人显示为左内容右删除，仍不摊开空表单", async () => {
  resetStubs(
    snapshot({
      workflows: [
        {
          id: "wf-1",
          kind: "workflow",
          name: "周报",
          instructions: "整理成周报",
          local_part: "weekly",
          email: "weekly@bot.oceanleo.com",
        },
      ],
      senders: [{ id: "s-1", email: "elonlee63@gmail.com" }],
    }),
  );
  const { host, unmount } = await mount();
  try {
    assert.match(host.textContent, /weekly@bot.oceanleo.com/);
    assert.match(host.textContent, /周报/);
    assert.match(host.textContent, /elonlee63@gmail.com/);
    assert.ok(host.querySelector("[data-mail-delete-workflow='wf-1']"));
    assert.ok(host.querySelector("[data-mail-delete-sender='s-1']"));
    assert.equal(host.querySelector("[data-mail-workflow-form]"), null);
    assert.equal(host.querySelector("[data-mail-sender-form]"), null);
    assert.equal(host.querySelector("input"), null);
  } finally {
    await unmount();
  }
});

test("复制按钮写下当前邮箱", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-mail-copy]"));
    assert.equal(globalThis.__mailCopied, "elonlee63@bot.oceanleo.com");
    assert.match(host.querySelector("[data-mail-copy]").textContent, /已复制/);
  } finally {
    await unmount();
  }
});

test("保存自定义地址会调用 renameMailAddress 并收回表单", async () => {
  resetStubs();
  const { host, unmount } = await mount();
  try {
    await click(host.querySelector("[data-mail-change-address]"));
    const input = host.querySelector("[data-mail-prefix]");
    await act(async () => {
      const tracker = input._valueTracker;
      input.value = "elonlee";
      if (tracker) tracker.setValue("");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await flush();
    await act(async () => {
      host.querySelector("[data-mail-address-form]").dispatchEvent(
        new window.Event("submit", { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    assert.deepEqual(globalThis.__mailApi.renamed, ["elonlee"]);
    assert.equal(host.querySelector("[data-mail-address-form]"), null);
    assert.equal(host.querySelector("[data-mail-address]").textContent.trim(), "elonlee@bot.oceanleo.com");
  } finally {
    await unmount();
  }
});

test("没处理的来信：未批准的给「批准」，核实不了的只说明", async () => {
  resetStubs(snapshot({ ignored: { from: "work@corp.com", reason: "not_approved" } }));
  const first = await mount();
  try {
    const hint = first.host.querySelector("[data-mail-ignored='not_approved']");
    assert.ok(hint);
    assert.match(first.host.textContent, /work@corp.com/);
    assert.equal(first.host.querySelector("input"), null);
    await click(first.host.querySelector("[data-mail-approve-ignored]"));
    assert.deepEqual(globalThis.__mailApi.senders, ["work@corp.com"]);
  } finally {
    await first.unmount();
  }

  resetStubs(snapshot({ ignored: { from: "me@gmail.com", reason: "unverified" } }));
  const second = await mount();
  try {
    assert.ok(second.host.querySelector("[data-mail-ignored='unverified']"));
    assert.equal(second.host.querySelector("[data-mail-approve-ignored]"), null);
  } finally {
    await second.unmount();
  }
});
