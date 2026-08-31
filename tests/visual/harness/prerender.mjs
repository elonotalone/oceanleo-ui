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
import { pathToFileURL } from "node:url";

import { SUBJECTS, missingSubjectMessage } from "./subjects.mjs";
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
  const { JSDOM } = await import(
    pathToFileURL(fabricRequire.resolve("jsdom")).href
  );
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

/** 解析一个主体的具名导出。模块在、导出不在 ⇒ 返回 null（不抛）。 */
async function resolveSubject(key) {
  const subject = SUBJECTS[key];
  if (!subject || !subject.module) return null;
  const { compileModule } = await import("../../helpers/module-bench.mjs");
  const url = await compileModule(subject.module);
  const mod = await import(url);
  const exported = mod?.[subject.exportName];
  return typeof exported === "function" || typeof exported === "object"
    ? exported
    : null;
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
  button: ({ variant, size, state }) => ({
    variant,
    size,
    disabled: state === "disabled",
    "data-leo-state": state,
    children: `${variant}/${size}`,
  }),
  toast: (kind) => ({ kind, "data-leo-state": kind, children: `${kind} message` }),
  materialGrid: () => ({
    items: Array.from({ length: SUBJECTS.materialGrid.itemCount }, (_, i) => ({
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
  chunkIsolation: () => ({}),
};

function missingBlock(key, detail) {
  const text = detail
    ? `${missingSubjectMessage(key)}\n  实际错误：${detail}`
    : missingSubjectMessage(key);
  return `<div class="leo-missing" data-leo-missing="${escapeHtml(
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
    const Component = await resolveSubject(key);
    if (!Component) return missingBlock(key);

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
      const slots = [];
      for (const variant of subject.variants) {
        for (const size of subject.sizes) {
          for (const state of subject.states) {
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
      return subject.kinds.map((kind) => ({
        label: kind,
        props: FIXTURE_PROPS.toast(kind),
      }));
    case "materialGrid":
    case "chunkIsolation":
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
