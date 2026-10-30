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
        cols: 80,
        rows: 24,
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

test("CLI 历史请求失败不是不支持，重试后恢复原生记录", async () => {
  const api = createClient();
  const list = api.listCliSessions;
  let fail = true;
  api.listCliSessions = async (...args) => {
    if (fail) throw new Error("temporary unavailable");
    return list(...args);
  };
  const view = await renderCard({ api });
  try {
    assert.match(view.host.textContent || "", /过去的对话读取失败，请重试/);
    assert.equal(view.host.querySelector("[data-oceanleo-cli-history-unsupported]"), null);
    fail = false;
    const retry = [...view.host.querySelectorAll("button")].find(button => button.textContent === "重试");
    assert.ok(retry);
    await act(async () => retry.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.doesNotMatch(view.host.textContent || "", /过去的对话读取失败/);
    assert.match(view.host.textContent || "", /最近对话/);
  } finally { view.cleanup(); }
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

test("CLI 启动后立即退出仍保留终端回放和退出码", async () => {
  const api = createClient();
  const list = api.listTerminalsWithRecords;
  api.listTerminalsWithRecords = async (...args) => {
    const result = await list(...args);
    return {
      ...result,
      sessions: result.sessions.map((session) => session.id === "launched-1"
        ? { ...session, alive: false, end_reason: "exit", exit_code: 1, ended_at: "2026-09-23T12:00:01Z" }
        : session),
    };
  };
  const view = await renderCard({ api });
  try {
    const open = view.host.querySelector("[data-oceanleo-new-cli-chat]");
    await act(async () => open.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await flush();
    assert.ok(view.host.querySelector('[data-oceanleo-cli-ended="launched-1"]'));
    assert.equal(view.host.querySelector('[data-test-cli-viewport]')?.getAttribute("data-test-cli-viewport"), "launched-1");
    assert.match(view.host.textContent || "", /已退出（代码 1）/);
  } finally {
    view.cleanup();
  }
});

test("切到只有已结束会话的程序时不要自动打开死亡回放", async () => {
  const api = createClient();
  const programs = api.listCliPrograms;
  api.listCliPrograms = async () => {
    const result = await programs();
    return {
      programs: result.programs.map((item) =>
        item.id === "claude" ? { ...item, installed: true } : item,
      ),
    };
  };
  const list = api.listTerminalsWithRecords;
  api.listTerminalsWithRecords = async (...args) => {
    const result = await list(...args);
    return {
      ...result,
      sessions: [
        record({
          id: "claude-dead",
          program: "claude",
          alive: false,
          ended_at: "2026-10-16T05:55:14Z",
          end_reason: "exit",
          exit_code: 1,
        }),
      ],
    };
  };
  const view = await renderCard({ api, props: { initialProgram: "claude" } });
  try {
    assert.equal(view.host.querySelector("[data-test-cli-viewport]"), null);
    assert.match(view.host.textContent || "", /选择运行中的命令行，或打开一个新的/);
    assert.ok(view.host.querySelector('[data-oceanleo-cli-ended="claude-dead"]'));
    assert.equal(
      window.location.pathname + window.location.search,
      "/computers/cc_1?card=cli&program=claude",
    );
  } finally {
    view.cleanup();
  }
});

test("深链仍能打开指定的已结束命令行", async () => {
  const api = createClient();
  const programs = api.listCliPrograms;
  api.listCliPrograms = async () => {
    const result = await programs();
    return {
      programs: result.programs.map((item) =>
        item.id === "claude" ? { ...item, installed: true } : item,
      ),
    };
  };
  const list = api.listTerminalsWithRecords;
  api.listTerminalsWithRecords = async (...args) => {
    const result = await list(...args);
    return {
      ...result,
      sessions: [
        record({
          id: "claude-dead",
          program: "claude",
          alive: false,
          ended_at: "2026-10-16T05:55:14Z",
          end_reason: "exit",
          exit_code: 1,
        }),
      ],
    };
  };
  const view = await renderCard({
    api,
    props: { initialProgram: "claude", initialSessionId: "claude-dead" },
  });
  try {
    assert.equal(
      view.host.querySelector("[data-test-cli-viewport]")?.getAttribute(
        "data-test-cli-viewport",
      ),
      "claude-dead",
    );
  } finally {
    view.cleanup();
  }
});

test("地址变化只更新浅地址，不重拉列表；失活时暂停终端轮询", async () => {
  const api = createClient();
  const view = await renderCard({ api, props: { active: false, refreshIntervalMs: 20 } });
  try {
    const programs = api.calls.programs;
    const terminals = api.calls.terminals;
    await view.rerender({ initialProgram: "codex", initialSessionId: "ignored" });
    assert.equal(api.calls.programs, programs, "initial props are mount-only");
    assert.equal(api.calls.terminals, terminals, "initial props do not reset the card");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 70)); });
    assert.equal(api.calls.terminals, terminals, "inactive cards pause polling");
    await view.rerender({ active: true });
    assert.equal(window.location.search, "?card=cli&program=cursor&session=cursor-live");
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    assert.ok(api.calls.terminals > terminals, "active cards resume polling");
  } finally {
    view.cleanup();
  }
});

test("managed CLI never selects unrelated running CLI and binds before attach; inactive keeps the native session", async () => {
  const api = createClient();
  let binds = 0;
  let settings;
  const originalHref = window.location.href;
  const view = await renderCard({ api, props: {
    embedded: true, settingsOpen: true, onSettingsContent: (value) => { settings = value; },
    onNativeSessionChange: async () => { if (++binds === 1) throw new Error("storage unavailable"); },
  } });
  try {
    assert.equal(view.host.querySelector("aside"), null);
    assert.equal(view.host.querySelector("[data-test-cli-viewport]"), null);
    assert.equal(api.calls.launch.length, 0);
    assert.ok(settings);
    assert.equal(window.location.href, originalHref);
    const open = [...view.host.querySelectorAll("button")].find((item) => item.textContent.includes("打开命令行"));
    await act(async () => open.click()); await flush();
    assert.equal(api.calls.launch.length, 1);
    assert.equal(view.host.querySelector("[data-test-cli-viewport]"), null);
    await act(async () => open.click()); await flush();
    assert.equal(api.calls.launch.length, 1);
    assert.equal(binds, 2);
    assert.ok(view.host.querySelector("[data-test-cli-viewport]"));
    await view.rerender({active:false}); await flush();
    assert.equal(api.calls.launch.length, 1);
    assert.equal(api.calls.close.length, 0);
  } finally { view.cleanup(); }
});
