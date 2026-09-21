import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  InputEvent: window.InputEvent,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const modalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function Modal({ children }) {
    return React.createElement("div", { "data-testid": "modal" }, children);
  }
`);
const apiStubUrl = dataModule(`
  export class CloudComputerError extends Error {
    constructor(code, message, status) {
      super(message);
      this.name = "CloudComputerError";
      this.code = code;
      this.status = status;
    }
  }
  export function nodeDownloadUrl(os, arch) {
    return "https://api.example.test/v1/computers/node/download/" + os + "-" + arch;
  }
  export function nodeSha256SumsUrl() {
    return "https://api.example.test/v1/computers/node/download/SHA256SUMS";
  }
  export function nodeInstallScriptUrl() {
    return "https://api.example.test/v1/computers/node/install.sh";
  }
`);

const { ConnectServerDialog } = await import(
  await compileModule("src/shell/cloud-computer/ConnectServerDialog.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../ui": modalStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
  })
);

function baseComputer(overrides = {}) {
  return {
    id: "cc_new",
    name: "家里的机器",
    source: "byo",
    status: "pending",
    edition: "com",
    node_online: false,
    created_at: "2026-09-21T00:00:00Z",
    updated_at: "2026-09-21T00:00:00Z",
    ...overrides,
  };
}

function makeClient(overrides = {}) {
  const log = {
    createByo: [],
    regenerate: [],
    confirm: [],
    deleted: [],
    getComputer: [],
  };
  let computer = baseComputer();
  const client = {
    log,
    async createByoComputer({ name }) {
      log.createByo.push(name);
      computer = baseComputer({
        name,
        status: "pending",
        id: overrides.createdId || "cc_new",
      });
      return {
        computer,
        install_command:
          overrides.installCommand ||
          "curl -fsSL https://api.example.test/v1/computers/node/install.sh | sudo bash -s -- --code cce_deadbeef",
        enroll_expires_at:
          overrides.enrollExpiresAt ||
          new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    },
    async getComputer(id) {
      log.getComputer.push(id);
      if (typeof overrides.getComputer === "function") {
        return overrides.getComputer(id, computer);
      }
      return { ...computer };
    },
    async regenerateInstallCommand(id) {
      log.regenerate.push(id);
      return {
        install_command:
          overrides.regenCommand ||
          "curl -fsSL https://api.example.test/v1/computers/node/install.sh | sudo bash -s -- --code cce_regenerated",
        enroll_expires_at:
          overrides.regenExpiresAt ||
          new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
    },
    async confirmComputer(id) {
      log.confirm.push(id);
      return { ...computer, status: "active", confirmed_at: "now" };
    },
    async deleteComputer(id) {
      log.deleted.push(id);
      return { ...computer, status: "removed" };
    },
  };
  return client;
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const closed = { n: 0, created: 0 };
  await act(async () => {
    root.render(
      React.createElement(ConnectServerDialog, {
        pollIntervalMs: 20,
        onClose() {
          closed.n += 1;
        },
        onCreated() {
          closed.created += 1;
        },
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    closed,
    text: () => host.textContent || "",
    step() {
      return host
        .querySelector("[data-oceanleo-cc-connect-step]")
        ?.getAttribute("data-oceanleo-cc-connect-step");
    },
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => (node.textContent || "").trim() === label,
      );
    },
    async click(node) {
      assert.ok(node, "expected clickable element");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("四步切换：consent → name → command → confirm", async () => {
  let status = "pending";
  const client = makeClient({
    getComputer() {
      return baseComputer({
        status,
        node_hostname: "box-1",
        node_public_ip: "198.51.100.8",
        node_os: "linux",
        node_arch: "amd64",
        node_kernel: "6.8.0",
        node_cpus: 2,
        node_mem_bytes: 2147483648,
        node_run_as: "oceanleo",
        node_fingerprint: "SHA256:abcd1234",
        node_online: true,
      });
    },
  });
  const view = await render({ client });
  assert.equal(view.step(), "consent");
  assert.ok(view.text().includes("安装一个 6 MB 的节点程序"));
  assert.ok(view.text().includes("只主动连 OceanLeo"));
  assert.ok(view.text().includes("oceanleo 用户"));
  assert.ok(view.text().includes("sudo oceanleo-node revoke"));
  await view.click(view.button("我明白，继续"));
  assert.equal(view.step(), "name");
  const input = view.host.querySelector('input[aria-label="名字"]');
  assert.ok(input);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter.call(input, "家里的机器");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await view.click(view.button("生成安装命令"));
  assert.equal(view.step(), "command");
  const command = view.host.querySelector("[data-oceanleo-cc-install-command]");
  assert.ok(command);
  assert.equal((command.textContent || "").includes("token="), false);
  status = "enrolled";
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  await flush(12);
  assert.equal(view.step(), "confirm");
  assert.ok(view.host.querySelector("[data-oceanleo-cc-fingerprint]"));
  assert.ok(view.text().includes("SHA256:abcd1234"));
  view.cleanup();
});

test("倒计时到期显示重新生成", async () => {
  const client = makeClient({
    enrollExpiresAt: "2000-01-01T00:00:00.000Z",
  });
  const view = await render({ client });
  await view.click(view.button("我明白，继续"));
  const input = view.host.querySelector('input[aria-label="名字"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter.call(input, "过期机");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await view.click(view.button("生成安装命令"));
  assert.equal(view.step(), "command");
  const regen = view.host.querySelector("[data-oceanleo-cc-regenerate]");
  assert.ok(regen);
  assert.equal((regen.textContent || "").trim(), "已过期，重新生成");
  await view.click(regen);
  assert.deepEqual(client.log.regenerate, ["cc_new"]);
  view.cleanup();
});

test("轮询到 enrolled 切到 confirm", async () => {
  const client = makeClient({
    createdId: "cc_poll",
    getComputer() {
      return baseComputer({
        id: "cc_poll",
        status: "enrolled",
        node_fingerprint: "SHA256:pollpoll",
        node_hostname: "poll-box",
      });
    },
  });
  const view = await render({ client });
  await view.click(view.button("我明白，继续"));
  const input = view.host.querySelector('input[aria-label="名字"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter.call(input, "轮询机");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await view.click(view.button("生成安装命令"));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
  await flush(12);
  assert.equal(view.step(), "confirm");
  assert.ok(view.text().includes("SHA256:pollpoll"));
  assert.ok(client.log.getComputer.length >= 1);
  view.cleanup();
});

test("确认调用 confirmComputer；移除调用 deleteComputer", async () => {
  const enrolled = baseComputer({
    id: "cc_enrolled",
    status: "enrolled",
    node_fingerprint: "SHA256:confirmme",
    node_hostname: "ok-box",
    node_run_as: "oceanleo",
  });
  const client = makeClient();
  const view = await render({ client, resumeComputer: enrolled });
  assert.equal(view.step(), "confirm");
  await view.click(view.host.querySelector("[data-oceanleo-cc-confirm]"));
  assert.deepEqual(client.log.confirm, ["cc_enrolled"]);
  assert.equal(view.closed.n, 1);
  view.cleanup();

  const client2 = makeClient();
  const view2 = await render({ client: client2, resumeComputer: enrolled });
  await view2.click(view2.host.querySelector("[data-oceanleo-cc-reject]"));
  assert.deepEqual(client2.log.deleted, ["cc_enrolled"]);
  assert.equal(view2.closed.n, 1);
  view2.cleanup();
});

test("命令框文本不含 token=", async () => {
  const client = makeClient({
    installCommand:
      "curl -fsSL https://api.example.test/v1/computers/node/install.sh | sudo bash -s -- --code cce_nopub",
  });
  const view = await render({ client });
  await view.click(view.button("我明白，继续"));
  const input = view.host.querySelector('input[aria-label="名字"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter.call(input, "无令牌");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await view.click(view.button("生成安装命令"));
  const command = view.host.querySelector("[data-oceanleo-cc-install-command]");
  assert.ok(command);
  assert.equal((command.textContent || "").includes("token="), false);
  assert.equal(view.text().includes("token="), false);
  view.cleanup();
});
