// skills-overhaul W15（2026-10-24）：输入框 `/` 调用技能。
// 覆盖：触发条件、过滤、替换、IME、键盘、空状态链接、Tiptap 适配、未开启时零行为变化
// （LeoComposer 源码断言 + 真渲染 LeoComposer 不出浮层 / 不请求）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  url: "https://oceanleo.com/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
class NoopResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}
globalThis.ResizeObserver = NoopResizeObserver;
window.ResizeObserver = NoopResizeObserver;

const reactUrl = pathToFileURL(require.resolve("react")).href;
const SRC = new URL("../src/shell/", import.meta.url);
const composerSource = readFileSync(new URL("LeoComposer.tsx", SRC), "utf8");
const slashSource = readFileSync(new URL("composer-skill-slash.tsx", SRC), "utf8");

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);
const settingsStub = dataModule(`
  export function openSettingsModal(tab){ (globalThis.__W15_SETTINGS__ ||= []).push(tab); }
  export function navigateSettingsOrHref(){}
`);
// W09B 的数据 hook / 列表用替身：数据来自 globalThis，列表按 W09B 同一个过滤函数渲染行，
// 与真件一样经 onItemsChange 报可见列表、onMouseDown 选中。
const managerStub = dataModule(`
  import { createElement, useEffect } from "${reactUrl}";
  import { filterPickerSkills } from "${pathToFileURL(new URL("../src/shell/skills/manager/logic.ts", import.meta.url).pathname).href}";
  export function useAvailableSkills(projectId){
    const g = globalThis.__W15_SKILLS__ || { skills: [], loading: false };
    (globalThis.__W15_SKILL_CALLS__ ||= []).push(projectId ?? null);
    return g;
  }
  export function SkillPickerList(props){
    const g = globalThis.__W15_SKILLS__ || { skills: [] };
    const rows = filterPickerSkills(g.skills, props.query);
    const sig = rows.map((r) => r.name).join(",");
    useEffect(() => { props.onItemsChange?.(rows); }, [sig]);
    if (!rows.length) return createElement("div", { "data-stub-picker": "" }, "没有匹配的技能");
    return createElement("ul", { role: "listbox", "data-stub-picker": "" },
      rows.map((s, i) => createElement("li", {
        key: s.name, "data-skill": s.name, "data-active": String(i === props.activeIndex),
        onMouseDown: (e) => { e.preventDefault(); props.onPick(s.name); },
      }, "/" + s.name)));
  }
`);

const slash = await import(
  await compileModule("src/shell/composer-skill-slash.tsx", {
    "../i18n/ui/useUI": uiStub,
    "../pages/settings/settings-tabs": settingsStub,
    "./skills/manager": managerStub,
  })
);
const {
  detectSlashToken,
  isFreshSlash,
  applySkillPick,
  slashKeyAction,
  resolveSkillSlashOption,
  composerSlashAdapter,
  useComposerSkillSlash,
  SKILL_SLASH_SETTINGS_HREF,
} = slash;

const SKILLS = [
  { name: "xhs-note-studio", title: "小红书笔记工坊", description: "Write Xiaohongshu notes", scope: "personal" },
  { name: "deck-forge", title: "Deck Forge", description: "Build slide decks", scope: "project" },
  { name: "market-xray", title: "Market X-Ray", description: "Market sizing", scope: "personal" },
  { name: "note-cleaner", title: "Note Cleaner", description: "Tidy notes", scope: "personal" },
];

// ── 纯函数 ──────────────────────────────────────────────────────────────────

test("触发条件：行首或空白后的 / 才算，片段只认技能名字符", () => {
  assert.deepEqual(detectSlashToken("/"), { start: 0, end: 1, query: "" });
  assert.deepEqual(detectSlashToken("帮我 /xhs"), { start: 3, end: 7, query: "xhs" });
  assert.deepEqual(detectSlashToken("第一行\n/de"), { start: 4, end: 7, query: "de" });
  assert.deepEqual(detectSlashToken("全角空格　/"), { start: 5, end: 6, query: "" });
  assert.equal(detectSlashToken("a/b"), null, "词中间的 / 不触发");
  assert.equal(detectSlashToken("https://x.com/"), null, "URL 不触发");
  assert.equal(detectSlashToken("/xhs note"), null, "片段后已有空格 = 结束");
  assert.equal(detectSlashToken("/中文"), null, "非技能名字符不算片段");
  assert.equal(detectSlashToken(`/${"a".repeat(65)}`), null, "超过 64 字符不算");
  assert.equal(detectSlashToken(""), null);
});

test("刚键入 /：只有值恰好多一个字符且光标紧贴 / 才弹", () => {
  assert.equal(isFreshSlash("", "/", detectSlashToken("/")), true);
  assert.equal(isFreshSlash("hi ", "hi /", detectSlashToken("hi /")), true);
  assert.equal(isFreshSlash("/a", "/", detectSlashToken("/")), false, "删回 / 不弹");
  assert.equal(isFreshSlash("", "粘贴 /", detectSlashToken("粘贴 /")), false, "粘贴不弹");
  assert.equal(isFreshSlash("/", "/x", detectSlashToken("/x")), false, "已有片段不算新开");
  assert.equal(isFreshSlash("a", "a/", detectSlashToken("a/")), false);
});

test("替换：/片段 → /name （带一个空格），前后文字不动", () => {
  assert.deepEqual(applySkillPick("/xh", { start: 0, end: 3, query: "xh" }, "xhs-note-studio"), {
    insert: "/xhs-note-studio ",
    text: "/xhs-note-studio ",
  });
  assert.equal(
    applySkillPick("请 /de 做一份", { start: 2, end: 5, query: "de" }, "deck-forge").text,
    "请 /deck-forge  做一份",
  );
  assert.equal(applySkillPick("/", { start: 0, end: 1, query: "" }, "market-xray").text, "/market-xray ");
});

test("按键：↑↓/Enter/Tab/Esc；IME 组字、修饰键、Shift+Enter 不拦；无条目时只拦 Esc", () => {
  assert.equal(slashKeyAction({ key: "ArrowDown" }, 3), "next");
  assert.equal(slashKeyAction({ key: "ArrowUp" }, 3), "prev");
  assert.equal(slashKeyAction({ key: "Enter" }, 3), "pick");
  assert.equal(slashKeyAction({ key: "Tab" }, 3), "pick");
  assert.equal(slashKeyAction({ key: "Escape" }, 3), "close");
  assert.equal(slashKeyAction({ key: "Escape" }, 0), "close");
  assert.equal(slashKeyAction({ key: "Enter", isComposing: true }, 3), null, "IME 组字时回车是上屏");
  assert.equal(slashKeyAction({ key: "ArrowDown", isComposing: true }, 3), null);
  assert.equal(slashKeyAction({ key: "Enter", shiftKey: true }, 3), null);
  assert.equal(slashKeyAction({ key: "Tab", shiftKey: true }, 3), null);
  assert.equal(slashKeyAction({ key: "Enter", metaKey: true }, 3), null);
  assert.equal(slashKeyAction({ key: "Enter" }, 0), null, "没有条目时回车照常发送");
  assert.equal(slashKeyAction({ key: "ArrowDown" }, 0), null);
  assert.equal(slashKeyAction({ key: "a" }, 3), null);
});

test("开关：不传 / false 关；true 个人；{projectId} 带项目；模板实填时一律关", () => {
  assert.deepEqual(resolveSkillSlashOption(undefined, false), { enabled: false });
  assert.deepEqual(resolveSkillSlashOption(false, false), { enabled: false });
  assert.deepEqual(resolveSkillSlashOption(true, false), { enabled: true });
  assert.deepEqual(resolveSkillSlashOption({ projectId: " p1 " }, false), { enabled: true, projectId: "p1" });
  assert.deepEqual(resolveSkillSlashOption({}, false), { enabled: true, projectId: undefined });
  assert.deepEqual(resolveSkillSlashOption(true, true), { enabled: false });
  assert.deepEqual(resolveSkillSlashOption({ projectId: "p1" }, true), { enabled: false });
});

// ── Tiptap 适配 ─────────────────────────────────────────────────────────────

function fakeTiptap({ line, caret, composing = false, start = 1, empty = true }) {
  const calls = [];
  const editor = {
    state: {
      selection: {
        empty,
        $from: {
          parentOffset: caret,
          start: () => start,
          parent: {
            textContent: line,
            textBetween: (from, to) => line.slice(from, to),
          },
        },
      },
    },
    view: { composing },
    chain() {
      const chain = {
        focus: () => chain,
        insertContentAt: (range, content) => {
          calls.push({ range, content });
          return chain;
        },
        run: () => true,
      };
      return chain;
    },
  };
  const el = window.document.createElement("div");
  el.editor = editor;
  return { el, calls };
}

test("Tiptap 适配：读当前段光标前文字与组字态；替换是一次 insertContentAt（段内偏移 + 段起点）", () => {
  const { el, calls } = fakeTiptap({ line: "第一段里 /de 后面", caret: 8, start: 11 });
  const adapter = composerSlashAdapter(() => el, () => "unused", () => assert.fail("不该走 setText"));
  const ctx = adapter.read();
  assert.equal(ctx.textBefore, "第一段里 /de");
  assert.equal(ctx.composing, false);
  const token = detectSlashToken(ctx.textBefore);
  adapter.replace(token, "deck-forge");
  assert.deepEqual(calls, [
    { range: { from: 11 + 5, to: 11 + 8 }, content: { type: "text", text: "/deck-forge " } },
  ]);

  assert.equal(composerSlashAdapter(() => fakeTiptap({ line: "/", caret: 1, composing: true }).el, () => "", () => {}).read().composing, true);
  assert.equal(composerSlashAdapter(() => fakeTiptap({ line: "/x", caret: 2, empty: false }).el, () => "", () => {}).read(), null, "有选区时不触发");
});

test("没有编辑器实例时退回纯文本：读最后一行，setText 写回整段", () => {
  let written = null;
  const adapter = composerSlashAdapter(() => null, () => "第一行\n帮我 /xh", (v) => {
    written = v;
  });
  const ctx = adapter.read();
  assert.equal(ctx.textBefore, "帮我 /xh");
  adapter.replace(detectSlashToken(ctx.textBefore), "xhs-note-studio");
  assert.equal(written, "第一行\n帮我 /xhs-note-studio ");
});

// ── hook 真渲染（替身编辑器）──────────────────────────────────────────────────

function makeHarness() {
  const model = { line: "", caret: 0, composing: false, replaced: [] };
  const adapter = {
    read: () => ({ textBefore: model.line.slice(0, model.caret), line: model.line, composing: model.composing }),
    replace: (token, name) => {
      model.replaced.push({ token, name });
      const { text } = applySkillPick(model.line, token, name);
      model.line = text;
      model.caret = token.start + name.length + 2;
    },
  };
  let api = null;
  let setValue = null;
  function Harness({ option, templateActive = false }) {
    const [value, set] = React.useState("");
    setValue = set;
    const ui = useComposerSkillSlash({ option, templateActive, value, adapter });
    api = ui;
    return React.createElement("div", { "data-host": "", style: { position: "relative" } }, ui.popover,
      React.createElement("div", { "data-editor": "" }, value));
  }
  return {
    model,
    Harness,
    get api() {
      return api;
    },
    async type(nextLine, { composing = false } = {}) {
      model.line = nextLine;
      model.caret = nextLine.length;
      model.composing = composing;
      await act(async () => setValue(nextLine));
    },
  };
}

function key(k, extra = {}) {
  const native = new window.KeyboardEvent("keydown", { key: k, ...extra });
  let prevented = false;
  return {
    key: k,
    shiftKey: Boolean(extra.shiftKey),
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    nativeEvent: { isComposing: Boolean(extra.isComposing) },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
    get prevented() {
      return prevented;
    },
    native,
  };
}

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    async rerender(next) {
      await act(async () => root.render(next));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("键入 / 弹出个人+项目技能；继续键入过滤（名字前缀在前）；↓ 再 Enter 插入 /name ；浮层关", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  globalThis.__W15_SKILL_CALLS__ = [];
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: { projectId: "proj-1" } }));
  try {
    assert.equal(m.container.querySelector("[data-composer-skill-slash]"), null, "没键入 / 之前不挂数据层");
    assert.deepEqual(globalThis.__W15_SKILL_CALLS__, [], "没键入 / 之前不请求");

    await h.type("帮我 ");
    await h.type("帮我 /");
    assert.equal(h.api.open, true);
    const layer = m.container.querySelector('[data-composer-skill-slash="open"]');
    assert.ok(layer, "浮层出现");
    assert.ok(globalThis.__W15_SKILL_CALLS__.includes("proj-1"), "按当前项目取技能");
    assert.equal(layer.querySelectorAll("[data-skill]").length, SKILLS.length);

    await h.type("帮我 /no");
    const names = [...m.container.querySelectorAll("[data-skill]")].map((b) => b.dataset.skill);
    assert.deepEqual(names, ["note-cleaner", "xhs-note-studio"], "顺序 = SkillPickerList 报上来的顺序");

    let ev = key("ArrowDown");
    let handled;
    await act(async () => {
      handled = h.api.onKeyDown(ev);
    });
    assert.equal(handled, true);
    assert.equal(ev.prevented, true);
    assert.equal(m.container.querySelector('[data-skill="xhs-note-studio"]').dataset.active, "true");

    ev = key("Enter");
    await act(async () => {
      handled = h.api.onKeyDown(ev);
    });
    assert.equal(handled, true, "回车被浮层吃掉，不会发送");
    assert.deepEqual(h.model.replaced.map((r) => r.name), ["xhs-note-studio"]);
    assert.equal(h.model.line, "帮我 /xhs-note-studio ");
    assert.equal(h.api.open, false);
  } finally {
    await m.unmount();
  }
});

test("点击条目插入；Esc 关闭后不再拦键；点外关闭", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: true }));
  try {
    await h.type("/");
    await act(async () => {
      m.container.querySelector('[data-skill="deck-forge"]').dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    });
    assert.equal(h.model.line, "/deck-forge ");
    assert.equal(h.api.open, false);

    await h.type("/deck-forge ");
    await h.type("/deck-forge /");
    assert.equal(h.api.open, true);
    const esc = key("Escape");
    let handled;
    await act(async () => {
      handled = h.api.onKeyDown(esc);
    });
    assert.equal(handled, true);
    assert.equal(h.api.open, false);
    assert.equal(h.api.onKeyDown(key("Enter")), false, "关了以后回车照常");

    await h.type("/deck-forge /m");
    assert.equal(h.api.open, false, "Esc 关掉后继续打字不重新弹（要重新键入 /）");

    await h.type("/deck-forge /m ");
    await h.type("/deck-forge /m /");
    assert.equal(h.api.open, true);
    await act(async () => {
      window.document.body.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    });
    assert.equal(h.api.open, false, "点外关");
  } finally {
    await m.unmount();
  }
});

test("片段被删掉 / 光标前不再是片段 → 自动关", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: true }));
  try {
    await h.type("/");
    assert.equal(h.api.open, true);
    await h.type("");
    assert.equal(h.api.open, false);
    await h.type("/");
    await h.type("/x y");
    assert.equal(h.api.open, false, "键入空格 = 片段结束");
  } finally {
    await m.unmount();
  }
});

test("IME 组字中不触发、不拦键", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: true }));
  try {
    await h.type("/", { composing: true });
    assert.equal(h.api.open, false, "组字中键入的 / 不弹");
    await h.type("/x");
    await h.type("/");
    assert.equal(h.api.open, false, "删回 / 不算刚键入");
    await h.type("/ ");
    await h.type("/ /");
    assert.equal(h.api.open, true);
    const enter = key("Enter", { isComposing: true });
    assert.equal(h.api.onKeyDown(enter), false, "组字时回车交给输入法上屏");
    assert.equal(enter.prevented, false);
    assert.equal(h.model.replaced.length, 0);
  } finally {
    await m.unmount();
  }
});

test("没有可用技能：显示「还没有技能 · 去添加」，链接打开设置技能页；回车照常发送", async () => {
  globalThis.__W15_SKILLS__ = { skills: [], loading: false };
  globalThis.__W15_SETTINGS__ = [];
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: true }));
  try {
    await h.type("/");
    const empty = m.container.querySelector("[data-composer-skill-slash-empty]");
    assert.ok(empty);
    assert.match(empty.textContent, /还没有技能 · 去添加/);
    const link = empty.querySelector("a");
    assert.equal(link.getAttribute("href"), SKILL_SLASH_SETTINGS_HREF);
    assert.equal(SKILL_SLASH_SETTINGS_HREF, "/settings/skills");
    let handled;
    await act(async () => {
      handled = h.api.onKeyDown(key("Enter"));
    });
    assert.equal(handled, false, "空列表时回车不被吃掉");
    await h.type("");
    await h.type("/");
    await act(async () => {
      m.container.querySelector("[data-composer-skill-slash-empty] a").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });
    assert.deepEqual(globalThis.__W15_SETTINGS__, ["skills"]);
    assert.equal(h.api.open, false);
  } finally {
    await m.unmount();
  }
});

test("过滤后没有匹配：显示「没有匹配的技能」，回车不被吃掉", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  const h = makeHarness();
  const m = await mount(React.createElement(h.Harness, { option: true }));
  try {
    await h.type("/");
    await h.type("/zzz");
    assert.match(m.container.textContent, /没有匹配的技能/);
    let handled;
    await act(async () => {
      handled = h.api.onKeyDown(key("Enter"));
    });
    assert.equal(handled, false);
  } finally {
    await m.unmount();
  }
});

test("未开启 / 模板实填：不请求、不渲染、不拦任何键", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  for (const props of [{ option: undefined }, { option: false }, { option: true, templateActive: true }]) {
    globalThis.__W15_SKILL_CALLS__ = [];
    const h = makeHarness();
    const m = await mount(React.createElement(h.Harness, props));
    try {
      await h.type("/");
      assert.equal(h.api.open, false);
      assert.equal(h.api.popover, null);
      assert.equal(m.container.querySelector("[data-composer-skill-slash]"), null);
      for (const k of ["Enter", "ArrowDown", "Tab", "Escape"]) {
        const ev = key(k);
        assert.equal(h.api.onKeyDown(ev), false);
        assert.equal(ev.prevented, false);
      }
      assert.deepEqual(globalThis.__W15_SKILL_CALLS__, []);
    } finally {
      await m.unmount();
    }
  }
});

// ── LeoComposer 源码断言：旧路径不变，只加最小接线 ─────────────────────────────

test("LeoComposer：skillSlash 是可选 prop，逻辑在 composer-skill-slash.tsx", () => {
  assert.match(composerSource, /\n  skillSlash\?: ComposerSkillSlashOption;\n/);
  assert.match(composerSource, /from "\.\/composer-skill-slash";/);
  assert.equal((composerSource.match(/skillSlash/g) || []).length >= 3, true);
  assert.match(composerSource, /option: skillSlash,\n    templateActive: effectiveHighlightTemplate != null,/);
  // handleKeyDown 只多了第一行；原来的回车发送分支逐字保留。
  assert.match(
    composerSource,
    /function handleKeyDown\(e: KeyboardEvent<HTMLElement>\) \{\n    if \(skillSlashUi\.onKeyDown\(e\)\) return;\n    if \(\n      onSubmit &&\n      e\.key === "Enter" &&\n      !e\.shiftKey &&\n      !e\.nativeEvent\.isComposing\n    \) \{\n      e\.preventDefault\(\);\n      if \(canSend\) submitPrompt\(\);\n    \}\n  \}/,
  );
  // 浮层渲染在编辑器之前（同一个 relative 卡片里），编辑器的 props 一行没变。
  assert.match(
    composerSource,
    /\{skillSlashUi\.popover\}\n      <TemplateFillArea\n        ref=\{highlightRef\}\n        value=\{value\}\n        onChange=\{onChange\}\n        template=\{effectiveHighlightTemplate\}\n        fillNonce=\{effectiveFillNonce\}\n        restoreEpoch=\{runtimeHydration\?\.snapshotRestoreEpoch\}\n        accentColor=\{accentColor\}\n        placeholder=\{placeholderText\}\n        rows=\{rows\}\n        maxHeight=\{maxHeight\}\n        disabled=\{disabled\}\n        onKeyDown=\{handleKeyDown\}\n        className="rounded-t-2xl"\n      \/>/,
  );
  assert.match(composerSource, /function cleanPromptValue\(\): string \{\n[^}]*return value\.trim\(\);\n  \}/, "提交前不改写 /name");
  assert.equal(composerSource.includes("skillSlashUi.") && composerSource.split("skillSlashUi.").length - 1, 2, "只有 onKeyDown 与 popover 两处用到");
});

test("composer-skill-slash：未开启时恒 false/null；不碰 innerHTML / dangerouslySetInnerHTML", () => {
  assert.match(slashSource, /if \(!optionEnabled\) return \{ open: false, onKeyDown: NEVER, popover: null \};/);
  assert.match(slashSource, /const NEVER = \(\) => false;/);
  assert.doesNotMatch(slashSource, /dangerouslySetInnerHTML|innerHTML\s*=|new Function|\beval\(/);
  assert.match(slashSource, /SkillPickerList/);
  assert.match(slashSource, /useAvailableSkills\(projectId\)/);
  // 所有界面文字走 tt()
  // 「没有匹配的技能」由 W09B 的 SkillPickerList 渲染。
  for (const zh of ["技能", "还没有技能", "去添加", "加载中…", "选择技能", "↑↓ 选择 · 回车插入 · Esc 关闭"]) {
    assert.ok(slashSource.includes(`tt("${zh}")`), zh);
  }
});

// ── 真渲染 LeoComposer：不传 skillSlash 时什么都不多 ─────────────────────────────

const lazyStub = dataModule(
  "const noop = () => undefined;\nexport default new Proxy(noop, { get: () => noop });\nexport const __stub = true;\n",
);
const { LeoComposer } = await import(
  await compileModule(
    "src/shell/LeoComposer.tsx",
    {
      "../i18n/ui/useUI": uiStub,
      "./composer-skill-slash": await compileModule("src/shell/composer-skill-slash.tsx", {
        "../i18n/ui/useUI": uiStub,
        "../pages/settings/settings-tabs": settingsStub,
        "./skills/manager": managerStub,
      }),
      "./usePluginsCatalog": dataModule(`
        export const PLUGINS_SETTINGS_HREF = "/settings/plugins";
        export function buildPopoverConnectors(){ return []; }
        export function usePluginsCatalog(){ return { items: [], loading: false, orgs: [], orgConnections: [] }; }
      `),
      "../lib/auth": dataModule("export async function getUserEmail(){ return null; }"),
      "../pages/AuthDialog": dataModule("export function AuthDialog(){ return null; }"),
      "./cloud-computer/ComputerDock": dataModule("export function ComputerDock(){ return null; }"),
      "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
      "./PayerSelector": dataModule("export function PayerSelector(){ return null; }"),
      "./mcp-apps": dataModule("export function ComposerAppsBar(){ return null; }"),
      "./PromptHighlightArea": dataModule(`
        import { createElement, forwardRef } from "${reactUrl}";
        export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
          return createElement("textarea", { "data-editor": "", value: props.value || "", readOnly: true, onKeyDown: props.onKeyDown });
        });
        export const TemplateFillArea = PromptHighlightArea;
      `),
    },
    { missingPackageStub: lazyStub },
  )
);

test("LeoComposer 不传 skillSlash：键入 / 不出浮层、不请求；传了才出", async () => {
  globalThis.__W15_SKILLS__ = { skills: SKILLS, loading: false };
  globalThis.__W15_SKILL_CALLS__ = [];
  const base = { onChange() {}, showPlugins: false, showComputerDock: false, showAppsBar: false, showPayerSelector: false, showModelPicker: false };
  const m = await mount(React.createElement(LeoComposer, { ...base, value: "" }));
  try {
    await m.rerender(React.createElement(LeoComposer, { ...base, value: "/" }));
    assert.equal(m.container.querySelector("[data-composer-skill-slash]"), null);
    assert.deepEqual(globalThis.__W15_SKILL_CALLS__, []);
  } finally {
    await m.unmount();
  }

  const m2 = await mount(React.createElement(LeoComposer, { ...base, value: "", skillSlash: true }));
  try {
    await m2.rerender(React.createElement(LeoComposer, { ...base, value: "/", skillSlash: true }));
    assert.ok(m2.container.querySelector('[data-composer-skill-slash="open"]'), "纯文本回退路径下也能弹");
    // 模板实填：同样键入 / 不弹
    await m2.rerender(React.createElement(LeoComposer, { ...base, value: "", skillSlash: true, highlightTemplate: "写一篇[主题]" }));
    await m2.rerender(React.createElement(LeoComposer, { ...base, value: "/", skillSlash: true, highlightTemplate: "写一篇[主题]" }));
    assert.equal(m2.container.querySelector('[data-composer-skill-slash="open"]'), null);
  } finally {
    await m2.unmount();
  }
});
