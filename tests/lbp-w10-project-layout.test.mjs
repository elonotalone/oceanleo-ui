// W10 · 项目页布局大改（共享 UI 这一侧）。
//
// 操作员要的结果（合同第 6 条 + _COMMON §5.3）：
//   · 左列 = 任务卡片 + 输入框，输入框只在左列宽度内，不伸到右列下面；
//   · 右列整列 = 项目配置，从内容区顶一直到底，外层不是白底面板，只留一张张白卡片；
//   · 顶栏、输入框周围、筛选行都不加白底（白色只用来分隔卡片）；
//   · 窄屏：右列仍是抽屉；抽屉里再点开的弹窗拥有 Escape；
//   · 计划 / 资产放得下的大弹窗（宽约 960px、高随屏幕）。
// 渲染结果用 jsdom 量（谁包着谁），类名只用来证明「没有白底 / 没有边线」。
// 门户这一侧的卡片顺序、空态、数据读取在 oceanleo/tests/lbp-w10-project-layout.test.mjs。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const uiTranslationStub = dataModule(
  "export function useUI(){ return (value) => value; }",
);

const frameUrl = await compileModule("src/shell/project-workspace.tsx", {
  "../i18n/ui/useUI": uiTranslationStub,
  "react-dom": reactDomUrl,
});
const {
  ProjectWorkspaceFrame,
  ProjectToolbar,
  ProjectModal,
  ProjectConfigCard,
  ProjectTabNav,
} = await import(frameUrl);

const frameSource = readFileSync(join(REPO, "src/shell/project-workspace.tsx"), "utf8");

const h = React.createElement;

function render(Component, props, ...children) {
  return renderToStaticMarkup(h(Component, props, ...children));
}

/** jsdom 里挂载，窄屏（matchMedia 恒不匹配 ≥1024px）。写法与 project-workspace-primitives 一致。 */
async function withDom(run, { desktop = false } = {}) {
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
    url: "https://agent.oceanleo.com/projects/example",
  });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: desktop,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true;
    },
  });
  // jsdom does not implement scrollTo; the shared Modal calls it when it releases the scroll lock.
  window.scrollTo = () => {};

  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const renderRoot = (node) => act(async () => root.render(node));
  const find = (selector) => window.document.querySelector(selector);
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `missing click target: ${selector}`);
    return act(async () =>
      node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })),
    );
  };
  const escape = () =>
    act(async () => {
      window.document.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      // The shared Modal leaves after its exit transition (see overlay-motion).
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 200));
    });

  try {
    await run({ window, renderRoot, find, click, escape });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousCaf === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCaf;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const frameNode = (props = {}) =>
  h(
    ProjectWorkspaceFrame,
    {
      top: h("div", null, "Top"),
      config: h("div", { "data-config-content": true }, "Config"),
      bottom: h("div", { "data-composer": true }, "Composer"),
      mobileConfigLabel: "Project configuration",
      closeConfigLabel: "Close configuration",
      ...props,
    },
    h("div", { "data-tasks": true }, "Tasks"),
  );

// ---------------------------------------------------------------------------
// 输入框只在左列
// ---------------------------------------------------------------------------

test("输入框（bottom）只在左列：与主区同一列，不在右列下面", async () => {
  await withDom(
    async ({ find, renderRoot }) => {
      await renderRoot(frameNode());
      const column = find("[data-project-workspace-column]");
      const main = find("[data-project-workspace-main]");
      const bottom = find("[data-project-workspace-bottom]");
      const aside = find("[data-project-workspace-config]");
      const body = find("[data-project-workspace-body]");
      assert.ok(column && main && bottom && aside && body);

      // 同一列里，主区在上、输入框紧跟其后。
      assert.equal(main.parentElement, column);
      assert.equal(bottom.parentElement, column);
      assert.equal(main.nextElementSibling, bottom);

      // 右列是左列的兄弟，不是它的子孙；输入框不在右列里。
      assert.equal(aside.parentElement, body);
      assert.equal(column.parentElement, body);
      assert.equal(column.contains(aside), false);
      assert.equal(aside.contains(bottom), false);

      // 输入框不再挂在整页之下（外框的最后一个孩子是 body，没有通栏 footer）。
      const frame = find("[data-project-workspace-frame]");
      assert.equal(frame.lastElementChild, body);
      assert.equal(frame.querySelectorAll("footer").length, 1);

      // 两列：左 minmax(0,1fr)，右固定宽度；右列整列都在 body 这一行里。
      assert.match(body.className, /lg:grid-cols-\[minmax\(0,1fr\)_clamp\(20rem,24vw,22\.5rem\)\]/);
    },
    { desktop: true },
  );
});

test("没有配置栏时只有一列，输入框仍在主列", async () => {
  await withDom(async ({ find, renderRoot }) => {
    await renderRoot(frameNode({ config: undefined }));
    const body = find("[data-project-workspace-body]");
    assert.doesNotMatch(body.className, /lg:grid-cols/);
    assert.equal(find("[data-project-workspace-config]"), null);
    assert.equal(
      find("[data-project-workspace-bottom]").parentElement,
      find("[data-project-workspace-column]"),
    );
    assert.equal(find("[data-project-config-trigger]"), null);
  });
});

test("不传 bottom 时不渲染空的 footer", () => {
  const html = render(ProjectWorkspaceFrame, { top: "Top", config: h("i", null, "c") }, h("p", null, "x"));
  assert.doesNotMatch(html, /data-project-workspace-bottom/);
  assert.doesNotMatch(html, /<footer/);
});

// ---------------------------------------------------------------------------
// 没有白色通栏
// ---------------------------------------------------------------------------

const WHITE_OR_RULE = /bg-\[var\(--card|bg-white|border-b\b|border-t\b|shadow-/;

test("顶栏、输入框外层、桌面右列都不带白底与边线（白色只在卡片上）", () => {
  const html = render(
    ProjectWorkspaceFrame,
    {
      top: "Top",
      config: h("div", null, "Config"),
      bottom: h("div", null, "Bottom"),
    },
    h("div", null, "Main"),
  );
  const tag = (name, attr) => html.match(new RegExp(`<${name}(?=[^>]*${attr})[^>]*>`))?.[0] ?? "";
  const header = tag("header", "data-project-workspace-top");
  const footer = tag("footer", "data-project-workspace-bottom");
  const column = tag("div", "data-project-workspace-column");
  const body = tag("div", "data-project-workspace-body");
  const main = tag("main", "data-project-workspace-main");
  assert.ok(header && footer && column && body && main);

  for (const [name, openTag] of Object.entries({ header, footer, column, body, main })) {
    assert.doesNotMatch(openTag, WHITE_OR_RULE, `${name} must not paint white or draw a rule`);
  }

  // 右列：窄屏是页底色的抽屉；桌面端没有面板（透明、无边框、无阴影、无圆角）。
  const aside = tag("aside", "data-project-workspace-config");
  assert.match(aside, /bg-\[var\(--bg,#faf8f5\)\]/);
  assert.match(aside, /lg:bg-transparent/);
  assert.match(aside, /lg:border-0/);
  assert.match(aside, /lg:shadow-none/);
  assert.doesNotMatch(aside, /lg:rounded|lg:border(?![-\w])|lg:shadow-sm|bg-\[var\(--card/);
  // 右列内容自己滚，铺满到底。
  assert.match(aside, /lg:h-full/);
  assert.match(html, /data-project-workspace-config-scroll[^>]*overflow-y-auto/);
});

test("筛选行（ProjectToolbar）不带白底和边框，布局类不变", () => {
  const html = render(ProjectToolbar, {
    ariaLabel: "Plan tools",
    search: h("input", { "aria-label": "Search" }),
    controls: h("button", { type: "button" }, "Filter"),
  });
  const open = html.match(/<div[^>]*role="toolbar"[^>]*>/)[0];
  assert.doesNotMatch(open, /bg-\[var\(--card|bg-white|border|rounded|(?<![\w-])p-3/);
  assert.match(open, /flex/);
  assert.match(open, /sm:flex-row/);
  assert.match(html, /data-project-toolbar-search/);
  assert.match(html, /data-project-toolbar-controls/);
});

test("白色卡片仍然是卡片：ProjectConfigCard 保留白底、边线和阴影", () => {
  const html = render(ProjectConfigCard, { title: "动态", openAction: { label: "Open", onClick() {} } });
  const open = html.match(/<section[^>]*data-project-config-card[^>]*>/)[0];
  assert.match(open, /bg-\[var\(--card,#fff\)\]/);
  assert.match(open, /border/);
  assert.match(open, /rounded-xl/);
});

test("源码里外框不再出现整行白底：header / footer 不写 --card，也没有 border-b / border-t", () => {
  const frame = frameSource.slice(
    frameSource.indexOf("export function ProjectWorkspaceFrame"),
    frameSource.indexOf("export interface ProjectTabItem"),
  );
  // 触发窄屏抽屉的按钮是按钮，不是通栏，允许白底。
  const withoutTrigger = frame.replace(/<button[\s\S]*?data-project-config-trigger[\s\S]*?<\/button>/, "");
  for (const forbidden of [/border-b border-\[var\(--border/, /border-t border-\[var\(--border/]) {
    const header = withoutTrigger.slice(
      withoutTrigger.indexOf("<header"),
      withoutTrigger.indexOf("</header>"),
    );
    assert.doesNotMatch(header, forbidden);
  }
  const footer = withoutTrigger.slice(withoutTrigger.indexOf("<footer"), withoutTrigger.indexOf("</footer>"));
  assert.doesNotMatch(footer, /bg-\[var\(--card|border-t/);
});

// ---------------------------------------------------------------------------
// 窄屏：抽屉；抽屉里再点开的弹窗拥有 Escape
// ---------------------------------------------------------------------------

test("窄屏：右列仍收进抽屉，抽屉里是同一份内容（只渲染一次）", async () => {
  await withDom(async ({ find, click, renderRoot, window }) => {
    await renderRoot(frameNode());
    const trigger = find("[data-project-config-trigger]");
    const aside = find("[data-project-workspace-config]");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(aside.getAttribute("role"), "dialog");
    assert.equal(aside.getAttribute("aria-modal"), "true");
    assert.ok(aside.hasAttribute("inert"));
    assert.equal(window.document.querySelectorAll("[data-config-content]").length, 1);

    await click("[data-project-config-trigger]");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(aside.hasAttribute("inert"), false);
    assert.ok(aside.contains(find("[data-config-content]")));
    // 输入框不在抽屉里：抽屉盖住右列，不盖输入框所在的左列。
    assert.equal(aside.contains(find("[data-composer]")), false);
  });
});

test("抽屉里点开的弹窗拥有 Escape：一次 Esc 只关弹窗，抽屉还在；再一次才关抽屉", async () => {
  await withDom(async ({ find, click, renderRoot, escape }) => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return h(
        ProjectWorkspaceFrame,
        {
          top: "Top",
          mobileConfigLabel: "Project configuration",
          closeConfigLabel: "Close configuration",
          config: h(
            "div",
            null,
            h("button", { type: "button", "data-open-dialog": true, onClick: () => setOpen(true) }, "Open"),
            open &&
              h(
                ProjectModal,
                { title: "Activity", size: "wide", onClose: () => setOpen(false), closeLabel: "Close" },
                h("p", { "data-dialog-body": true }, "Body"),
              ),
          ),
        },
        h("div", null, "Main"),
      );
    }

    await renderRoot(h(Harness));
    const trigger = find("[data-project-config-trigger]");
    await click("[data-project-config-trigger]");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");

    await click("[data-open-dialog]");
    assert.ok(find("[data-dialog-body]"), "dialog is open");
    assert.equal(find("[data-project-modal-size]").getAttribute("data-project-modal-size"), "wide");

    await escape();
    assert.equal(find("[data-dialog-body]"), null, "first Escape closes the dialog");
    assert.equal(trigger.getAttribute("aria-expanded"), "true", "the drawer must stay open");

    await escape();
    assert.equal(trigger.getAttribute("aria-expanded"), "false", "second Escape closes the drawer");
  });
});

test("抽屉的 Escape 对任何别的 aria-modal 弹层都让位，弹层走了才收回", async () => {
  await withDom(async ({ find, click, renderRoot, window, escape }) => {
    await renderRoot(frameNode());
    const trigger = find("[data-project-config-trigger]");
    await click("[data-project-config-trigger]");

    const foreign = window.document.createElement("div");
    foreign.setAttribute("role", "dialog");
    foreign.setAttribute("aria-modal", "true");
    window.document.body.append(foreign);
    await escape();
    assert.equal(trigger.getAttribute("aria-expanded"), "true");

    foreign.remove();
    await escape();
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
  });
});

// ---------------------------------------------------------------------------
// 弹窗：默认 / 大号
// ---------------------------------------------------------------------------

test("ProjectModal 默认尺寸不变；wide 约 960px 宽、高随屏幕", async () => {
  await withDom(async ({ find, renderRoot }) => {
    await renderRoot(
      h(ProjectModal, { title: "Default", onClose() {}, closeLabel: "Close" }, h("p", null, "x")),
    );
    const inner = find("[data-project-modal-size]");
    assert.equal(inner.getAttribute("data-project-modal-size"), "default");
    const panel = inner.parentElement;
    assert.match(panel.className, /max-w-2xl/);
    assert.match(panel.className, /max-h-\[min\(44rem,calc\(100dvh-2rem\)\)\]/);
    assert.match(inner.className, /max-h-\[min\(44rem,calc\(100dvh-2rem\)\)\]/);
  });

  await withDom(async ({ find, renderRoot }) => {
    await renderRoot(
      h(ProjectModal, { title: "Wide", size: "wide", onClose() {}, closeLabel: "Close" }, h("p", null, "x")),
    );
    const inner = find("[data-project-modal-size]");
    assert.equal(inner.getAttribute("data-project-modal-size"), "wide");
    const panel = inner.parentElement;
    // 60rem = 960px 宽；高度跟视口走（视口减去遮罩的上下边距），不是写死的像素。
    assert.match(panel.className, /max-w-\[60rem\]/);
    assert.match(panel.className, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(inner.className, /h-\[min\(52rem,calc\(100dvh-2rem\)\)\]/);
    // 正文区自己滚，页头与关闭键常驻。
    assert.match(find("[data-project-modal-body]").className, /overflow-y-auto/);
    assert.ok(find("[data-project-modal-close]"));
  });
});

test("ProjectModal 里的页签自己开了对话框（待办编辑、重命名、删除确认）：Esc 不连外层一起关，也不丢草稿", async () => {
  await withDom(async ({ find, renderRoot, window, escape }) => {
    let closed = 0;
    function Harness() {
      const [nested, setNested] = React.useState(true);
      return h(
        ProjectModal,
        { title: "Plan", size: "wide", onClose: () => (closed += 1), closeLabel: "Close" },
        // What ProjectPlanTab's TodoEditor looks like from the outside.
        nested &&
          h(
            "section",
            { role: "dialog", "aria-modal": "true", "data-nested": true },
            h("input", { "aria-label": "title", defaultValue: "未保存的草稿", "data-draft": true }),
            h("button", { type: "button", "data-nested-cancel": true, onClick: () => setNested(false) }, "Cancel"),
          ),
      );
    }
    await renderRoot(h(Harness));
    assert.ok(find("[data-nested]"));

    await escape();
    assert.equal(closed, 0, "Escape with a nested dialog open must not close the outer dialog");
    assert.ok(find("[data-draft]"), "the draft in the nested dialog survives");
    assert.equal(find("[data-draft]").value, "未保存的草稿");

    // The nested dialog goes away (cancel/save); now Escape belongs to the outer one again.
    await act(async () =>
      find("[data-nested-cancel]").dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
    assert.equal(find("[data-nested]"), null);
    await escape();
    assert.equal(closed, 1);
  });
});

test("嵌套对话框自己处理 Esc（React onKeyDown）时，照样收得到", async () => {
  await withDom(async ({ find, renderRoot, window, escape }) => {
    let nestedSawEscape = 0;
    let closed = 0;
    await renderRoot(
      h(
        ProjectModal,
        { title: "Plan", onClose: () => (closed += 1), closeLabel: "Close" },
        h(
          "section",
          {
            role: "dialog",
            "aria-modal": "true",
            onKeyDown: (event) => {
              if (event.key === "Escape") nestedSawEscape += 1;
            },
          },
          h("input", { "aria-label": "title", "data-field": true }),
        ),
      ),
    );
    const field = find("[data-field]");
    field.focus();
    await act(async () => {
      field.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 200));
    });
    assert.equal(nestedSawEscape, 1, "React handlers run before the document-level guard");
    assert.equal(closed, 0, "and the outer dialog stays open");
  });
});

test("ProjectModal：点关闭键走 onClose（计划 / 资产弹窗的出口）", async () => {
  await withDom(async ({ find, renderRoot, click, window }) => {
    let closed = 0;
    await renderRoot(
      h(ProjectModal, { title: "Plan", size: "wide", onClose: () => (closed += 1), closeLabel: "Close" }, h("p", null, "x")),
    );
    await act(async () => {
      find("[data-project-modal-close]").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 200));
    });
    assert.equal(closed, 1);
  });
});

// ---------------------------------------------------------------------------
// I-5：ProjectTabNav 导出名与 props 不变（W04 在用）
// ---------------------------------------------------------------------------

test("ProjectTabNav 仍在，props 不变（I-5）", () => {
  assert.equal(typeof ProjectTabNav, "function");
  const html = render(ProjectTabNav, {
    ariaLabel: "Sections",
    tabs: [
      { id: "a", label: "A", panelId: "pa" },
      { id: "b", label: "B", disabled: true },
    ],
    activeId: "a",
    onChange() {},
    className: "x",
    tabClassName: "y",
  });
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-project-tab="a"/);
  assert.match(frameSource, /export interface ProjectTabNavProps<Value extends string = string> \{\s*tabs: readonly ProjectTabItem<Value>\[\];\s*activeId: Value;\s*onChange: \(id: Value\) => void;\s*ariaLabel\?: string;\s*className\?: string;\s*tabClassName\?: string;\s*\}/);
});

test("没有给公共 API 添名字：新增的尺寸类型不导出，index.ts 不用动", () => {
  assert.doesNotMatch(frameSource, /export type ProjectModalSize/);
  const index = readFileSync(join(REPO, "src/shell/index.ts"), "utf8");
  assert.doesNotMatch(index, /ProjectModalSize/);
});

// ---------------------------------------------------------------------------
// 词条：lbp-w10-copy.ts
// ---------------------------------------------------------------------------

const { LOCALES } = await import("../src/i18n/config.ts");
const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
const { LBP_W10_MESSAGES } = await import("../src/i18n/ui/messages/lbp-w10-copy.ts");

const CJK_LOCALES = new Set(["zh", "zh-TW", "ja", "ko"]);
const HAN = /[一-鿿]/;
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

test("lbp-w10 分表：17 语种键集一致，zh 键即值，占位符不丢，非中日韩不夹汉字", () => {
  const zh = LBP_W10_MESSAGES.zh;
  const keys = Object.keys(zh);
  assert.ok(keys.length >= 100, `expected the full project-page copy, got ${keys.length}`);
  for (const key of keys) assert.equal(zh[key], key, `zh must map ${key} to itself`);
  for (const locale of LOCALES) {
    const table = LBP_W10_MESSAGES[locale];
    assert.deepEqual(Object.keys(table).sort(), [...keys].sort(), `${locale} key set`);
    if (locale === "zh") continue;
    for (const key of keys) {
      const value = table[key];
      assert.ok(typeof value === "string" && value.trim() !== "", `${locale}: ${key}`);
      assert.deepEqual(placeholders(value), placeholders(key), `${locale}: placeholders of ${key}`);
      if (!CJK_LOCALES.has(locale)) assert.doesNotMatch(value, HAN, `${locale} must not contain Han: ${key}`);
      if (locale === "ko") assert.doesNotMatch(value, HAN, `ko must not contain Han: ${key}`);
      // Traditional Chinese shares many words with the source; Japanese may share short ones.
      if (locale !== "zh-TW" && (key.length > 6 || !["ja"].includes(locale))) {
        assert.notEqual(value, key, `${locale} must translate ${key}`);
      }
    }
  }
});

test("lbp-w10 分表只登记新词：不改写词典里已有的英文", async () => {
  const { default: baseEnglish } = await import("../src/i18n/ui/messages/en.ts");
  for (const [key, value] of Object.entries(LBP_W10_MESSAGES.en)) {
    if (Object.prototype.hasOwnProperty.call(baseEnglish, key)) {
      assert.equal(value, baseEnglish[key], `${key} is already in the base dictionary: do not redefine it`);
    }
  }
  // 合并进总词典后每个键 16 语都能查到。
  for (const locale of LOCALES) {
    if (locale === "zh") continue;
    for (const key of Object.keys(LBP_W10_MESSAGES.zh)) {
      assert.ok(UI_MESSAGES[locale][key], `${locale} missing ${key} in the merged dictionary`);
    }
  }
});

// ---------------------------------------------------------------------------
// 门户 W10 文件里每一句 tt() / 动态词表，16 语都查得到
// ---------------------------------------------------------------------------

const PORTAL = resolve(REPO, "..", "oceanleo");
const PORTAL_FILES = [
  "components/project/ProjectWorkspace.tsx",
  "components/project/ProjectFeedTab.tsx",
  "components/ProjectConfigEditor.tsx",
  "components/project/ProjectSideActivityCard.tsx",
  "components/project/ProjectSideActivityText.ts",
  "components/project/ProjectSidePlanCard.tsx",
  "components/project/ProjectSideAssetsCard.tsx",
  "components/project/ProjectSideCards.tsx",
  "components/project/ProjectSidePreview.ts",
];
// 字面量表：它们的值在渲染时 `tt(table[x])`，调用处看不到字面量。
const DYNAMIC_TABLES = new Set([
  "FEED_SCOPES",
  "KIND_LABELS",
  "WORK_STATUS",
  "TODO_STATUS",
  "INVITE_STATUS",
  "MEMBER_ROLE",
  "BACKEND_FALLBACK_TITLES",
  "TODO_STATUS_LABELS",
]);
const HAN_TEXT = /[一-鿿]/;

function lookupKeyOf(zh) {
  const canonical = zh.replaceAll("文件库", "我的库").replaceAll("檔案庫", "我的库");
  return /灵感|靈感/.test(canonical)
    ? canonical.replaceAll("灵感", "模板").replaceAll("靈感", "模板")
    : canonical;
}

function collectKeys(file) {
  const text = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Set();
  const literals = (node) => {
    if (ts.isParenthesizedExpression(node)) return literals(node.expression);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isConditionalExpression(node)) return [...literals(node.whenTrue), ...literals(node.whenFalse)];
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)
    ) {
      return [...literals(node.left), ...literals(node.right)];
    }
    return [];
  };
  const stringValues = (node) => {
    const found = [];
    const walk = (child) => {
      if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child)) found.push(child.text);
      ts.forEachChild(child, walk);
    };
    walk(node);
    return found;
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tt" && node.arguments.length) {
      for (const value of literals(node.arguments[0])) if (HAN_TEXT.test(value)) keys.add(value);
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      DYNAMIC_TABLES.has(node.name.text) &&
      node.initializer
    ) {
      for (const value of stringValues(node.initializer)) if (HAN_TEXT.test(value)) keys.add(value);
    }
    // 活动句子模板：{ pattern, key: "…", vars }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "key" && ts.isStringLiteral(node.initializer)) {
      if (HAN_TEXT.test(node.initializer.text)) keys.add(node.initializer.text);
    }
    // addAction("指令", …) 把卡片名作变量交给 tt()
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "addAction" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      keys.add(node.arguments[0].text);
    }
    // 指令模板的名字
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === "label" && ts.isStringLiteral(node.initializer)) {
      if (HAN_TEXT.test(node.initializer.text) && /PROJECT_TEMPLATES|产品|内容|数据|增长/.test(text)) keys.add(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return keys;
}

test("门户 W10 文件里的每一句中文原文，16 个语种都有译文", { skip: !existsSync(PORTAL) && "portal checkout not next to oceanleo-ui" }, () => {
  const all = new Map();
  for (const relative of PORTAL_FILES) {
    const file = join(PORTAL, relative);
    assert.ok(existsSync(file), `${relative} exists`);
    for (const key of collectKeys(file)) {
      if (!all.has(key)) all.set(key, []);
      all.get(key).push(relative);
    }
  }
  assert.ok(all.size >= 100, `expected to collect the page's strings, got ${all.size}`);
  const gaps = [];
  for (const [key, files] of all) {
    const lookup = lookupKeyOf(key);
    const missing = LOCALES.filter((locale) => locale !== "zh" && !UI_MESSAGES[locale][lookup]);
    if (missing.length) gaps.push(`${key} → 缺 ${missing.join(",")}（${files[0]}）`);
  }
  assert.deepEqual(gaps, [], `W10 页面文案缺译文:\n${gaps.join("\n")}`);
});
