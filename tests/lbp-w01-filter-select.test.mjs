// 安全矩阵：不适用（列表页 / 表单的下拉控件，无不可信注入；菜单只渲染调用方给的已翻译文字）。
//
// leobay-projects 波 W01：
//   ① CollectionFilterSelect / BayFilterSelect 按键只写当前值（参考 Slack 搜索筛选「All channels ⌄」），
//      label 改作 aria-label；两份外观一模一样；选中值保持浅灰边；defaultValue 让 "all" 也能当「未筛选」；
//   ② 菜单：选中项前有勾、读屏名是 label、盖过项目页弹窗；
//   ③ MenuSelect（表单下拉）：整条选择条 + 同一种清单 + 隐藏的原生 select 同步，键盘可用；
//   ④ 调用方的「全部」都自带名词；工作台分区的值是翻译过的名词；新词条 17 语齐全。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

// 共享 Modal 会注入带 @starting-style 的样式表并锁滚动：jsdom 解析不了前者、没实现后者，只是噪声，不是被测行为。
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/workspace",
  virtualConsole: new VirtualConsole(),
});
const { window } = dom;
window.scrollTo = () => {};
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const { createRoot } = await import("react-dom/client");

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (rel) => readFileSync(join(repo, rel), "utf8");
const h = React.createElement;
const html = (node) => renderToStaticMarkup(node);

// tt() 在测试里取恒等：断言的就是中文原文。
const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

const { CollectionFilterSelect, CollectionSearchField } = await import(
  await compileModule("src/shell/collection-chrome.tsx", { "../i18n/ui/useUI": uiStub })
);
const { BayFilterSelect } = await import(
  await compileModule("src/shell/bay/shell/BayFilterSelect.tsx", { "../../../i18n/ui/useUI": uiStub })
);
const { MenuSelect } = await import(
  await compileModule("src/shell/menu-select.tsx", { "../i18n/ui/useUI": uiStub })
);
// 项目页的弹窗就是这个共享 Modal（portal、z-[1000]、document 上听 Esc、Tab 圈在面板里）。
const { Modal } = await import(
  await compileModule("src/ui/index.tsx", { "../i18n/ui/useUI": uiStub, "react-dom": reactDomUrl })
);

// ---------------------------------------------------------------------------
// DOM 小工具
// ---------------------------------------------------------------------------

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(element) {
  const host = window.document.createElement("div");
  window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  await flush();
  return {
    host,
    rerender: async (next) => {
      await act(async () => {
        root.render(next);
      });
      await flush();
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

async function click(node) {
  assert.ok(node, "点击目标不存在");
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function key(node, name, init = {}) {
  assert.ok(node, "按键目标不存在");
  await act(async () => {
    node.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }),
    );
  });
  await flush();
}

const textNodes = (markup) => [...markup.matchAll(/>([^<>]+)</g)].map((match) => match[1]);
const classOf = (markup, attr) => {
  const tag = markup.match(new RegExp(`<button[^>]*${attr}[^>]*>`))?.[0];
  assert.ok(tag, `没有找到带 ${attr} 的按键`);
  return tag.match(/class="([^"]*)"/)[1];
};

const TYPES = [
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "audio", label: "音频" },
];

// ---------------------------------------------------------------------------
// ① 按键只写当前值
// ---------------------------------------------------------------------------

test("CollectionFilterSelect：按键上只有当前值，label 改作 aria-label，不再画两截", () => {
  const markup = html(
    h(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "",
      options: TYPES,
      onChange() {},
      allLabel: "全部类型",
    }),
  );
  assert.match(markup, /data-collection-filter="type"/);
  assert.match(markup, /aria-label="类型"/);
  assert.deepEqual(textNodes(markup), ["全部类型"], "按键里的字只有当前值");
  // aria-describedby 把读屏接到那一截可见的当前值上
  const describedBy = markup.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy);
  assert.match(markup, new RegExp(`<span id="${describedBy.replace(/[:]/g, "\\:")}"`));

  const picked = html(
    h(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "video",
      options: TYPES,
      onChange() {},
      allLabel: "全部类型",
    }),
  );
  assert.deepEqual(textNodes(picked), ["视频"]);
  assert.doesNotMatch(picked, /全部类型/);
});

test("CollectionFilterSelect：白底浅灰细边圆角矩形粗体，高度字号对齐页头搜索框，不是黑描边胶囊", () => {
  const markup = html(
    h(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "",
      options: TYPES,
      onChange() {},
      allLabel: "全部类型",
    }),
  );
  const cls = classOf(markup, "data-collection-filter=");
  for (const token of ["h-9", "rounded-xl", "font-semibold", "bg-white", "border", "border-neutral-200", "text-[13px]"]) {
    assert.ok(cls.split(/\s+/).includes(token), `按键缺 ${token}：${cls}`);
  }
  for (const token of ["rounded-full", "h-8", "border-neutral-900"]) {
    assert.ok(!cls.split(/\s+/).includes(token), `按键不该有 ${token}：${cls}`);
  }
  const search = html(h(CollectionSearchField, { value: "", onChange() {}, placeholder: "搜索" }));
  assert.match(search, /\bh-9\b/, "页头搜索框是 h-9");
  assert.match(search, /\btext-\[13px\]/, "页头搜索框是 13px");
});

test("CollectionFilterSelect：选中具体值和「全部」都保持浅灰边框", () => {
  const render = (value) =>
    html(
      h(CollectionFilterSelect, {
        label: "类型",
        name: "type",
        value,
        options: TYPES,
        onChange() {},
        allLabel: "全部类型",
      }),
    );
  const unfiltered = render("");
  const filtered = render("image");
  assert.match(classOf(unfiltered, "data-collection-filter="), /border-neutral-200/);
  assert.doesNotMatch(classOf(unfiltered, "data-collection-filter="), /border-neutral-900/);
  assert.doesNotMatch(unfiltered, /data-filtered/);
  assert.doesNotMatch(classOf(filtered, "data-collection-filter="), /border-neutral-900/);
  assert.match(classOf(filtered, "data-collection-filter="), /border-neutral-200/);
  assert.match(filtered, /data-filtered="true"/);
});

test("defaultValue：值等于它时视作未筛选；不传以 \"\" 为未筛选", () => {
  const options = [{ value: "all", label: "全部任务" }, { value: "task", label: "任务" }, { value: "chat", label: "会话" }];
  const render = (props) =>
    html(h(CollectionFilterSelect, { label: "类型", name: "kind", options, onChange() {}, ...props }));

  // 用 "all" 当全部：传 defaultValue="all" → 写「全部任务」
  const idle = render({ value: "all", defaultValue: "all" });
  assert.deepEqual(textNodes(idle), ["全部任务"]);
  assert.doesNotMatch(idle, /data-filtered/);
  assert.match(classOf(idle, "data-collection-filter="), /border-neutral-200/);
  // 选了别的 → 保留筛选状态，边框仍然浅灰
  const active = render({ value: "task", defaultValue: "all" });
  assert.deepEqual(textNodes(active), ["任务"]);
  assert.match(active, /data-filtered="true"/);
  assert.match(classOf(active, "data-collection-filter="), /border-neutral-200/);
  assert.doesNotMatch(classOf(active, "data-collection-filter="), /border-neutral-900/);
  // 不传 defaultValue：只有 "" 算未筛选，所以 "all" 这个具体选项会被当成「筛了」
  const legacy = render({ value: "all" });
  assert.match(legacy, /data-filtered="true"/);
});

test("没有 allLabel、值也不在选项里时，按键退回写 label，不留空键", () => {
  const markup = html(
    h(CollectionFilterSelect, { label: "分区", name: "section", value: "", options: TYPES, onChange() {} }),
  );
  assert.deepEqual(textNodes(markup), ["分区"]);
  assert.doesNotMatch(markup, /data-filtered/);
});

test("BayFilterSelect 与 CollectionFilterSelect：同一状态下按键 class 与内容一字不差", () => {
  const states = [
    { value: "", defaultValue: undefined },
    { value: "video", defaultValue: undefined },
    { value: "all", defaultValue: "all" },
  ];
  for (const state of states) {
    const options = state.defaultValue ? [{ value: "all", label: "全部类型" }, ...TYPES] : TYPES;
    const common = { label: "类型", value: state.value, options, onChange() {}, allLabel: state.defaultValue ? undefined : "全部类型", defaultValue: state.defaultValue };
    const collection = html(h(CollectionFilterSelect, { ...common, name: "type" }));
    const bay = html(h(BayFilterSelect, { ...common, name: "type" }));
    assert.equal(classOf(bay, "data-bay-filter="), classOf(collection, "data-collection-filter="), JSON.stringify(state));
    assert.deepEqual(textNodes(bay), textNodes(collection), JSON.stringify(state));
    assert.equal(/data-filtered/.test(bay), /data-filtered/.test(collection), JSON.stringify(state));
    assert.match(bay, /aria-label="类型"/);
  }
});

// ---------------------------------------------------------------------------
// ② 菜单
// ---------------------------------------------------------------------------

test("CollectionFilterSelect 菜单：读屏名是 label、选中项前有勾、zIndex 高过弹窗、选「全部」发出 defaultValue", async () => {
  const picked = [];
  const view = await mount(
    h(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "video",
      options: TYPES,
      onChange: (value) => picked.push(value),
      allLabel: "全部类型",
      defaultValue: "everything",
    }),
  );
  const trigger = view.host.querySelector("[data-collection-filter]");
  await click(trigger);
  const menu = window.document.querySelector("[data-collection-filter-menu='type']");
  assert.ok(menu, "点开后应该有选项单");
  assert.equal(menu.getAttribute("role"), "listbox");
  assert.equal(menu.getAttribute("aria-label"), "类型");
  assert.ok(Number(menu.style.zIndex) >= 2147483000, `菜单要盖过项目页弹窗，zIndex=${menu.style.zIndex}`);
  const rows = [...menu.querySelectorAll("[role='option']")];
  assert.deepEqual(rows.map((row) => row.textContent), ["全部类型", "图片", "视频", "音频"]);
  assert.deepEqual(rows.map((row) => row.getAttribute("aria-selected")), ["false", "false", "true", "false"]);
  assert.deepEqual(
    rows.map((row) => Boolean(row.querySelector("[data-collection-filter-check]"))),
    [false, false, true, false],
    "勾只出现在选中项前",
  );
  assert.equal(rows[0].getAttribute("data-value"), "everything", "「全部」那一行的值就是 defaultValue");
  await click(rows[0]);
  assert.deepEqual(picked, ["everything"]);
  assert.equal(window.document.querySelector("[data-collection-filter-menu='type']"), null, "选完就关");
  assert.equal(window.document.activeElement, trigger, "焦点回到按键");
  await view.unmount();
});

test("CollectionFilterSelect 键盘：↓ 打开、↓ 移动、Enter 选中、Esc 关并还焦点", async () => {
  const picked = [];
  const view = await mount(
    h(CollectionFilterSelect, {
      label: "类型",
      name: "type",
      value: "",
      options: TYPES,
      onChange: (value) => picked.push(value),
      allLabel: "全部类型",
    }),
  );
  const trigger = view.host.querySelector("[data-collection-filter]");
  trigger.focus();
  await key(trigger, "ArrowDown");
  const menu = window.document.querySelector("[data-collection-filter-menu='type']");
  assert.ok(menu, "↓ 打开选项单");
  assert.equal(window.document.activeElement, menu, "焦点进了选项单");
  assert.equal(menu.querySelector("[data-highlight='true']").textContent, "全部类型", "打开时对准当前选中项");
  await key(menu, "ArrowDown");
  assert.equal(menu.querySelector("[data-highlight='true']").textContent, "图片");
  await key(menu, "End");
  assert.equal(menu.querySelector("[data-highlight='true']").textContent, "音频");
  await key(menu, "Enter");
  assert.deepEqual(picked, ["audio"]);
  assert.equal(window.document.querySelector("[data-collection-filter-menu]"), null);

  await key(trigger, "ArrowDown");
  assert.ok(window.document.querySelector("[data-collection-filter-menu]"));
  await key(window.document.body, "Escape");
  assert.equal(window.document.querySelector("[data-collection-filter-menu]"), null, "Esc 关菜单");
  assert.equal(window.document.activeElement, trigger);
  await view.unmount();
});

test("BayFilterSelect 菜单：选中项前有勾、点不动的项不能选且键盘跳过、hint 作 title", async () => {
  const picked = [];
  const options = [
    { value: "a", label: "甲" },
    { value: "b", label: "乙", disabled: true, hint: "此类型没有实时开源上游。" },
    { value: "c", label: "丙" },
  ];
  const view = await mount(
    h(BayFilterSelect, {
      label: "来源",
      name: "origin",
      value: "a",
      options,
      onChange: (value) => picked.push(value),
      allLabel: "全部来源",
    }),
  );
  const trigger = view.host.querySelector("[data-bay-filter='origin']");
  assert.ok(trigger);
  assert.equal(trigger.getAttribute("aria-label"), "来源");
  await click(trigger);
  const menu = window.document.querySelector("[data-bay-filter-menu='origin']");
  assert.ok(menu);
  assert.equal(menu.getAttribute("aria-label"), "来源");
  const rows = [...menu.querySelectorAll("[role='option']")];
  assert.deepEqual(rows.map((row) => row.textContent), ["全部来源", "甲", "乙", "丙"]);
  assert.deepEqual(rows.map((row) => Boolean(row.querySelector("[data-collection-filter-check]"))), [false, true, false, false]);
  assert.equal(rows[2].getAttribute("title"), "此类型没有实时开源上游。");
  assert.equal(rows[2].getAttribute("aria-disabled"), "true");
  await click(rows[2]);
  assert.deepEqual(picked, [], "点不动的项不发 onChange");
  // 高亮从「甲」往下走，要跳过「乙」直接到「丙」
  await key(menu, "ArrowDown");
  assert.equal(menu.querySelector("[data-highlight='true']").textContent, "丙");
  await key(menu, "Enter");
  assert.deepEqual(picked, ["c"]);
  await view.unmount();
});

test("筛选菜单开在弹窗里：Esc 只关菜单，不会连带关掉外层弹窗（Modal 在 document 上听 Esc）", async () => {
  for (const [Component, trigger, menu] of [
    [CollectionFilterSelect, "[data-collection-filter]", "[data-collection-filter-menu]"],
    [BayFilterSelect, "[data-bay-filter]", "[data-bay-filter-menu]"],
  ]) {
    const outer = [];
    const spy = (event) => outer.push(event.key);
    window.document.addEventListener("keydown", spy);
    const view = await mount(
      h(Component, { label: "类型", name: "type", value: "", options: TYPES, onChange() {}, allLabel: "全部类型" }),
    );
    const button = view.host.querySelector(trigger);
    await click(button);
    const open = window.document.querySelector(menu);
    assert.ok(open, `${trigger} 点开后应有菜单`);
    await key(open, "Escape");
    assert.equal(window.document.querySelector(menu), null, "Esc 关菜单");
    assert.deepEqual(outer, [], "Esc 被菜单拦下，外层弹窗的 document 监听收不到");
    assert.equal(window.document.activeElement, button);
    // 菜单没开着的时候 Esc 照常交给外层
    await key(button, "Escape");
    assert.deepEqual(outer, ["Escape"]);
    window.document.removeEventListener("keydown", spy);
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// ③ MenuSelect
// ---------------------------------------------------------------------------

const STATUS = [
  { value: "todo", label: "待办" },
  { value: "doing", label: "进行中", description: "正在做" },
  { value: "done", label: "已完成" },
];

function MenuHarness({ initial = "doing", calls, ...rest }) {
  const [value, setValue] = React.useState(initial);
  return h(MenuSelect, {
    value,
    options: STATUS,
    ariaLabel: "状态",
    name: "status",
    onChange: (next) => {
      calls.push(next);
      setValue(next);
    },
    ...rest,
  });
}

test("MenuSelect 外观：整条选择条 h-10 圆角 xl 浅灰边白底，左边当前值右边箭头", () => {
  const markup = html(h(MenuSelect, { value: "doing", options: STATUS, onChange() {}, ariaLabel: "状态", name: "status" }));
  const cls = classOf(markup, "data-menu-select-trigger=");
  for (const token of ["flex", "w-full", "h-10", "rounded-xl", "border", "border-neutral-200", "bg-white", "justify-between", "text-[13px]"]) {
    assert.ok(cls.split(/\s+/).includes(token), `选择条缺 ${token}：${cls}`);
  }
  assert.match(markup, /data-collection-filter-chevron="down"/, "右侧下箭头");
  assert.match(markup, /aria-label="状态"/);
  const triggerHtml = markup.match(/<button[^>]*data-menu-select-trigger[^>]*>(.*?)<\/button>/)[1];
  assert.deepEqual(textNodes(`>${triggerHtml}<`), ["进行中"], "左侧只写当前值");
  assert.ok(triggerHtml.indexOf("进行中") < triggerHtml.indexOf("data-collection-filter-chevron"), "值在左、箭头在右");

  const small = html(h(MenuSelect, { value: "doing", options: STATUS, onChange() {}, ariaLabel: "状态", size: "sm", className: "w-40" }));
  assert.ok(classOf(small, "data-menu-select-trigger=").split(/\s+/).includes("h-8"));
  assert.match(small, /<div class="relative min-w-0 w-40"/, "className 落在最外层，自带宽度就不再叠 w-full");
});

test("MenuSelect 的隐藏原生 select：aria-hidden、不进 Tab 顺序、选项与值同步", async () => {
  const calls = [];
  const view = await mount(h(MenuHarness, { calls }));
  const select = view.host.querySelector("select[data-menu-select='status']");
  assert.ok(select, "底下要有原生 select");
  assert.equal(select.getAttribute("aria-hidden"), "true");
  assert.equal(select.tabIndex, -1);
  assert.match(select.className, /\bopacity-0\b/);
  assert.match(select.className, /\bpointer-events-none\b/);
  assert.deepEqual([...select.options].map((option) => option.value), ["todo", "doing", "done"]);
  assert.equal(select.value, "doing");

  // 在原生 select 上改值 → onChange → 可见的选择条跟着变
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  await act(async () => {
    setter.call(select, "done");
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush();
  assert.deepEqual(calls, ["done"]);
  assert.equal(select.value, "done");
  assert.equal(view.host.querySelector("[data-menu-select-trigger]").textContent, "已完成");

  // 反过来：在可见的清单里选 → 原生 select 的值同步
  await click(view.host.querySelector("[data-menu-select-trigger]"));
  const todo = window.document.querySelector("[data-menu-select-menu] [data-value='todo']");
  await click(todo);
  assert.deepEqual(calls, ["done", "todo"]);
  assert.equal(select.value, "todo");
  await view.unmount();
});

test("MenuSelect：值不在选项里显示 placeholder，原生 select 仍能装下这个值", async () => {
  const view = await mount(
    h(MenuSelect, { value: "", options: STATUS, onChange() {}, ariaLabel: "负责人", placeholder: "未分配", name: "owner" }),
  );
  assert.equal(view.host.querySelector("[data-menu-select-trigger]").textContent, "未分配");
  const select = view.host.querySelector("select[data-menu-select='owner']");
  assert.equal(select.value, "");
  assert.equal(view.host.querySelector("[data-menu-select-trigger] .text-neutral-500")?.textContent, "未分配", "placeholder 用灰字");
  await view.unmount();
});

test("MenuSelect 清单：与筛选菜单同一种白底圆角单、选中项前有勾、描述、读屏名、盖过弹窗", async () => {
  const calls = [];
  const view = await mount(h(MenuHarness, { calls }));
  const trigger = view.host.querySelector("[data-menu-select-trigger]");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  await click(trigger);
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  const menu = window.document.querySelector("[data-menu-select-menu='status']");
  assert.ok(menu, "清单 portal 到 body");
  assert.ok(menu.parentElement === window.document.body);
  assert.equal(menu.getAttribute("role"), "listbox");
  assert.equal(menu.getAttribute("aria-label"), "状态");
  for (const token of ["rounded-xl", "border", "border-neutral-200", "bg-white", "shadow-lg"]) {
    assert.ok(menu.className.split(/\s+/).includes(token), `清单缺 ${token}`);
  }
  assert.ok(Number(menu.style.zIndex) >= 2147483000, `清单要盖过弹窗，zIndex=${menu.style.zIndex}`);
  const rows = [...menu.querySelectorAll("[role='option']")];
  assert.deepEqual(rows.map((row) => row.getAttribute("aria-selected")), ["false", "true", "false"]);
  assert.deepEqual(rows.map((row) => Boolean(row.querySelector("[data-collection-filter-check]"))), [false, true, false]);
  assert.match(rows[1].textContent, /进行中.*正在做/, "有 description 就画在名字下面");
  await click(rows[2]);
  assert.deepEqual(calls, ["done"]);
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null, "选完就关");
  assert.equal(window.document.activeElement, trigger, "焦点回到选择条");
  await view.unmount();
});

test("MenuSelect 键盘：↓ 打开并对准当前项，↑ ↓ Home End 移动，Enter / 空格选中，Tab 关并还焦点", async () => {
  const calls = [];
  const view = await mount(h(MenuHarness, { calls, initial: "todo" }));
  const trigger = view.host.querySelector("[data-menu-select-trigger]");
  trigger.focus();
  await key(trigger, "ArrowDown");
  const menu = window.document.querySelector("[data-menu-select-menu]");
  assert.ok(menu);
  assert.equal(window.document.activeElement, menu);
  const lit = () => menu.querySelector("[data-highlight='true']").getAttribute("data-value");
  assert.equal(lit(), "todo");
  await key(menu, "ArrowDown");
  assert.equal(lit(), "doing");
  assert.equal(menu.getAttribute("aria-activedescendant"), menu.querySelector("[data-highlight='true']").id);
  await key(menu, "End");
  assert.equal(lit(), "done");
  await key(menu, "ArrowDown");
  assert.equal(lit(), "todo", "到底回到第一项");
  await key(menu, "Home");
  assert.equal(lit(), "todo");
  await key(menu, "ArrowUp");
  assert.equal(lit(), "done", "第一项再往上回到最后一项");
  await key(menu, " ");
  assert.deepEqual(calls, ["done"], "空格选中");
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null);

  await key(trigger, "ArrowUp");
  const again = window.document.querySelector("[data-menu-select-menu]");
  assert.ok(again, "↑ 也能打开");
  await key(again, "Enter");
  assert.deepEqual(calls, ["done", "done"], "Enter 选中当前高亮");

  await click(trigger);
  const third = window.document.querySelector("[data-menu-select-menu]");
  await key(third, "Tab");
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null, "Tab 关清单");
  assert.equal(window.document.activeElement, trigger, "Tab 把焦点还给选择条，浏览器接着往下一个控件走");
  await view.unmount();
});

test("MenuSelect：Esc 只关清单、不会连带关掉外层弹窗；点到外面也关", async () => {
  const calls = [];
  const outer = [];
  const spy = (event) => outer.push(event.key);
  window.document.addEventListener("keydown", spy);
  const view = await mount(h(MenuHarness, { calls }));
  const trigger = view.host.querySelector("[data-menu-select-trigger]");
  await click(trigger);
  const menu = window.document.querySelector("[data-menu-select-menu]");
  assert.ok(menu);
  await key(menu, "Escape");
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null, "Esc 关清单");
  assert.deepEqual(outer, [], "Esc 被清单拦下，外层弹窗的 keydown 监听收不到");
  assert.equal(window.document.activeElement, trigger);

  await click(trigger);
  assert.ok(window.document.querySelector("[data-menu-select-menu]"));
  await act(async () => {
    window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
  });
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null, "按在外面就关");
  assert.deepEqual(calls, [], "关清单不改值");
  window.document.removeEventListener("keydown", spy);
  await view.unmount();
});

test("MenuSelect：清单的鼠标事件到清单为止，选一个选项不会同时点中外层的行 / 遮罩", async () => {
  const outer = [];
  const calls = [];
  const view = await mount(
    h(
      "div",
      { onClick: () => outer.push("click"), onMouseDown: () => outer.push("mousedown") },
      h(MenuHarness, { calls }),
    ),
  );
  await click(view.host.querySelector("[data-menu-select-trigger]"));
  outer.length = 0;
  const done = window.document.querySelector("[data-menu-select-menu] [data-value='done']");
  await act(async () => {
    done.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  await click(done);
  assert.deepEqual(calls, ["done"], "选项照常生效");
  assert.deepEqual(outer, [], "外层的 onClick / onMouseDown 不该被清单里的点击触发");
  await view.unmount();
});

test("MenuSelect：禁用项键盘跳过、点不动；打字跳到以该字开头的项；整条 disabled 时点不开", async () => {
  const calls = [];
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta", disabled: true },
    { value: "c", label: "Bravo" },
    { value: "d", label: "Charlie" },
  ];
  const view = await mount(h(MenuSelect, { value: "a", options, onChange: (v) => calls.push(v), ariaLabel: "字母", name: "letter" }));
  const trigger = view.host.querySelector("[data-menu-select-trigger]");
  await click(trigger);
  let menu = window.document.querySelector("[data-menu-select-menu]");
  const lit = () => menu.querySelector("[data-highlight='true']").getAttribute("data-value");
  assert.equal(lit(), "a");
  await key(menu, "ArrowDown");
  assert.equal(lit(), "c", "方向键跳过禁用的 Beta");
  await key(menu, "c");
  assert.equal(lit(), "d", "打字 c → Charlie");
  await click(menu.querySelector("[data-value='b']"));
  assert.deepEqual(calls, [], "禁用项点不动");
  assert.ok(window.document.querySelector("[data-menu-select-menu]"), "点禁用项不关清单");
  await key(menu, "Escape");

  // 重新打开：打字缓冲清空。b 开头的有 Beta（禁用）和 Bravo → 落在 Bravo；再打 r，缓冲 "br" 仍是 Bravo
  await click(trigger);
  menu = window.document.querySelector("[data-menu-select-menu]");
  await key(menu, "b");
  assert.equal(lit(), "c", "打字 b → 跳过禁用的 Beta，落在 Bravo");
  await key(menu, "r");
  assert.equal(lit(), "c", "连着打 br 仍是 Bravo");
  await key(menu, "Enter");
  assert.deepEqual(calls, ["c"]);
  await view.unmount();

  const off = await mount(h(MenuSelect, { value: "a", options, onChange: (v) => calls.push(v), ariaLabel: "字母", disabled: true }));
  const offTrigger = off.host.querySelector("[data-menu-select-trigger]");
  assert.equal(offTrigger.disabled, true);
  await click(offTrigger);
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null);
  assert.equal(off.host.querySelector("select").disabled, true);
  await off.unmount();
});

test("放进真 Modal（项目页的弹窗）：菜单盖得住、能键盘选、Esc 只关菜单、Tab 把焦点还给选择条", async () => {
  const picked = { role: [], type: [] };
  function Page() {
    const [role, setRole] = React.useState("todo");
    const [type, setType] = React.useState("");
    return h(
      Modal,
      { onClose() {}, labelledBy: "w01-title" },
      h(
        "div",
        { className: "p-6" },
        h("h2", { id: "w01-title" }, "邀请"),
        h(MenuSelect, {
          name: "role",
          ariaLabel: "权限",
          value: role,
          options: STATUS,
          onChange: (next) => {
            picked.role.push(next);
            setRole(next);
          },
          className: "w-32 shrink-0",
        }),
        h(CollectionFilterSelect, {
          label: "类型",
          name: "type",
          value: type,
          options: TYPES,
          allLabel: "全部类型",
          onChange: (next) => {
            picked.type.push(next);
            setType(next);
          },
        }),
        h("button", { type: "button", "data-last": "" }, "完成"),
      ),
    );
  }
  const view = await mount(h(Page));
  const overlay = () => window.document.querySelector("[role='dialog']");
  assert.ok(overlay(), "弹窗已渲染");
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "open");

  const roleTrigger = window.document.querySelector("[data-menu-select-trigger='role']");
  assert.ok(overlay().contains(roleTrigger), "选择条在弹窗里");
  await click(roleTrigger);
  const menu = window.document.querySelector("[data-menu-select-menu='role']");
  assert.ok(menu && !overlay().contains(menu), "清单 portal 在弹窗外面");
  assert.ok(Number(menu.style.zIndex) > 1000, "清单的层级高过弹窗遮罩的 z-[1000]");
  assert.equal(window.document.activeElement, menu, "焦点进了清单（Modal 的焦点圈只在按 Tab 时才管）");

  // 键盘选择：弹窗不动
  await key(menu, "ArrowDown");
  await key(menu, "Enter");
  assert.deepEqual(picked.role, ["doing"]);
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null);
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "open", "选完弹窗还开着");
  assert.equal(window.document.activeElement, roleTrigger);

  // Esc 只关清单
  await click(roleTrigger);
  await key(window.document.querySelector("[data-menu-select-menu='role']"), "Escape");
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null);
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "open", "Esc 关了清单，没关弹窗");
  assert.equal(window.document.activeElement, roleTrigger);

  // 筛选下拉同理
  const typeTrigger = window.document.querySelector("[data-collection-filter='type']");
  await click(typeTrigger);
  const filterMenu = window.document.querySelector("[data-collection-filter-menu='type']");
  assert.ok(filterMenu && !overlay().contains(filterMenu));
  assert.ok(Number(filterMenu.style.zIndex) > 1000);
  await key(filterMenu, "Escape");
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "open", "筛选菜单的 Esc 也不关弹窗");
  await click(typeTrigger);
  await click(window.document.querySelector("[data-collection-filter-menu='type'] [data-value='audio']"));
  assert.deepEqual(picked.type, ["audio"]);
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "open");

  // Tab：清单关掉，焦点回到选择条，Modal 的焦点圈接着管（选择条不是面板里最后一个可聚焦项，不会被绕回去）
  await click(roleTrigger);
  const third = window.document.querySelector("[data-menu-select-menu='role']");
  await key(third, "Tab");
  assert.equal(window.document.querySelector("[data-menu-select-menu]"), null);
  assert.equal(window.document.activeElement, roleTrigger);

  // 没有菜单开着时，Esc 照常关弹窗
  await key(window.document.body, "Escape");
  assert.equal(overlay().getAttribute("data-leo-overlay-state"), "closed", "没有菜单时 Esc 是弹窗的");
  await view.unmount();
});

// ---------------------------------------------------------------------------
// ④ 调用方
// ---------------------------------------------------------------------------

const CALLER_FILES = [
  "src/shell/AppDirectory.tsx",
  "src/shell/AppMarket.tsx",
  "src/shell/ArtifactLibrary.tsx",
  "src/shell/MyLibrary.tsx",
  "src/shell/WorkspaceLibrary.tsx",
  "src/shell/Playground.tsx",
  "src/shell/WorkspaceMasterDetail.tsx",
  "src/shell/SiteSkillDirectory.tsx",
  "src/shell/OperatorConsole.tsx",
];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(tsx?)$/.test(name)) acc.push(full);
  }
  return acc;
}

test("全仓没有光秃秃的「全部」当 allLabel（按键上只剩「全部」）", () => {
  const offenders = [];
  for (const file of walk(join(repo, "src"))) {
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      if (/allLabel=\{tt\("全部"\)\}|allLabel="全部"|allLabel=\{"全部"\}|allLabel=\{tt\("All"\)\}/.test(line)) {
        offenders.push(`${relative(repo, file)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], "「全部」要自带名词：全部类型 / 全部站点 / 全部场景 …");
});

test("W01 边界内的调用方：allLabel 都自带名词，AppDirectory 的默认值也是名词", () => {
  const expected = {
    "src/shell/ArtifactLibrary.tsx": [/allLabel=\{tt\("全部类型"\)\}/],
    "src/shell/MyLibrary.tsx": [/allLabel=\{tt\("全部类型"\)\}/],
    "src/shell/WorkspaceLibrary.tsx": [/allLabel=\{tt\("全部类型"\)\}/],
    "src/shell/Playground.tsx": [/allLabel=\{tt\("全部类型"\)\}/],
    "src/shell/AppMarket.tsx": [/allLabel=\{tt\("全部场景"\)\}/, /allLabel=\{tt\("全部站点"\)\}/],
    "src/shell/AppDirectory.tsx": [
      /sceneAllLabel \?\? tt\("全部场景"\)/,
      /groupAllLabel \?\? tt\("全部板块"\)/,
      /allLabel=\{sceneMode \? sceneAllText : tt\("全部类型"\)\}/,
    ],
  };
  for (const [file, patterns] of Object.entries(expected)) {
    const text = source(file);
    for (const pattern of patterns) assert.match(text, pattern, `${file} 缺 ${pattern}`);
  }
  for (const file of CALLER_FILES) {
    const text = source(file);
    assert.doesNotMatch(text, /allLabel=\{tt\("全部"\)\}/, `${file} 不该再有 tt("全部") 当 allLabel`);
    assert.doesNotMatch(text, /AllLabel \?\? tt\("全部"\)/, `${file} 的默认全部也要自带名词`);
  }
  // 经 AppDirectory 的两个调用方不自己传光秃秃的「全部」：吃 AppDirectory 的默认值（名词）
  for (const file of ["src/shell/SiteSkillDirectory.tsx", "src/shell/OperatorConsole.tsx"]) {
    assert.doesNotMatch(source(file), /(scene|group)AllLabel=/, `${file} 不传 sceneAllLabel / groupAllLabel`);
  }
});

test("工作台分区的值是翻译过的名词，不再是未翻译的小写 app / agent / prompt", () => {
  const playground = source("src/shell/Playground.tsx");
  const master = source("src/shell/WorkspaceMasterDetail.tsx");
  for (const [name, text] of [["Playground", playground], ["WorkspaceMasterDetail", master]]) {
    assert.doesNotMatch(text, /label:\s*"app"/, `${name} 分区还有 label: "app"`);
    assert.doesNotMatch(text, /label:\s*"agent"/, `${name} 分区还有 label: "agent"`);
    assert.doesNotMatch(text, /label:\s*"prompt"/, `${name} 分区还有 label: "prompt"`);
    assert.match(text, /label: tt\("应用"\)/);
    assert.match(text, /label: tt\("agent"\)/);
    assert.match(text, /label: tt\("网站"\)/);
  }
  assert.match(playground, /label: tt\("提示词"\)/);
  // 默认分区不算「筛了」：Playground 随 renderSites 落在网站或应用，工作台落在应用
  assert.match(playground, /defaultValue=\{renderSites \? "site" : "app"\}/);
  assert.match(master, /defaultValue="app"/);
});

test("AppDirectory 渲染：场景 / 板块 / 类型下拉的按键都不是光秃秃的「全部」", async () => {
  const { AppDirectory } = await import(
    await compileModule("src/shell/AppDirectory.tsx", { "../i18n/ui/useUI": uiStub, "react-dom": reactDomUrl })
  );
  const items = [
    { id: "a", name: "甲应用", icon: "🅰️", scenes: ["营销"], group: "make", category: "文档" },
    { id: "b", name: "乙应用", icon: "🅱️", scenes: ["办公"], group: "edit", category: "图像" },
  ];
  const groups = [{ id: "make", label: "创作" }, { id: "edit", label: "编辑" }];
  // 每个下拉按键里的字：name → 文字
  const triggerTexts = (markup) =>
    Object.fromEntries(
      [...markup.matchAll(/<button[^>]*data-collection-filter="([^"]+)"[^>]*>(.*?)<\/button>/g)].map(([, name, inner]) => [
        name,
        textNodes(`>${inner}<`).join(""),
      ]),
    );

  const scene = html(h(AppDirectory, { items, onOpen() {}, sceneMode: true, groups }));
  assert.deepEqual(triggerTexts(scene), { group: "全部板块", category: "全部场景" });
  assert.match(scene, /aria-label="板块"/);
  assert.match(scene, /aria-label="场景"/);

  const plain = html(h(AppDirectory, { items, onOpen() {} }));
  const plainTexts = triggerTexts(plain);
  assert.equal(plainTexts.category, "全部类型");
  assert.equal(plainTexts.taxonomy, "按行业", "分类方式的下拉写当前方式");
  assert.match(plain, /aria-label="类型"/);
  // 分类方式停在默认方式上不算「筛了」
  assert.doesNotMatch(plain.match(/<button[^>]*data-collection-filter="taxonomy"[^>]*>/)[0], /data-filtered/);

  const custom = html(
    h(AppDirectory, { items, onOpen() {}, sceneMode: true, sceneAllLabel: "全部玩法", groups, groupAllLabel: "全部能力" }),
  );
  assert.deepEqual(triggerTexts(custom), { group: "全部能力", category: "全部玩法" });
});

test("AppMarket 渲染：场景、站点下拉的按键写「全部场景」「全部站点」", async () => {
  const marketStub = dataModule(`
    export function installApp(){ return Promise.resolve(); }
    export function uninstallApp(){ return Promise.resolve(); }
    export function openMarketApp(){}
    export function marketAppOpenUrl(){ return ""; }
  `);
  const capStub = dataModule("export function capabilityImageThumbUrl(){ return ''; }");
  const { AppMarket } = await import(
    await compileModule("src/shell/AppMarket.tsx", {
      "../i18n/ui/useUI": uiStub,
      "../lib/app-market": marketStub,
      "../lib/app-capability-image": capStub,
    })
  );
  const markup = html(
    h(AppMarket, {
      items: [],
      total: 0,
      scenes: [{ scene: "营销", count: 1 }],
      siteIds: ["image", "word"],
      loading: false,
      query: "",
      scene: "",
      siteId: "",
      onQueryChange() {},
      onSceneChange() {},
      onSiteChange() {},
      onInstalledChange() {},
    }),
  );
  const scene = markup.match(/<button[^>]*data-collection-filter="scene"[^>]*>(.*?)<\/button>/)[1];
  const site = markup.match(/<button[^>]*data-collection-filter="site"[^>]*>(.*?)<\/button>/)[1];
  assert.equal(textNodes(`>${scene}<`).join(""), "全部场景");
  assert.equal(textNodes(`>${site}<`).join(""), "全部站点");
});

// ---------------------------------------------------------------------------
// ⑤ 结构与词条
// ---------------------------------------------------------------------------

test("共用件：collection-chrome 不 import bay 模块；Bay 那份引用同一份 class 与取值逻辑，不再自带一套", () => {
  const chrome = source("src/shell/collection-chrome.tsx");
  assert.doesNotMatch(chrome, /from\s+["'][^"']*\/bay\//, "collection-chrome 不许 import bay 模块");
  const bay = source("src/shell/bay/shell/BayFilterSelect.tsx");
  assert.match(bay, /collectionFilterTriggerClass/);
  assert.match(bay, /collectionFilterOptionClass/);
  assert.match(bay, /COLLECTION_FILTER_MENU_CLASS/);
  assert.match(bay, /collectionFilterState/);
  assert.doesNotMatch(bay, /const TRIGGER\s*=/, "Bay 不再自带一份触发键 class");
  assert.doesNotMatch(bay, /rounded-full/);
  assert.doesNotMatch(chrome, /const FILTER_TRIGGER/);
  // menu-select 复用同一种清单，不另画一套
  const menuSelect = source("src/shell/menu-select.tsx");
  assert.match(menuSelect, /COLLECTION_FILTER_MENU_CLASS/);
  assert.match(menuSelect, /collectionFilterOptionClass/);
});

test("焦点环预算：按键抑制了轮廓就带 focus-visible 环；清单容器不抑制轮廓（tests/focus-ring-budget 不许新增没补环的 outline-none）", () => {
  const chrome = source("src/shell/collection-chrome.tsx");
  const constant = (name) => chrome.match(new RegExp(`export const ${name} =\\s*"([^"]*)"`))[1];
  const trigger = constant("COLLECTION_FILTER_TRIGGER_CLASS");
  assert.match(trigger, /\boutline-none\b/);
  assert.match(trigger, /\bfocus-visible:ring-2\b/, "按键抑制了轮廓，就必须补键盘焦点环");
  assert.match(trigger, /\bfocus-visible:ring-inset\b/, "环画在里面，不会被横滑的筛选行剪掉");
  assert.doesNotMatch(constant("COLLECTION_FILTER_MENU_CLASS"), /outline-(none|0|hidden)/);
  const menuSelect = source("src/shell/menu-select.tsx");
  const base = menuSelect.match(/const TRIGGER_BASE =\s*"([^"]*)"/)[1];
  assert.match(base, /\bfocus-visible:ring-2\b/);
});

test("W01 分表的新词条 17 语齐全、不把汉字抄进非中日韩语种、占位符不丢", async () => {
  const { register } = await import("node:module");
  register("./ts-extension-loader.mjs", import.meta.url);
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const { LBP_W01_MESSAGES } = await import("../src/i18n/ui/messages/lbp-w01-copy.ts");
  const keys = Object.keys(LBP_W01_MESSAGES.zh);
  assert.ok(keys.length >= 8, `分表只有 ${keys.length} 条`);
  for (const key of keys) {
    assert.equal(LBP_W01_MESSAGES.zh[key], key, `中文站 key 必须等于值：${key}`);
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      const value = UI_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      if (!["zh-TW", "ja", "ko"].includes(locale)) assert.doesNotMatch(value, /[一-鿿]/, `${locale} 里出现汉字：${key} → ${value}`);
    }
  }
  const en = (key) => UI_MESSAGES.en[key];
  assert.equal(en("全部场景"), "All scenes");
  assert.equal(en("全部板块"), "All areas");
  assert.equal(en("agent"), "Agents");
  assert.equal(en("全部类型"), "All types", "全部类型是已有词条，不在本分表里重定义");
  assert.ok(!keys.includes("全部类型") && !keys.includes("应用") && !keys.includes("网站") && !keys.includes("提示词"));
  // 工作台分区用到的另外三个名词也都有 16 语译文
  for (const key of ["网站", "应用", "提示词", "分区"]) {
    for (const locale of LOCALES) if (locale !== "zh") assert.ok(UI_MESSAGES[locale][key], `${locale} 缺译文：${key}`);
  }
});
