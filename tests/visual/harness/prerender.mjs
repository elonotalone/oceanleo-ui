// ============================================================================
// 夹具预渲染 —— 用**真组件**产出夹具页，而不是手写一份长得像的 HTML
// ----------------------------------------------------------------------------
// 手写夹具的闸守的是夹具自己，一文不值。所以这里走仓里既有的两件基础设施：
//   - `tests/helpers/module-bench.mjs` 的 `compileModule()`：把 `src/` 的 TS/TSX
//     编成可 `import()` 的模块，并**自动**解析全部相对 specifier（那份文件的抬头
//     记着「维护清单」的做法在本仓复发过四次，所以它改成了自动解析）；
//   - `react-dom/server` 的 `renderToStaticMarkup()`：拿到真组件的真 DOM。
// 两者都不引入新依赖。
//
// 隔离纪律：**每个主体单独 try/catch**。这道闸与它守的九份改动是同一波并发造的，
// 任何时刻都可能有人的文件正编辑到一半。一个主体炸掉只能变成九分之一条红，
// 绝不允许让整套闸哑火。
// ============================================================================

import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  SUBJECTS,
  missingSubjectMessage,
  needsClientMessage,
} from "./subjects.mjs";
import { escapeHtml, renderPage } from "./page-template.mjs";

const require = createRequire(import.meta.url);

let domReady = false;

/**
 * 装 jsdom 全局。`src/shell` 下大量组件带 `use client` 且在模块作用域摸 `window`，
 * 纯 SSR 会当场炸。jsdom 从 fabric 的 node_modules 借——这是本仓既有测试的做法
 * （见 `tests/anchored-popover.test.mjs` 开头），不是我新引的依赖。
 */
async function ensureDom() {
  if (domReady) return;
  const fabricRequire = createRequire(require.resolve("fabric/node"));

  /**
   * `[实测] 2026-08-31` 少了这一段，**九个主体会一起报「缺席」**——包括
   * `Button` 这种明明就在仓里的。真正的错是
   * `Cannot find module '../build/Release/canvas.node'`：
   * `canvas@2.11.2` 装了，但原生绑定没编译过，而 jsdom 20 在
   * `living/events/MouseEvent-impl.js` 里 `require("canvas")` **没有兜住**这个抛错。
   *
   * 于是 `ensureDom()` 抛 → 被 `renderBody` 的外层 catch 收成「主体缺席」→
   * 一条环境问题伪装成九位 owner 集体没交卷。这正是本闸最不能犯的错。
   *
   * 解法照抄仓内既有做法（`tests/anchored-popover.test.mjs:14-26`）：
   * 加载 jsdom 之前先把 `canvas` 在 require 缓存里替成空对象，加载完立刻还原。
   * 不是新依赖、不是新技巧，就是这个仓已经在用的那一招。
   */
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  let JSDOM;
  try {
    ({ JSDOM } = await import(
      pathToFileURL(fabricRequire.resolve("jsdom")).href
    ));
  } finally {
    if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
    else delete require.cache[canvasEntry];
  }
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://word.oceanleo.com/",
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
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    PointerEvent: window.PointerEvent || window.MouseEvent,
    matchMedia:
      window.matchMedia ||
      (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  domReady = true;
}

/**
 * 源码层面确认某个导出**存在**（不加载，只读源）。
 *
 * 存在的理由：`compileModule()` 加载失败**不等于**导出不存在。实测到两种：
 *   - `src/shell/FloatingContextToolbar.tsx` → `Cannot find module
 *     '…/src/lib/motion/spring'`（相对 import 没带扩展名，module-bench 解析不到）；
 *   - `src/shell/MaterialLibrary.tsx` → 落在一个跨 6 个文件的循环依赖里，
 *     module-bench 的 `data:` 模块表达不了环（它自己的报错就是这么说的）。
 * 两条**都是本闸这层的限制**，W02 与 W06 的组件明明都在仓里。
 *
 * 只靠 import 成败判断，就会把这两位已经交卷的 owner 报成「缺席」。
 * 那种红比没有闸更坏：它会让人去追一个不存在的欠账。
 *
 * 覆盖两种写法（`_COMMON` §7b③：判「不存在」不能只靠一条正则）：
 * 直接声明 `export const/function/class X`，以及再导出 `export { X } from "…"`。
 * 再导出只跟一层——够用，且不会把自己变成一个小型打包器。
 */
async function sourceDeclaresExport(moduleRelPath, exportName) {
  const { readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  let source;
  try {
    source = await readFile(join(REPO_ROOT, moduleRelPath), "utf8");
  } catch {
    return false;
  }
  const name = exportName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const direct = new RegExp(
    `export\\s+(?:async\\s+)?(?:const|let|function|class)\\s+${name}\\b`,
  );
  if (direct.test(source)) return true;
  // `export { X } from "./y"` / `export { X }`
  const reexport = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`);
  return reexport.test(source);
}

/**
 * 解析一个主体的具名导出。
 *
 * 三种结局，**必须分得开**（见 `subjects.mjs` 抬头的 `render` 一栏）：
 *   `{ kind: "ok" }`          拿到组件了；
 *   `{ kind: "absent" }`      源码里确实没有这个导出 ⇒ owner 还没交；
 *   `{ kind: "load-failed" }` 源码里有，但本闸加载不动 ⇒ 记闸的账，不记 owner 的。
 */
async function resolveSubject(key) {
  const subject = SUBJECTS[key];
  if (!subject || !subject.module) return { kind: "absent", error: null };
  const declared = await sourceDeclaresExport(subject.module, subject.exportName);
  try {
    const { compileModule } = await import("../../helpers/module-bench.mjs");
    const url = await compileModule(subject.module);
    const mod = await import(url);
    const exported = mod?.[subject.exportName];
    if (typeof exported === "function" || typeof exported === "object") {
      return { kind: "ok", component: exported, error: null };
    }
    return {
      kind: declared ? "load-failed" : "absent",
      component: null,
      error: declared
        ? `模块加载成功但取不到 \`${subject.exportName}\`（源码里声明了它）。`
        : null,
    };
  } catch (error) {
    const message = error?.message ?? String(error);
    return {
      kind: declared ? "load-failed" : "absent",
      component: null,
      error: message,
    };
  }
}

/**
 * 夹具接线表。
 *
 * ⚠️ **这是本套件唯一需要 owner 回填的地方，也是必须回填的地方。**
 * 开工时实测 W01–W09 一件都还没落地（`--leo-dur-*` / `__leoMotionJumpAllToRest`
 * 在 `src/` 下零命中，对照组已自证），所以此刻**无从知道**这些组件最终的 prop 拼写。
 * 每条都按规范里的语义给了最可能的形状；组件落地后由**该组件的 owner**核对一次。
 * 拼不上不会让闸哑火——`renderCase` 会把它渲染成 `.leo-missing` 并判红点名。
 * 详见 `docs/testing/visual-regression.md` §接线。
 */
const FIXTURE_PROPS = {
  editBar: (state) => ({
    "data-leo-state": state,
    expanded: state === "expanded",
    collapsed: state === "collapsed",
    dragging: state === "dragging",
  }),
  overlay: (state) => ({
    "data-leo-state": state,
    open: state !== "exit",
    anchorRect: { top: 120, left: 200, width: 96, height: 32 },
  }),
  /**
   * `[实测]` 对着 `src/ui/Button.tsx:250-267` 的解构逐条核过：
   * `variant` / `size` / `disabled` / `children` 都在 props 面上，拼写一致。
   * 文案刻意写成 `variant/size` 而不是「按钮」：截图 diff 里能直接读出是哪一格漂了。
   */
  button: ({ variant, size, state }) => ({
    variant,
    size,
    disabled: state === "disabled",
    "data-leo-state": state,
    children: `${variant}/${size}`,
  }),
  toast: (kind) => ({ kind, "data-leo-state": kind, children: `${kind} message` }),
  materialGrid: () => ({
    // prop 名是 `materials`（`material-library-view.tsx:95`），不是 `items`。
    materials: Array.from({ length: SUBJECTS.materialGrid.itemCount }, (_, i) => ({
      id: `m-${i}`,
      name: `素材 ${i}`,
    })),
  }),
  card: (state) => ({ "data-leo-state": state, loading: state === "loading" }),
  uploadProgress: (state) => ({
    "data-leo-state": state,
    status: state,
    progress: state === "uploading" ? 0.42 : 0,
  }),
  /**
   * `[实测]` `WorkbenchRouteChunkError` 的 props 面是
   * `{ kind, attempts, onRetry, onReload }`（`WorkbenchRouteLoading.tsx:38-43`）。
   * 两个回调给成空函数：静态页点不动它们，但**不给就可能在渲染期解引用报错**，
   * 那种错会被 try/catch 收成「主体缺席」，等于把 W09 冤枉成没交卷。
   * `attempts` 给 3：失败态文案要显示重试了几次，给 0 看不出这条信息在不在。
   */
  chunkIsolation: (kind) => ({
    kind,
    attempts: 3,
    onRetry: () => {},
    onReload: () => {},
  }),
};

function missingBlock(key, detail) {
  const text = detail
    ? `${missingSubjectMessage(key)}\n  实际错误：${detail}`
    : missingSubjectMessage(key);
  return `<div class="leo-missing" data-leo-missing="${escapeHtml(
    SUBJECTS[key]?.owner ?? "?",
  )}">${escapeHtml(text)}</div>`;
}

/**
 * `render:"needs-client"` 的占位块。
 *
 * 刻意用**另一个属性** `data-leo-needs-client`，不复用 `data-leo-missing`：
 * 两者在报表里必须能分开数，否则「闸覆盖不到」会被当成「owner 没交」，
 * 而那正是会让人被冤枉的那种错。
 */
function needsClientBlock(key, detail) {
  const text = detail
    ? `${needsClientMessage(key)}\n  本闸这边的实际拦路错：${detail}`
    : needsClientMessage(key);
  return `<div class="leo-needs-client" data-leo-needs-client="${escapeHtml(
    SUBJECTS[key]?.owner ?? "?",
  )}">${escapeHtml(text)}</div>`;
}

/** 渲染一个 case 的 body。任何异常都收敛成 `.leo-missing`，绝不向外抛。 */
async function renderBody(key) {
  const subject = SUBJECTS[key];
  if (subject?.cssOnly) {
    // W01 的产出在 CSS 里：给一组探针元素，让用例去读它们的计算值。
    return renderTokenProbes();
  }
  try {
    await ensureDom();
    const resolved = await resolveSubject(key);

    // 源码里真的没有这个导出 ⇒ owner 还没交。这是唯一记 owner 头上的分支。
    if (resolved.kind === "absent") return missingBlock(key, resolved.error);

    // 源码里有、本闸加载不动 ⇒ 记闸的账。**绝不能和上一条混**。
    if (resolved.kind === "load-failed") return needsClientBlock(key, resolved.error);

    /**
     * 顺序是刻意的：**先确认导出在不在，再谈渲染得出来渲染不出来**。
     *
     * 反过来写（一看见 needs-client 就直接返回占位）会让「W02 把组件删了」
     * 和「W02 交了但本闸覆盖不到」长得一模一样——那样这条用例就永远是同一句话，
     * 无论对面发生了什么。先解析导出，占位块才有资格说「主体**确实存在**」。
     */
    if (subject.render === "needs-client") return needsClientBlock(key, null);

    const Component = resolved.component;
    const React = (await import("react")).default ?? (await import("react"));
    const { renderToStaticMarkup } = await import("react-dom/server");

    const slots = fixtureSlots(key).map(({ label, props }) => {
      let inner;
      try {
        inner = renderToStaticMarkup(React.createElement(Component, props));
      } catch (error) {
        inner = missingBlock(key, error?.message ?? String(error));
      }
      return `<div class="leo-case-slot" data-leo-slot="${escapeHtml(label)}">${inner}</div>`;
    });
    return slots.join("\n");
  } catch (error) {
    return missingBlock(key, error?.message ?? String(error));
  }
}

/** 一个 case 要渲染哪几个槽位（三态 / 矩阵 / 四类型 …）。 */
function fixtureSlots(key) {
  const subject = SUBJECTS[key];
  switch (key) {
    case "button": {
      /**
       * 4 variant × 3 size × **2** propStates = 24 槽，不是 60。
       *
       * `hover` / `active` / `focus-visible` 刻意不铺槽：它们是浏览器级伪类，
       * 由 `w04-button-matrix.spec.ts` 用 `locator.hover()` 与键盘 Tab **真实触发**。
       * 铺一个 `data-leo-state="hover"` 的假槽，等于自己写一份长得像 hover 的 HTML
       * 再去断言它长得像 hover —— 那守的是夹具自己，一文不值。
       */
      const slots = [];
      for (const variant of subject.variants) {
        for (const size of subject.sizes) {
          for (const state of subject.propStates) {
            slots.push({
              label: `${variant}-${size}-${state}`,
              props: FIXTURE_PROPS.button({ variant, size, state }),
            });
          }
        }
      }
      return slots;
    }
    case "toast":
    case "chunkIsolation":
      return subject.kinds.map((kind) => ({
        label: kind,
        props: FIXTURE_PROPS[key](kind),
      }));
    case "materialGrid":
      return [{ label: "default", props: FIXTURE_PROPS[key]() }];
    default:
      return (subject.states ?? ["default"]).map((state) => ({
        label: state,
        props: FIXTURE_PROPS[key](state),
      }));
  }
}

/**
 * W01 的探针。每个元素只把一个 token 放进一个可读的 CSS 属性里，
 * 用例再用 `getComputedStyle` 读**解析后的最终值**——这正是「token 是否被正确
 * 解析成最终值」的定义，也是 token 漂移唯一测得准的地方。
 */
export const DURATION_TOKENS = [
  "--leo-dur-1",
  "--leo-dur-2",
  "--leo-dur-3",
  "--leo-dur-4",
  "--leo-dur-5",
  "--leo-dur-6",
];

export const EASE_TOKENS = [
  "--leo-ease-standard",
  "--leo-ease-decelerate",
  "--leo-ease-accelerate",
  "--leo-ease-emphasis",
  "--leo-ease-spring",
];

export const MOVE_TOKENS = ["--leo-move-xs", "--leo-move-sm", "--leo-move-md"];
export const STAGGER_TOKENS = ["--leo-stagger", "--leo-stagger-max"];

function renderTokenProbes() {
  const probe = (token, property) =>
    `<div class="leo-case-slot" data-leo-token="${token}" style="${property}: var(${token});">${token}</div>`;
  return [
    ...DURATION_TOKENS.map((t) => probe(t, "transition-duration")),
    ...EASE_TOKENS.map((t) => probe(t, "transition-timing-function")),
    ...MOVE_TOKENS.map((t) => probe(t, "margin-left")),
    ...STAGGER_TOKENS.map((t) => probe(t, "transition-delay")),
  ].join("\n");
}

export async function renderCase(key) {
  const subject = SUBJECTS[key];
  if (!subject) return null;
  const bodyHtml = await renderBody(key);
  return renderPage({
    title: `W10 · ${key} · 守 ${subject.owner}`,
    bodyHtml,
    caseId: key,
    owner: subject.owner,
  });
}
