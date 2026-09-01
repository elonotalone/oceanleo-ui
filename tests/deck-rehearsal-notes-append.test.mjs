// ============================================================================
// 判据 ②③ —— 排练读数写回备注（追加，绝不覆盖）与放映入口的图标（W45，2026-09-01）
// ----------------------------------------------------------------------------
// ② 是这一份活里唯一能造成**真实损失**的地方：`DeckSlide.notes` 是用户手写的讲稿
// 备注（`deck-schema.ts:123`）。写回排练读数如果写成 `notes: line`，人家写的东西
// 当场没了，而且没有任何报错、下一次保存就落到云端——不可逆。
// 所以这一条不是形状断言，是**跑真代码**：把 `DeckRoute` 挂起来，从它交给
// `DeckPresenterView` 的那个 `onApplyRehearsalNotes` 打进去，再去引擎里把 `notes`
// 读出来逐字比对。
//
// 引擎（`use-deck-editor`）用替身，但替身只复刻它公开面上那两条语义：
//   · `selectSlide(id)` 同步改「当前页」（真身 `use-deck-editor.ts:2621`）
//   · `patchSlide(patch)` 只打当前页（真身 `:1848`，`slide.id === activeRef.current`）
// 这两条是我的接线唯一依赖的东西，所以最后一条用例把它们对着真身的源码钉住：
// 引擎哪天改了这两条语义，替身就不再代表真身，那条当场红（否则就是拿替身自证，
// `_COMMON.md §7b⑧` 说的结构性假绿）。
//
// ③ 图标那条连着「名字得真的存在」一起验：`W29` 当初将就用 `pages`，正是因为
// `fullscreen` 这批名字那会儿只在未提交的工作树里。所以判据读的是
// `git ls-tree` 意义上的**已入库**那份 `AdvancedEditorIcon.tsx`，不是工作树。
// ============================================================================

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import ts from "typescript";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// ── 替身 ────────────────────────────────────────────────────────────────────

/**
 * 引擎替身。只复刻公开面上那两条被我的接线依赖的语义，其余成员是让路由渲染得起来
 * 的最小面。deck 存在模块级，测试从 `__deck()` 读回来——断言看的是引擎里的真状态，
 * 不是我在测试里另算一遍。
 */
const engineStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};

  let deck = { title: "空", slides: [], aspect: "16:9", theme: "light", masters: [] };
  let activeId = "";
  let patchLog = [];

  export function __setDeck(next) {
    deck = next;
    activeId = next.slides[0] ? next.slides[0].id : "";
    patchLog = [];
  }
  export function __deck() { return deck; }
  export function __activeId() { return activeId; }
  export function __patchLog() { return [...patchLog]; }

  export function useDeckEditor() {
    const [, bump] = React.useState(0);
    const rerender = () => bump((value) => value + 1);
    return {
      deck,
      activeSlide: deck.slides.find((slide) => slide.id === activeId) || deck.slides[0],
      activeIndex: Math.max(0, deck.slides.findIndex((slide) => slide.id === activeId)),
      selectedElement: null,
      selectedElementId: "",
      activeMaster: { id: "m", name: "母版" },
      loading: false,
      saving: false,
      exporting: false,
      dirty: false,
      editRevision: 1,
      error: "",
      sourceFailed: false,
      notice: "",
      savedUrl: "",
      canUndo: false,
      canRedo: false,
      // 真身：activeRef.current = id（同步），所以紧接着的 patchSlide 落在这一页。
      selectSlide: (id) => { activeId = id; rerender(); },
      // 真身：slides.map(s => s.id === activeRef.current ? { ...s, ...patch } : s)
      patchSlide: (patch) => {
        patchLog.push([activeId, patch]);
        deck = {
          ...deck,
          slides: deck.slides.map((slide) =>
            slide.id === activeId ? { ...slide, ...patch } : slide,
          ),
        };
        rerender();
      },
      patchSlideTransient: () => {},
      undo: () => {}, redo: () => {}, reload: () => {},
      exportPptx: async () => {}, downloadJson: () => {},
      save: async () => null, restoreRecovery: () => false,
      importSource: async () => {}, insertImageElement: () => {},
    };
  }

  export function deckPresentationSource(editor) {
    return { deck: editor.deck, startIndex: editor.activeIndex };
  }
  export async function buildDeckPptxBlob() { return new Blob([]); }
  export function deckSavedItemForHandoff(item) { return item; }
`);

/** 外壳替身：把路由申报的 adapter 抓出来，并把 `adapter.stage` 真的渲染出去。 */
const shellStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  let seen = null;
  export function __adapter() { return seen; }
  export function AdvancedWorkbenchShell({ adapter }) {
    seen = adapter;
    return React.createElement("div", { "data-shell": "" }, adapter.stage);
  }
`);

/** 放映视图替身：只把路由交给它的 props 留下来，不做别的。 */
const presenterStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  let seen = null;
  export function __presenterProps() { return seen; }
  export function DeckPresenterView(props) {
    seen = props;
    return React.createElement("div", { "data-presenter": "" });
  }
  export async function openDeckPresenterWindow() {
    return { ok: true, dispose: () => {} };
  }
`);

const emptyPanelStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  const Panel = () => React.createElement("div", null);
  export const DeckDrawPanel = Panel;
  export const DeckLinePanel = Panel;
  export const DeckNotesPanel = Panel;
  export const DeckSignaturePanel = Panel;
  export const DeckTablePanel = Panel;
  export const DeckDesignPanel = Panel;
  export const DeckEffectsPanel = Panel;
  export const DeckElementsPanel = Panel;
  export const DeckLayersPanel = Panel;
  export const DeckTextPanel = Panel;
  export const DeckUploadPanel = Panel;
  export const DeckFontPanel = Panel;
  export const DeckContextToolbar = Panel;
  export const DeckStage = Panel;
`);

const STUBS = {
  "../doc-editors/use-deck-editor": engineStubUrl,
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../doc-editors/DeckPresenterView": presenterStubUrl,
  "../doc-editors/DeckCreationPanels": emptyPanelStubUrl,
  "../doc-editors/DeckControls": emptyPanelStubUrl,
  "../doc-editors/DeckFontPanel": emptyPanelStubUrl,
  "../doc-editors/DeckContextToolbar": emptyPanelStubUrl,
  "../doc-editors/DeckStage": emptyPanelStubUrl,
  "../doc-editors/doc-family-commands": dataModule(
    "export function buildDeckCommandSurface(){ return { commands: [] }; }",
  ),
  "../doc-editors/doc-family-download": dataModule(
    "export async function downloadConvertedCopy(){ return ''; }",
  ),
  "../doc-editors/doc-family-import": dataModule(
    "export async function importDocFamilyFile(){ return { ok: false, message: '' }; }",
  ),
  "../plugin-command": dataModule("export function usePluginCommandSurface(){}"),
  "../workbench-material-provider": dataModule(
    "export function useWorkbenchMaterialAdapter(){}",
  ),
  "../office-editor": dataModule(`
    export function useOfficeArtifactSource(item) {
      return { item, error: "", loading: false, resourceFailed: false, retry: () => {} };
    }
  `),
  "../../i18n/ui/useUI": dataModule(
    "export function useUI(){ return (value) => value; }",
  ),
  "../advanced-session": dataModule(
    "export function advancedSavedItem(item){ return item; }",
  ),
  "../advanced-recovery-store": dataModule(
    "export function advancedRecoveryKey(){ return 'k'; }",
  ),
};

const { DeckRoute } = await import(
  await compileModule("src/shell/advanced-routes/DeckRoute.tsx", STUBS)
);
const engine = await import(engineStubUrl);
const shell = await import(shellStubUrl);
const presenter = await import(presenterStubUrl);
const { deckRehearsalNoteLine } = await import(
  await compileModule("src/shell/doc-editors/use-deck-presenter.ts")
);

// ── 台子 ────────────────────────────────────────────────────────────────────

function slide(id, title, notes) {
  return { id, title, notes, elements: [], background: "", masterId: "m" };
}

function row(index, id, title, totalMs, visits, sharePercent) {
  return { index, id, title, totalMs, visits, sharePercent };
}

const ITEM = {
  id: "deck-1",
  title: "季度汇报",
  url: "",
  artifactId: "",
  meta: {},
};

async function withDom(run) {
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
    url: "https://oceanleo.com/advanced",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
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
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  try {
    await run({
      render: () =>
        act(async () => root.render(React.createElement(DeckRoute, { item: ITEM }))),
    });
  } finally {
    await act(async () => root.unmount());
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    for (const undo of restore.reverse()) undo();
    window.close();
  }
}

/** 挂路由 → 进放映 → 拿到路由交给放映视图的 `onApplyRehearsalNotes`。 */
async function mountedWriteBack(render) {
  await render();
  const action = shell
    .__adapter()
    .actions.find((entry) => entry.id === "deck-present");
  assert.ok(action, "顶栏没有 deck-present 这个 action");
  await act(async () => {
    await action.onTrigger();
  });
  const props = presenter.__presenterProps();
  assert.ok(props, "进了放映态，DeckPresenterView 却没被渲染");
  assert.equal(
    typeof props.onApplyRehearsalNotes,
    "function",
    "主窗那份 <DeckPresenterView> 没接 onApplyRehearsalNotes：" +
      "排练完每页讲了多久，关掉窗口就没了",
  );
  return props.onApplyRehearsalNotes;
}

// ── ② 追加不覆盖 ────────────────────────────────────────────────────────────

test("② 已有手写备注的页，写回排练读数之后原备注一字不少", async () => {
  const handwritten = "开场先讲这三件事：\n1. 收入\n2. 成本\n3. 下季度打算";
  engine.__setDeck({
    title: "季度汇报",
    aspect: "16:9",
    theme: "light",
    masters: [],
    slides: [
      slide("s1", "开场", handwritten),
      slide("s2", "数据", ""),
      slide("s3", "结尾", "这页要留时间提问"),
    ],
  });

  const rows = [
    row(0, "s1", "开场", 9_000, 1, 45),
    row(1, "s2", "数据", 11_000, 2, 55),
    row(2, "s3", "结尾", 0, 0, 0),
  ];
  await withDom(async ({ render }) => {
    const applyNotes = await mountedWriteBack(render);
    await act(async () => applyNotes(rows));
  });

  const slides = engine.__deck().slides;
  const byId = Object.fromEntries(slides.map((entry) => [entry.id, entry.notes]));

  // 这是本判据的核心：原文逐字还在，读数在它**后面**。
  assert.ok(
    byId.s1.startsWith(`${handwritten}\n`),
    `用户手写的备注被动了：\n实得 ${JSON.stringify(byId.s1)}`,
  );
  assert.equal(byId.s1, `${handwritten}\n${deckRehearsalNoteLine(rows[0])}`);
  assert.ok(
    byId.s1.includes("1. 收入") &&
      byId.s1.includes("2. 成本") &&
      byId.s1.includes("3. 下季度打算"),
    "手写备注里的行丢了",
  );

  // 原来是空的页：只有读数，前面不留一个空行。
  assert.equal(byId.s2, deckRehearsalNoteLine(rows[1]));

  // 一次都没讲到的页不写：给它记一行「用时 00:00」不是读数，是噪音。
  assert.equal(
    byId.s3,
    "这页要留时间提问",
    "没讲到的那一页也被写了一行，而且顶掉/污染了原备注",
  );
});

test("② 那行字取的是 deckRehearsalNoteLine 的原件，不是路由自己拼的", async () => {
  engine.__setDeck({
    title: "t",
    aspect: "16:9",
    theme: "light",
    masters: [],
    slides: [slide("s1", "一页", "")],
  });
  const only = row(0, "s1", "一页", 4_043_000, 3, 100);
  await withDom(async ({ render }) => {
    const applyNotes = await mountedWriteBack(render);
    await act(async () => applyNotes([only]));
  });
  // 1:07:23 这种时分秒格式只有原件给得出来（`formatPresenterClock`）。
  assert.equal(engine.__deck().slides[0].notes, deckRehearsalNoteLine(only));
  assert.match(engine.__deck().slides[0].notes, /1:07:23/);
});

test("② 逐页写回是 selectSlide + patchSlide 配对，且写完把选中页还给用户", async () => {
  engine.__setDeck({
    title: "t",
    aspect: "16:9",
    theme: "light",
    masters: [],
    slides: [slide("s1", "一", "甲"), slide("s2", "二", "乙"), slide("s3", "三", "丙")],
  });

  await withDom(async ({ render }) => {
    const applyNotes = await mountedWriteBack(render);
    await act(async () =>
      applyNotes([
        row(0, "s1", "一", 1_000, 1, 33),
        row(1, "s2", "二", 1_000, 1, 33),
        row(2, "s3", "三", 1_000, 1, 34),
      ]),
    );
  });

  // 每一次 patch 都落在它该落的那一页——错位就是把 A 页的读数写进 B 页的备注。
  assert.deepEqual(
    engine.__patchLog().map(([id]) => id),
    ["s1", "s2", "s3"],
  );
  assert.equal(
    engine.__activeId(),
    "s1",
    "写回之后编辑器停在最后一页：排练报表把用户的光标拖走了",
  );
  for (const entry of engine.__deck().slides) {
    assert.match(entry.notes, /^[甲乙丙]\n［排练］/, `${entry.id} 的备注形状不对`);
  }
});

// ── ③ 放映入口的图标 ────────────────────────────────────────────────────────

const SRC = new URL("../src/", import.meta.url);

function parse(relativePath, text) {
  return ts.createSourceFile(
    relativePath,
    text ?? readFileSync(new URL(relativePath, SRC), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
}

function collect(node, predicate) {
  const found = [];
  const walk = (current) => {
    if (predicate(current)) found.push(current);
    current.forEachChild(walk);
  };
  walk(node);
  return found;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isAsExpression(current) || ts.isParenthesizedExpression(current))
  ) {
    current = current.expression;
  }
  return current;
}

/** `<AdvancedWorkbenchShell adapter={{…}}>` 上那个 adapter 字面量里的 actions。 */
function presentAction() {
  const route = parse("shell/advanced-routes/DeckRoute.tsx");
  const [attribute] = collect(
    route,
    (node) =>
      ts.isJsxAttribute(node) &&
      node.name.getText() === "adapter" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      ts.isObjectLiteralExpression(unwrap(node.initializer.expression)),
  );
  assert.ok(attribute, "DeckRoute 没有 adapter={{…}}");
  const adapter = unwrap(attribute.initializer.expression);
  const actions = adapter.properties.find(
    (member) =>
      ts.isPropertyAssignment(member) && member.name.getText() === "actions",
  );
  const entries = unwrap(actions.initializer)
    .elements.map(unwrap)
    .filter((element) => ts.isObjectLiteralExpression(element));
  const present = entries.find((entry) =>
    entry.properties.some(
      (member) =>
        ts.isPropertyAssignment(member) &&
        member.name.getText() === "id" &&
        unwrap(member.initializer).text === "deck-present",
    ),
  );
  assert.ok(present, "顶栏 actions 里没有 deck-present");
  return present;
}

/** **已入库**那份图标模块认得的名字。工作树里刚加的名字不算——那正是 W29 的坑。 */
function committedIconNames() {
  const text = execFileSync(
    "git",
    ["show", "HEAD:src/shell/AdvancedEditorIcon.tsx"],
    { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" },
  );
  const source = parse("AdvancedEditorIcon.tsx", text);
  const [alias] = collect(
    source,
    (node) =>
      ts.isTypeAliasDeclaration(node) && node.name.text === "WorkbenchIconName",
  );
  assert.ok(alias, "已入库的 AdvancedEditorIcon.tsx 里没有 WorkbenchIconName");
  const names = new Set();
  for (const member of alias.type.types ?? []) {
    if (ts.isLiteralTypeNode(member) && ts.isStringLiteral(member.literal)) {
      names.add(member.literal.text);
    }
  }
  assert.ok(
    names.size > 10,
    `只解析出 ${names.size} 个图标名，正则/AST 走错了（零命中先验工具，§7b③）`,
  );
  return names;
}

test("③ 放映入口的图标不再是将就的 pages，且那个名字已经入库", () => {
  const present = presentAction();
  const icon = present.properties.find(
    (member) =>
      ts.isPropertyAssignment(member) && member.name.getText() === "icon",
  );
  assert.ok(icon, "deck-present 没有 icon");

  const iconText = icon.initializer.getText();
  const used = [...iconText.matchAll(/"([a-z-]+)"/g)].map((match) => match[1]);
  assert.ok(used.length >= 1, `读不出 icon 用了哪些名字：${iconText}`);

  assert.equal(
    used.includes("pages"),
    false,
    "放映入口还在用 pages（一摞纸）——那是 W29 当时图标没入库的将就，前提已经不成立了",
  );
  assert.ok(
    used.some((name) => name === "fullscreen" || name === "preview"),
    `放映入口的图标应当是 fullscreen / preview 这一类，实得 ${JSON.stringify(used)}`,
  );

  // 关键的一条：名字必须在**已入库**的那份图标模块里。
  // 指向一个只存在于工作树里的名字，31 个站拿到的 main 上就是个空图标。
  const known = committedIconNames();
  for (const name of used) {
    assert.ok(
      known.has(name),
      `图标名 "${name}" 在已入库的 AdvancedEditorIcon.tsx 里不存在 —— ` +
        `main 上会指向一个不存在的图标（这正是 W29 当初不敢换的原因）`,
    );
  }
});

// ── 替身与真身对拴 ──────────────────────────────────────────────────────────

// 上面②那三条跑的是真的 `DeckRoute`，但引擎是替身。替身只复刻两条语义，
// 这一条把它们对着真身钉住：引擎哪天改了「patchSlide 只打当前页」或
// 「selectSlide 同步改当前页」，我的接线就不再成立，而②会因为替身还照旧
// 而继续绿——那就是拿替身自证。所以这一条必须在。
test("替身复刻的两条引擎语义与 use-deck-editor 真身一致", () => {
  const engineSource = readFileSync(
    new URL("shell/doc-editors/use-deck-editor.ts", SRC),
    "utf8",
  );
  const source = parse("use-deck-editor.ts", engineSource);

  const [patch] = collect(
    source,
    (node) =>
      ts.isVariableDeclaration(node) && node.name.getText() === "patchSlide",
  );
  assert.ok(patch, "use-deck-editor 里找不到 patchSlide");
  assert.match(
    patch.getText(),
    /slide\.id === activeRef\.current \? \{ \.\.\.slide, \.\.\.patch \}/,
    "patchSlide 不再是「只打当前页」了：逐页写回的接线要跟着改",
  );
  assert.equal(
    /\bid\b\s*:/.test(patch.getText().split("=>")[0]),
    false,
    "patchSlide 长出了第二个参数？那就该直接按 id 打，不用再 selectSlide",
  );

  const returned = collect(
    source,
    (node) =>
      ts.isPropertyAssignment(node) && node.name.getText() === "selectSlide",
  );
  assert.equal(returned.length, 1, "selectSlide 的实现不止一处，判据要重读");
  assert.match(
    returned[0].getText(),
    /activeRef\.current = id/,
    "selectSlide 不再同步改当前页了：selectSlide + patchSlide 这对配合会写错页",
  );
});
