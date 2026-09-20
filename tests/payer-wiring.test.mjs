// 发送时把「这次谁付钱」真送到网关（W20，2026-09-20）。
//
// 输入框旁的 PayerSelector 让人选了「公司付」，但三条发送路径曾把这个选择丢掉，
// 网关按个人钱包扣。本文件钉三件事：
//   ① 没选组织：createTask（任务书称 start）请求体 `org_id === ""`，其余字段与改前逐字相同；
//   ② 选了组织：createTask / followUp / branchTask 请求体带该 `org_id`；
//   ③ AgentChat 路径：模拟 LeoComposer.onSubmit(text, {org_id:"o1"}) 后 fetch 体带 o1。
//
// 跑法（**必须带 loader**）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/payer-wiring.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const authStub = dataModule(`
  export async function accessToken(){ return "tok"; }
  export function cachedAccessToken(){ return "tok"; }
`);
const gatewayStub = dataModule(`export const GATEWAY_BASE = "https://api.oceanleo.com";`);
const historyStub = dataModule(`export function notifyHistoryChanged(){}`);
const fnAgentStub = dataModule(`export {};`);

const realAgentUrl = await compileModule(
  "src/lib/agent.ts",
  {
    "./auth/client": authStub,
    "./auth/config": gatewayStub,
    "./history-events": historyStub,
    "./fn-agent": fnAgentStub,
  },
  { missingPackageStub: lazyStub },
);

const { createTask, followUp, branchTask } = await import(realAgentUrl);
const {
  persistedPayerOrgId,
  payerRequestFields,
  persistPayerOrgId,
  PAYER_LAST_KEY,
} = await import(await compileModule("src/lib/payer.ts"));

/** 改前 createTask 请求体（不含 org_id）。新增字段只许是 org_id。 */
const START_BODY_BEFORE = {
  prompt: "hello",
  hidden_context: "",
  mode: "agent",
  site_id: "",
  agent_model: "",
  model_selection: {},
  project_id: null,
  agent_id: "",
  session_id: null,
  ops_state: null,
  team_id: "",
  prompt_override: "",
  attachments: [],
};

function installMemoryStorage(seed = {}) {
  const store = { ...seed };
  const localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
  const previous = globalThis.window;
  globalThis.window = { localStorage };
  return {
    store,
    restore() {
      if (previous === undefined) delete globalThis.window;
      else globalThis.window = previous;
    },
  };
}

function jsonOk(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    headers: { get: () => null },
  };
}

async function withFetch(run) {
  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({
      url: String(url),
      method: init.method || "GET",
      body: init.body ? String(init.body) : "",
    });
    const u = String(url);
    if (u.endsWith("/v1/agent/tasks") && init.method === "POST") {
      return jsonOk({ task_id: "t1", status: "running", mode: "agent" });
    }
    if (u.includes("/messages") && init.method === "POST") {
      return jsonOk({ task_id: "t1", status: "running" });
    }
    if (u.includes("/branches") && init.method === "POST") {
      return jsonOk({
        task_id: "t2",
        status: "running",
        session_id: null,
        parent_task_id: "t1",
        branch_from_message_id: 1,
      });
    }
    if (u.includes("/v1/agent/tasks/t1")) {
      return jsonOk({
        task: { id: "t1", status: "running" },
        messages: [],
        artifacts: [],
      });
    }
    return jsonOk({});
  };
  try {
    return await run(calls);
  } finally {
    if (previous) globalThis.fetch = previous;
    else delete globalThis.fetch;
  }
}

function postedJson(calls, predicate) {
  const hit = calls.find(predicate);
  assert.ok(hit, `没打到预期请求：${JSON.stringify(calls.map((c) => c.url))}`);
  return JSON.parse(hit.body);
}

test("没选组织：payerRequestFields 恒给出 org_id 空串", () => {
  const bag = installMemoryStorage();
  try {
    assert.equal(persistedPayerOrgId(), "");
    assert.deepEqual(payerRequestFields(), { org_id: "" });
    assert.deepEqual(payerRequestFields(""), { org_id: "" });
  } finally {
    bag.restore();
  }
});

test("显式 orgId 优先于持久化选择", () => {
  const bag = installMemoryStorage({ [PAYER_LAST_KEY]: "stored-org" });
  try {
    assert.equal(persistedPayerOrgId(), "stored-org");
    assert.deepEqual(payerRequestFields(), { org_id: "stored-org" });
    assert.deepEqual(payerRequestFields("o1"), { org_id: "o1" });
    assert.deepEqual(payerRequestFields(""), { org_id: "" });
    persistPayerOrgId("");
    assert.equal(
      Object.prototype.hasOwnProperty.call(bag.store, PAYER_LAST_KEY),
      false,
      "个人钱包删键，不写空串",
    );
  } finally {
    bag.restore();
  }
});

test("没选组织：createTask 请求体 org_id 为空串，其余字段与改前逐字相同", async () => {
  const bag = installMemoryStorage();
  try {
    await withFetch(async (calls) => {
      const result = await createTask({ prompt: "hello" });
      assert.equal(result.ok, true);
      const body = postedJson(
        calls,
        (c) => c.method === "POST" && c.url.endsWith("/v1/agent/tasks"),
      );
      assert.equal(body.org_id, "");
      const rest = { ...body };
      delete rest.org_id;
      assert.deepEqual(rest, START_BODY_BEFORE);
    });
  } finally {
    bag.restore();
  }
});

test("选了组织：createTask / followUp / branchTask 请求体带该 org_id", async () => {
  const bag = installMemoryStorage();
  try {
    await withFetch(async (calls) => {
      await createTask({ prompt: "hello", orgId: "org-acme" });
      await followUp("t1", "again", undefined, "", "org-acme");
      await branchTask("t1", 3, "branch", undefined, "org-acme");
      const start = postedJson(
        calls,
        (c) => c.method === "POST" && c.url.endsWith("/v1/agent/tasks"),
      );
      const follow = postedJson(calls, (c) => c.url.includes("/messages"));
      const branch = postedJson(calls, (c) => c.url.includes("/branches"));
      assert.equal(start.org_id, "org-acme");
      assert.equal(follow.org_id, "org-acme");
      assert.equal(branch.org_id, "org-acme");
      const followRest = { ...follow };
      delete followRest.org_id;
      assert.deepEqual(followRest, {
        prompt: "again",
        hidden_context: "",
        attachments: [],
      });
      const branchRest = { ...branch };
      delete branchRest.org_id;
      assert.deepEqual(branchRest, {
        from_message_id: 3,
        prompt: "branch",
        attachments: [],
      });
    });
  } finally {
    bag.restore();
  }
});

test("没传 orgId 时 createTask 回落到持久化的选择", async () => {
  const bag = installMemoryStorage({ [PAYER_LAST_KEY]: "org-remembered" });
  try {
    await withFetch(async (calls) => {
      await createTask({ prompt: "hello" });
      const body = postedJson(
        calls,
        (c) => c.method === "POST" && c.url.endsWith("/v1/agent/tasks"),
      );
      assert.equal(body.org_id, "org-remembered");
    });
  } finally {
    bag.restore();
  }
});

// ————————————————————————————————————————————————————————————————
// AgentChat 路径：Composer 第二参必须出现在 fetch 体里
// ————————————————————————————————————————————————————————————————

const agentLib = dataModule(`export * from ${JSON.stringify(realAgentUrl)};`);

const OVERRIDES = {
  "../lib/agent": agentLib,
  "../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }",
  ),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  "../lib/console-draft": dataModule(
    "export async function loadConsoleDraft(){ return null; }\nexport async function saveConsoleDraft(){}\nexport async function clearConsoleDraft(){}",
  ),
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule(
    "export function ResultCanvas(){ return null; }\nexport function CanvasEmpty(){ return null; }\nexport function CanvasSubTabs(){ return null; }",
  ),
  "./ArtifactRenderer": dataModule(
    "export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }",
  ),
  "./MaterialLibrary": dataModule("export function MaterialLibrary(){ return null; }"),
  "./HumanHandoffButton": dataModule("export function HumanHandoffButton(){ return null; }"),
  "./HumanHandoffStatus": dataModule("export function HumanHandoffStatus(){ return null; }"),
  "./quick-actions": dataModule("export function QuickActionChips(){ return null; }"),
  "./useAttachments": dataModule(`
    export function useAttachments(){
      return {
        attachments: [],
        composerAttachments: [],
        handleAttachFiles(){},
        addReady(){},
        restoreReady(){},
        removeAttachment(){},
        ready: () => [],
        uploading: false,
        clear(){},
      };
    }
  `),
  "./WorkspaceSession": dataModule(`
    export function WorkspaceSessionProvider(props){ return props.children; }
    export function useOptionalWorkspaceSession(){ return null; }
  `),
  "./LeoComposer": dataModule(`
    import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
    export function LeoComposer(props) {
      globalThis.__payerComposerProps = props;
      return jsx("button", { type: "button", "data-payer-send": "" });
    }
  `),
  "./FunctionAgentChat": dataModule(`
    export function EditorCommandNotes(){ return null; }
    export function useEditorCommandBridge(){
      return { contextFor: () => "", pending: null, busy: false, notes: [], card: null, noteUserTurn(){}, noteOwnTask(){}, ingest(){} };
    }
  `),
  "./agent-review": dataModule(`
    export function AgentReviewPanel(){ return null; }
    export function assembleAgentEditorContext(){ return ""; }
    export function createReviewGatedReader(){ return null; }
    export const hostReviewSession = {};
    export function installAgentReviewGate(){}
    export function installSelectionBridge(){}
    export function readAgentSelection(){ return null; }
    export function readMentionCatalog(){ return []; }
    export function refreshAgentSelectionFromDom(){}
    export function useHostReviewActions(){ return { busy: false, accept(){}, reject(){}, rollback(){} }; }
  `),
  "./plugin-command": dataModule("export function currentPluginCommandSurface(){ return null; }"),
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", { placeholder: props.placeholder, readOnly: true });
    });
    export const TemplateFillArea = PromptHighlightArea;
    export function templateSegments(){ return []; }
    export function highlightSegments(){ return []; }
    export function stripPromptPlaceholders(text){ return text; }
  `),
};

test("AgentChat：LeoComposer.onSubmit({org_id:o1}) 之后 fetch 体带 o1", async () => {
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

  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://chat.oceanleo.com/workspace",
  });
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    HTMLButtonElement: window.HTMLButtonElement,
    SVGElement: window.SVGElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    PointerEvent: window.PointerEvent || window.MouseEvent,
    localStorage: window.localStorage,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  window.HTMLElement.prototype.scrollTo = function scrollTo() {};
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

  const { createRoot } = await import("react-dom/client");
  const { AgentChat } = await import(
    await compileModule("src/shell/AgentChat.tsx", OVERRIDES, {
      missingPackageStub: lazyStub,
    })
  );

  try {
    await withFetch(async (calls) => {
      const host = window.document.createElement("div");
      window.document.body.append(host);
      const root = createRoot(host);
      await act(async () => {
        root.render(React.createElement(AgentChat, { mode: "agent" }));
      });
      assert.ok(
        globalThis.__payerComposerProps,
        "LeoComposer 必须挂上，测试才能模拟 onSubmit",
      );
      await act(async () => {
        globalThis.__payerComposerProps.onChange("hi from composer");
      });
      await act(async () => {
        // 必须用 onChange 之后那一次渲染的 onSubmit：它才闭包到已写入的 input。
        globalThis.__payerComposerProps.onSubmit("hi from composer", {
          org_id: "o1",
        });
      });
      for (let i = 0; i < 20 && !calls.some((c) => c.url.endsWith("/v1/agent/tasks")); i += 1) {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      }
      const body = postedJson(
        calls,
        (c) => c.method === "POST" && c.url.endsWith("/v1/agent/tasks"),
      );
      assert.equal(body.org_id, "o1");
      assert.equal(body.prompt, "hi from composer");
      await act(async () => root.unmount());
      host.remove();
    });
  } finally {
    delete globalThis.__payerComposerProps;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    for (const undo of restore.reverse()) undo();
    window.close();
  }
});
