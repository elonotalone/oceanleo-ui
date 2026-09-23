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
  url: "https://oceanleo.com/computers/cc_1?card=cli",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  StorageEvent: window.StorageEvent,
  localStorage: window.localStorage,
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
const apiStubUrl = dataModule("export const cloudComputerApi = {};");
const uiStubUrl = dataModule(`
  export function useUI() { return (value, values) => {
    if (!values) return value;
    return Object.entries(values).reduce(
      (text, [key, replacement]) => text.replaceAll("{" + key + "}", String(replacement)),
      value,
    );
  }; }
`);
const navigationStubUrl = dataModule(`
  export function useRouter() { return globalThis.__cliCardRouter; }
`);
const viewportStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TerminalViewport(props) {
    return React.createElement("div", {
      "data-test-cli-viewport": props.record.id,
    });
  }
`);

const { CliCard } = await import(
  await compileModule("src/shell/cloud-computer/terminal-card/CliCard.tsx", {
    "../../../lib/cloud-computer-api": apiStubUrl,
    "../../../i18n/ui/useUI": uiStubUrl,
    "next/navigation": navigationStubUrl,
    "./TerminalViewport": viewportStubUrl,
  })
);

function computer() {
  return { id: "cc_1", name: "测试服务器", node_online: true };
}

function program(overrides = {}) {
  return {
    id: "cursor",
    label: "Cursor",
    installed: true,
    version: "1",
    supports_resume: true,
    options: [],
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: "cursor-live",
    title: "Cursor live",
    created_at: "2026-09-23T10:00:00Z",
    alive: true,
    ended_at: null,
    exit_code: null,
    end_reason: null,
    kind: "cli",
    program: "cursor",
    cwd: null,
    record_bytes: 0,
    ...overrides,
  };
}

async function flush(count = 7) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

function createClient({ historySupported = true } = {}) {
  const calls = { launch: [], setTools: [], close: [], programs: 0, terminals: 0, chats: [] };
  let records = [
    record(),
    record({ id: "claude-live", program: "claude" }),
    record({ id: "shell-live", kind: "shell", program: null }),
    record({
      id: "cursor-ended",
      alive: false,
      ended_at: "2026-09-23T09:00:00Z",
      end_reason: "exit",
      exit_code: 0,
    }),
  ];
  return {
    calls,
    async listCliPrograms() {
      calls.programs++;
      return {
        programs: [
          program({ id: "codex", label: "Codex" }),
          program({ id: "claude", label: "Claude Code", installed: false }),
          program({ id: "oceanleo", label: "OceanLeo" }),
          program({
            id: "cursor",
            label: "Cursor",
            options: [
              {
                key: "model",
                label: "Model",
                type: "select",
                choices: [
                  { value: "auto", label: "Auto" },
                  { value: "pro", label: "Pro" },
                ],
                default: "auto",
              },
            ],
          }),
          program({ id: "hermes", label: "Hermes" }),
        ],
      };
    },
    async listTerminalsWithRecords() {
      calls.terminals++;
      return { sessions: [...records], records_supported: true };
    },
    async listCliSessions(_id, selectedProgram) {
      calls.chats.push(selectedProgram);
      if (!historySupported) return { supported: false, sessions: [] };
      return {
        supported: true,
        sessions:
          selectedProgram === "cursor"
            ? [
                {
                  id: "resume-old",
                  title: "旧对话",
                  cwd: null,
                  updated_at: "2026-09-23T08:00:00Z",
                },
                {
                  id: "resume-new",
                  title: "最近对话",
                  cwd: "/srv/app",
                  updated_at: "2026-09-23T11:00:00Z",
                },
              ]
            : [],
      };
    },
    async getAgentSettings() {
      return {
        confirm_dangerous: true,
        oceanleo_tools: true,
        billing_paused: false,
      };
    },
    async getCliTools() {
      return { programs: { cursor: true, claude: false, codex: false } };
    },
    async setCliTools(id, selectedProgram, enabled) {
      calls.setTools.push({ id, program: selectedProgram, enabled });
      return { ok: true, program: selectedProgram, enabled };
    },
    async launchCli(id, body) {
      calls.launch.push({ id, body });
      const session = record({
        id: `launched-${calls.launch.length}`,
        title: "续聊",
        created_at: "2026-09-23T12:00:00Z",
      });
      records = [session, ...records];
      return { session };
    },
    async closeTerminal(id, sessionId) {
      calls.close.push({ id, sessionId });
      records = records.filter((item) => item.id !== sessionId);
      return { ok: true };
    },
  };
}

async function renderCard({ api, props = {} }) {
  const pushes = [];
  const replaces = [];
  globalThis.__cliCardRouter = {
    push(href) {
      pushes.push(href);
    },
    replace(href) {
      replaces.push(href);
    },
  };
  window.localStorage.clear();
  window.localStorage.setItem(
    "oceanleo.cli.settings.v1",
    JSON.stringify({
      "cc_1:cursor": {
        options: { model: "pro" },
        confirmDangerous: false,
      },
    }),
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(CliCard, {
        computer: computer(),
        initialProgram: "cursor",
        client: api,
        refreshIntervalMs: 0,
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    async rerender(patch) {
      props = { ...props, ...patch };
      await act(async () => root.render(React.createElement(CliCard, { computer: computer(), initialProgram: "cursor", client: api, refreshIntervalMs: 0, ...props })));
    },
    pushes,
    replaces,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("CLI 共享程序条、运行/历史列表、浅地址、续聊 options 与工具开关", async () => {
  const api = createClient();
  const view = await renderCard({ api });
  try {
    assert.deepEqual(
      [...view.host.querySelectorAll("[data-oceanleo-program-strip-item]")].map((node) =>
        node.getAttribute("data-oceanleo-program-strip-item"),
      ),
      ["oceanleo", "cursor", "claude", "codex", "hermes"],
    );
    assert.deepEqual(
      [...view.host.querySelectorAll("[data-oceanleo-cli-running]")].map((node) =>
        node.getAttribute("data-oceanleo-cli-running"),
      ),
      ["cursor-live"],
    );
    assert.deepEqual(
      [...view.host.querySelectorAll("[data-oceanleo-cli-chat]")].map((node) =>
        node.getAttribute("data-oceanleo-cli-chat"),
      ),
      ["resume-new", "resume-old"],
    );

    assert.ok(view.host.querySelector("[data-oceanleo-program-strip]"));
    assert.equal(view.host.querySelector("[data-oceanleo-cli-programs-toggle]"), null);

    const resume = view.host.querySelector('[data-oceanleo-cli-chat="resume-new"]');
    assert.ok(resume);
    await act(async () => resume.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(api.calls.launch[0], {
      id: "cc_1",
      body: {
        program: "cursor",
        resume_id: "resume-new",
        options: { model: "pro", confirm_dangerous: false },
        cols: 120,
        rows: 36,
      },
    });
    assert.equal(
      view.host.querySelector("[data-test-cli-viewport]")?.getAttribute(
        "data-test-cli-viewport",
      ),
      "launched-1",
    );
    assert.equal(
      window.location.pathname + window.location.search,
      "/computers/cc_1?card=cli&program=cursor&session=launched-1",
    );

    const settings = view.host.querySelector('[data-oceanleo-program-strip-settings="cursor"]');
    assert.ok(settings);
    await act(async () => settings.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    const tools = view.host.querySelector('[data-oceanleo-cli-tools="cursor"]');
    assert.ok(tools);
    assert.equal(tools.checked, true);
    await act(async () => tools.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.deepEqual(api.calls.setTools, [
      { id: "cc_1", program: "cursor", enabled: false },
    ]);

    const claude = view.host.querySelector('[data-oceanleo-program-strip-item="claude"]');
    assert.ok(claude);
    await act(async () => claude.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    const install = view.host.querySelector('[data-oceanleo-cli-install="claude"]');
    assert.ok(install);
    await act(async () => install.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    assert.equal(window.location.search, "?card=acp&program=claude");
    assert.deepEqual(view.pushes, []);
    assert.deepEqual(view.replaces, []);
  } finally {
    view.cleanup();
  }
});

test("不支持读取 CLI 历史时显示明确提示", async () => {
  const api = createClient({ historySupported: false });
  const view = await renderCard({ api });
  try {
    assert.ok(view.host.querySelector("[data-oceanleo-cli-history-unsupported]"));
    assert.match(view.host.textContent || "", /这个程序不支持读取过去的命令行对话/);
  } finally {
    view.cleanup();
  }
});

test("旧节点缺少 CLI kind 时，启动后的会话仍保持可见", async () => {
  const api = createClient();
  const listTerminals = api.listTerminalsWithRecords;
  const launchCli = api.launchCli;
  api.listTerminalsWithRecords = async (...args) => {
    const result = await listTerminals(...args);
    return {
      ...result,
      sessions: result.sessions.map((session) =>
        session.id.startsWith("launched-")
          ? { ...session, kind: "shell", program: null }
          : session,
      ),
    };
  };
  api.launchCli = async (...args) => {
    const result = await launchCli(...args);
    return {
      session: { ...result.session, kind: "shell", program: null },
    };
  };
  const view = await renderCard({ api });
  try {
    const open = view.host.querySelector("[data-oceanleo-new-cli-chat]");
    assert.ok(open);
    await act(async () => open.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.equal(
      view.host.querySelector("[data-test-cli-viewport]")?.getAttribute(
        "data-test-cli-viewport",
      ),
      "launched-1",
    );
    assert.ok(view.host.querySelector('[data-oceanleo-cli-running="launched-1"]'));
  } finally {
    view.cleanup();
  }
});
