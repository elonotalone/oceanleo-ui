// agent 回放页（W06，合同 2026-08-20）画出来之后的契约。
//
// 同一个组件带两档（仲裁 A-1）：`/replay/<id>` 逐步播放，`/share/<id>` 静态铺开。
// 静态档的契约在文件末尾那两条用例里 —— 它必须**没有**播放条、没有「重播」、
// 不逐条动画，而卡片展开、表格、防注入这些照旧。
//
// 这份守四件事：
//   ① 三种预览输入（缺失 / 超长 / 含表格）都画得出来，缺失时是「无预览」不是白屏；
//   ② 播放 → 跳过 → 重播在真 DOM 上确实那样动（纯逻辑那份已经钉死状态机，
//      这里只确认组件接的就是它，没有绕过去自己数数）；
//   ③ 用户文字**只**进文本节点：不新增 `dangerouslySetInnerHTML`，
//      一段带 `<img onerror>` 的消息进来，页面里不许长出 img；
//   ④ 回放里没有 iframe（真要有，src 必须是 `*.oceanleo.app`，
//      且 sandbox 不得同时带 allow-scripts 与 allow-same-origin）。

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

// tt() 未命中词典时回退中文原文；测试里直接用恒等翻译（模块级常量，
// 保证 `useUI()` 每次返回的是**同一个**函数引用——组件的 memo 依赖它稳定）。
const uiStubUrl = dataModule(`
  const tt = (zh, vars) =>
    vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  export function useUI() { return tt; }
`);

const shareStubUrl = dataModule(`
  let next = { ok: false, error: "not stubbed" };
  let gate = null;
  export function __setShareResponse(value) { next = value; }
  /** 把取数按住不放，用来看「加载中」那一帧；返回放行函数。 */
  export function __hold() {
    let release;
    gate = new Promise((resolve) => { release = resolve; });
    return () => { release(); gate = null; };
  }
  export async function fetchSharedReplay() {
    if (gate) await gate;
    return next;
  }
  export function normalizeSharedReplay(shareId, payload) { return payload; }
`);

const pageUrl = await compileModule("src/shell/replay/AgentReplayPage.tsx", {
  "../../i18n/ui/useUI": uiStubUrl,
  "./share-client": shareStubUrl,
});
const { AgentReplayPage } = await import(pageUrl);
const shareStub = await import(shareStubUrl);

// ---------------------------------------------------------------------------
// jsdom 台子（与 tests/my-apps-rail.test.mjs 同源）
// ---------------------------------------------------------------------------

async function installDom() {
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

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://oceanleo.com/replay/demo",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
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
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousActEnvironment === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  });

  return {
    window,
    restore() {
      for (const undo of restore.reverse()) undo();
      window.close();
    },
  };
}

async function mount(element) {
  const dom = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    window: dom.window,
    async wait(ms) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, ms));
      });
    },
    async click(node) {
      await act(async () => {
        node.dispatchEvent(
          new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }),
        );
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    },
  };
}

const rows = (container) => [...container.querySelectorAll("[data-replay-row]")];
const status = (container) =>
  container.querySelector("[data-replay-root]")?.getAttribute("data-replay-status");
const control = (container, name) =>
  container.querySelector(`[data-replay-control="${name}"]`);

function shared(messages, title = "回放标题") {
  return { share_id: "demo", title, created_at: "2026-08-20T02:00:00.000Z", messages };
}

const OVERSIZED = "长".repeat(4000);
const TABLE = [
  "日期\t收盘\t成交量",
  "2026-08-19\t185.22\t41203900",
  "2026-08-18\t182.40\t38551200",
].join("\n");

// ---------------------------------------------------------------------------

test("三种预览：缺失画「无预览」，超长截断并标注，含表格画成真表格", async () => {
  const view = await mount(
    React.createElement(AgentReplayPage, {
      autoPlay: false,
      replay: shared([
        {
          id: 1,
          role: "assistant",
          kind: "step",
          content: "老任务的步骤，没有预览字段",
          meta: { tool: "web_search" },
          created_at: "2026-08-20T02:00:01.000Z",
        },
        {
          id: 2,
          role: "assistant",
          kind: "step",
          content: "超长结果",
          meta: { tool: "run_python", result_preview: OVERSIZED },
          created_at: "2026-08-20T02:00:02.000Z",
        },
        {
          id: 3,
          role: "assistant",
          kind: "step",
          content: "行情表",
          meta: {
            tool: "read_url",
            args_preview: '{"url":"https://finance.yahoo.com/quote/NVDA"}',
            result_preview: TABLE,
          },
          created_at: "2026-08-20T02:00:03.000Z",
        },
      ]),
    }),
  );
  try {
    // autoPlay=false 一进来就是铺完的完成态。
    assert.equal(status(view.container), "completed");
    assert.equal(rows(view.container).length, 3);
    assert.equal(view.container.querySelector("[data-replay-title]").textContent, "回放标题");

    // 每张行卡片都是「动作 | 对象」，动作名是人话不是原始工具名。
    const actions = [...view.container.querySelectorAll("[data-replay-action]")].map(
      (node) => node.textContent,
    );
    assert.deepEqual(actions, ["搜索", "运行代码", "读网页"]);
    assert.equal(
      view.container.querySelectorAll("[data-replay-target]")[2].textContent,
      "https://finance.yahoo.com/quote/NVDA",
    );

    // 展开三张卡片。
    for (const toggle of view.container.querySelectorAll("[data-replay-card-toggle]")) {
      await view.click(toggle);
    }
    const details = [...view.container.querySelectorAll("[data-replay-card-detail]")];
    assert.equal(details.length, 3);

    // ① 缺失：两块预览都是「无预览」，没有抛错、没有空白。
    assert.equal(details[0].querySelectorAll("[data-replay-empty]").length, 2);
    assert.match(details[0].textContent, /无预览/);

    // ② 超长：截到 2048 字符并明说被截过。
    const oversized = details[1].querySelector("pre");
    assert.equal(oversized.textContent.length, 2048);
    assert.ok(details[1].querySelector("[data-replay-truncated]"));

    // ③ 含表格：真的是 <table>，第一行当表头。
    const table = details[2].querySelector("[data-replay-table]");
    assert.ok(table, "结果预览像表格时必须画成真表格");
    assert.deepEqual(
      [...table.querySelectorAll("thead th")].map((cell) => cell.textContent),
      ["日期", "收盘", "成交量"],
    );
    assert.equal(table.querySelectorAll("tbody tr").length, 2);
    assert.equal(
      table.querySelector("tbody tr td").textContent,
      "2026-08-19",
    );
    // 表格那条的入参是 JSON 文本，走等宽文本而不是被误判成表格。
    assert.equal(
      details[2].querySelectorAll('[data-replay-preview="text"]').length,
      1,
    );
  } finally {
    await view.unmount();
  }
});

test("播放 → 跳过 → 重播：真 DOM 上一条条出现、一次铺完、能从头再来", async () => {
  const messages = [1, 2, 3].map((id) => ({
    id,
    role: "assistant",
    kind: "step",
    content: "短",
    meta: { tool: "web_search" },
    created_at: `2026-08-20T02:00:0${id}.000Z`,
  }));
  const view = await mount(
    React.createElement(AgentReplayPage, { replay: shared(messages) }),
  );
  try {
    // 开播那一刻还什么都没有，底部是「正在播放」+ 结果按钮。
    assert.equal(rows(view.container).length, 0);
    assert.equal(status(view.container), "playing");
    assert.match(
      view.container.querySelector("[data-replay-statusbar]").textContent,
      /OceanLeo Agent/,
    );
    assert.ok(control(view.container, "result"));
    assert.equal(control(view.container, "replay"), null);

    // 每条 ~300ms（内容只有一个字），逐条出现而不是一次铺完。
    await view.wait(420);
    assert.equal(rows(view.container).length, 1);
    await view.wait(420);
    assert.equal(rows(view.container).length, 2);
    assert.equal(status(view.container), "playing");

    // 跳过：一次铺完，底部换成「播放完毕」+ 重播。
    await view.click(control(view.container, "skip"));
    assert.equal(rows(view.container).length, 3);
    assert.equal(status(view.container), "completed");
    assert.ok(control(view.container, "replay"));
    assert.equal(control(view.container, "skip"), null);

    // 跳过之后再等一会儿：在途定时器不许把第四条补出来，也不许把状态掰回播放中。
    await view.wait(500);
    assert.equal(rows(view.container).length, 3);
    assert.equal(status(view.container), "completed");

    // 重播：回到第 0 条，重新播。
    await view.click(control(view.container, "replay"));
    assert.equal(rows(view.container).length, 0);
    assert.equal(status(view.container), "playing");
    await view.wait(420);
    assert.equal(rows(view.container).length, 1);
  } finally {
    await view.unmount();
  }
});

test("播放中点正文任意处 = 跳过；点展开按钮只展开，不顺带跳过", async () => {
  const messages = [1, 2, 3, 4].map((id) => ({
    id,
    role: "assistant",
    kind: "step",
    content: "短",
    meta: { tool: "web_search" },
    created_at: `2026-08-20T02:00:0${id}.000Z`,
  }));
  const view = await mount(
    React.createElement(AgentReplayPage, { replay: shared(messages) }),
  );
  try {
    await view.wait(420);
    assert.equal(rows(view.container).length, 1);

    // 先确认：点行内的展开按钮不会把播放跳掉（stopPropagation）。
    await view.click(view.container.querySelector("[data-replay-card-toggle]"));
    assert.equal(status(view.container), "playing");
    assert.ok(view.container.querySelector("[data-replay-card-detail]"));

    await view.click(view.container.querySelector("[data-replay-body]"));
    assert.equal(rows(view.container).length, 4);
    assert.equal(status(view.container), "completed");
  } finally {
    await view.unmount();
  }
});

test("用户文字只进文本节点：带 <img onerror> 的消息不许长出 img", async () => {
  const payload = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  const view = await mount(
    React.createElement(AgentReplayPage, {
      autoPlay: false,
      replay: shared(
        [
          {
            id: 1,
            role: "user",
            kind: "text",
            content: payload,
            created_at: "2026-08-20T02:00:01.000Z",
          },
          {
            id: 2,
            role: "assistant",
            kind: "step",
            content: "读网页",
            meta: { tool: "read_url", result_preview: payload },
            created_at: "2026-08-20T02:00:02.000Z",
          },
        ],
        payload,
      ),
    }),
  );
  try {
    await view.click(view.container.querySelector("[data-replay-card-toggle]"));
    assert.equal(view.container.querySelector("img"), null);
    assert.equal(view.container.querySelector("script"), null);
    assert.equal(view.container.querySelector("iframe"), null);
    // 原文照样看得见——是**文字**，不是被吞掉。
    assert.equal(
      view.container.querySelector('[data-replay-text="user"]').textContent,
      payload,
    );
    assert.equal(
      view.container.querySelector("[data-replay-title]").textContent,
      payload,
    );
    assert.match(
      view.container.querySelector("[data-replay-card-detail]").textContent,
      /onerror/,
    );
  } finally {
    await view.unmount();
  }
});

test("取数：加载中给占位，失败给一句人话，都不是白屏", async () => {
  // ① 取数还没回来时是「正在打开回放…」，不是空白页。
  shareStub.__setShareResponse({ ok: true, data: shared([]) });
  const release = shareStub.__hold();
  const pending = await mount(React.createElement(AgentReplayPage, { shareId: "slow" }));
  assert.equal(
    pending.container.querySelector("[data-replay-root]").getAttribute("data-replay-root"),
    "loading",
  );
  release();
  await pending.wait(0);
  await pending.unmount();

  // ② 分享被关掉：一句人话，不是报错栈。
  shareStub.__setShareResponse({ ok: false, error: "share 404" });
  const failing = await mount(React.createElement(AgentReplayPage, { shareId: "gone" }));
  try {
    assert.equal(
      failing.container.querySelector("[data-replay-root]").getAttribute("data-replay-root"),
      "error",
    );
    assert.match(failing.container.textContent, /打不开/);
  } finally {
    await failing.unmount();
  }

  shareStub.__setShareResponse({
    ok: true,
    data: shared([
      {
        id: 1,
        role: "assistant",
        kind: "text",
        content: "答案",
        meta: { final: true },
        created_at: "2026-08-20T02:00:01.000Z",
      },
    ]),
  });
  const ok = await mount(
    React.createElement(AgentReplayPage, { shareId: "abc", autoPlay: false }),
  );
  try {
    assert.equal(status(ok.container), "completed");
    assert.equal(rows(ok.container).length, 1);
  } finally {
    await ok.unmount();
  }
});

// ---------------------------------------------------------------------------
// 静态档 `playback={false}`（`/share/<share_id>` 用的那一档，仲裁 A-1）
// ---------------------------------------------------------------------------

const SHARED_MESSAGES = [
  {
    id: 1,
    role: "user",
    kind: "text",
    content: "帮我看看 NVDA 最近三天的收盘",
    created_at: "2026-08-20T02:00:01.000Z",
  },
  {
    id: 2,
    role: "assistant",
    kind: "step",
    content: "行情表",
    meta: {
      tool: "read_url",
      args_preview: '{"url":"https://finance.yahoo.com/quote/NVDA"}',
      result_preview: TABLE,
    },
    created_at: "2026-08-20T02:00:02.000Z",
  },
  {
    id: 3,
    role: "assistant",
    kind: "text",
    content: "三天都在涨。",
    meta: { final: true },
    created_at: "2026-08-20T02:00:03.000Z",
  },
];

test("静态档：三条消息首帧就全在，没有播放条 / 重播 / 逐条动画", async () => {
  const view = await mount(
    React.createElement(AgentReplayPage, {
      playback: false,
      replay: shared(SHARED_MESSAGES, "NVDA 收盘"),
    }),
  );
  try {
    // ① 一次铺完：收到链接的人看的是那几条消息本身，不是一段动画。
    assert.equal(rows(view.container).length, 3);
    assert.equal(status(view.container), "static");
    assert.equal(
      view.container
        .querySelector("[data-replay-root]")
        .getAttribute("data-replay-mode"),
      "static",
    );

    // ② 播放这件事整体不在：没有状态栏，也没有跳过 / 结果 / 重播三个按钮。
    assert.equal(view.container.querySelector("[data-replay-statusbar]"), null);
    for (const name of ["skip", "result", "replay"]) {
      assert.equal(control(view.container, name), null, `静态档不该有 ${name} 按钮`);
    }
    assert.equal(view.container.querySelector("[data-replay-cursor]"), null);
    // 「正在播放」「播放完毕」这两句话在静态档一句都不该出现。
    assert.doesNotMatch(view.container.textContent, /正在播放|播放完毕|重播/);
    // 头部说的是分享了几条消息，不是「共几步」。
    assert.match(view.container.textContent, /分享了 3 条消息/);

    // ③ 等过整段本来要播的时间：条数一动不动（定时器根本没挂上）。
    await view.wait(1500);
    assert.equal(rows(view.container).length, 3);
    assert.equal(view.container.querySelector("[data-replay-statusbar]"), null);

    // ④ 点正文不再有「跳过」语义，也不该把已经铺好的内容动掉。
    await view.click(view.container.querySelector("[data-replay-body]"));
    assert.equal(rows(view.container).length, 3);
    assert.equal(status(view.container), "static");

    // ⑤ 该有的照旧：卡片能展开，表格是真表格，用户文字原样可见。
    await view.click(view.container.querySelector("[data-replay-card-toggle]"));
    const detail = view.container.querySelector("[data-replay-card-detail]");
    assert.ok(detail, "静态档的行卡片照样要能展开");
    assert.deepEqual(
      [...detail.querySelectorAll("[data-replay-table] thead th")].map(
        (cell) => cell.textContent,
      ),
      ["日期", "收盘", "成交量"],
    );
    assert.equal(
      view.container.querySelector('[data-replay-text="user"]').textContent,
      "帮我看看 NVDA 最近三天的收盘",
    );
    assert.equal(view.container.querySelector("iframe"), null);
    assert.equal(view.container.querySelector("img"), null);
  } finally {
    await view.unmount();
  }
});

test("静态档取数：与回放同一个 /v1/share，失败时说的是「这个分享打不开了」", async () => {
  shareStub.__setShareResponse({ ok: true, data: shared(SHARED_MESSAGES) });
  const ok = await mount(
    React.createElement(AgentReplayPage, { shareId: "abc123", playback: false }),
  );
  try {
    assert.equal(rows(ok.container).length, 3);
    assert.equal(status(ok.container), "static");
    assert.equal(ok.container.querySelector("[data-replay-statusbar]"), null);
  } finally {
    await ok.unmount();
  }

  // 分享被关掉：一句人话，且措辞是「分享」而不是「回放」——这页不是回放页。
  shareStub.__setShareResponse({ ok: false, error: "share 404" });
  const gone = await mount(
    React.createElement(AgentReplayPage, { shareId: "gone", playback: false }),
  );
  try {
    assert.equal(
      gone.container.querySelector("[data-replay-root]").getAttribute("data-replay-root"),
      "error",
    );
    assert.match(gone.container.textContent, /这个分享打不开了/);
  } finally {
    await gone.unmount();
  }
});

test("源码级红线：回放这一面不新增 dangerouslySetInnerHTML，也没有 iframe", async () => {
  const dir = resolve("src/shell/replay");
  const files = (await readdir(dir)).filter((name) => /\.tsx?$/.test(name));
  assert.ok(files.length >= 4, "回放目录不该是空的");
  for (const name of files) {
    const source = await readFile(join(dir, name), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /dangerouslySetInnerHTML/, `${name} 不许注入 HTML`);
    assert.doesNotMatch(code, /<iframe/i, `${name} 不许出现 iframe`);
    assert.doesNotMatch(code, /innerHTML/, `${name} 不许直接写 innerHTML`);
  }
});
