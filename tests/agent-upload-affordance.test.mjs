// 「输入框到底有没有上传口子」的**渲染层**契约（`01-decisions.md` D8）。
//
// 背景：`LeoComposer` 只要拿到 `onAttachFiles`，就同时开出【文件选择按钮】和
// 【整卡拖拽上传】。2026-07-28 之前 `AgentChat` / `FunctionAgentChat` 是**无条件**
// 传它的，于是 game（LeoPlay）这种「全站不提供任何上传/导入入口」的站根本关不掉——
// V3 验收实测两处都能上传，占位文案还在主动邀请用户上传，J5 的 D8 一项判 FAIL。
//
// 本文件守两件互为反面的事，缺一不可：
//   1) 不传 prop（35 个站的现状）→ 上传能力**照旧存在**。这是「默认 true、其余站
//      行为逐字不变」的机器证据，不是靠读 diff 相信。
//   2) 传 `enableInputTools={false}` → 渲染出来的 HTML 里**一个上传能力都没有**，
//      且占位文案不再提上传。
//
// 判据取渲染结果而不是源码文本：源码断言挡不住「换个组件、换种写法照样渲染出上传」。
// 拖拽那一路在 SSR HTML 里没有可断言的痕迹（overlay 只在 dragOver 状态出现），
// 所以额外钉住 `dragEnabled` 的定义式——它与文件选择共用 `Boolean(onAttachFiles)`
// 这一个开关，选择器消失即拖拽消失。
//
// 组件源码经 tests/helpers/module-bench.mjs 编出来再导入。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

// 任意具名导入都拿得到一个无副作用的空函数——用于上传链路之外的第三方包。
const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

// 只桩掉「会联网 / 需要 Next 运行时 / 与上传无关的重组件」这三类，其余一律编真源码——
// 上传能力那条链（组件 → LeoComposer → input/AttachMenu）必须是真的。
const OVERRIDES = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh, vars) => String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m)); }"),
  "next/navigation": dataModule(
    "export function useRouter(){ return { push(){}, replace(){}, refresh(){}, back(){} }; }\n" +
      "export function useSearchParams(){ return new URLSearchParams(); }\n" +
      "export function usePathname(){ return '/'; }",
  ),
  // `../lib/agent` 与 `../lib/database` **不桩**，编真源码：它们的网络调用都在事件
  // 处理器和 effect 里，renderToStaticMarkup 不会触发；桩掉反而要逐个补导出名，
  // 而且会把「组件到底怎么用它们」这层真实性一起桩没。第三方传输依赖（supabase 等）
  // 由 missingPackageStub 兜住。
  "./CloudBrowserPanel": dataModule("export function CloudBrowserPanel(){ return null; }"),
  "./ResultCanvas": dataModule(
    "export function ResultCanvas(){ return null; }\nexport function CanvasEmpty(){ return null; }\nexport function CanvasSubTabs(){ return null; }",
  ),
  "./ArtifactRenderer": dataModule(
    "export function ArtifactRenderer(){ return null; }\nexport function artifactToLibraryItem(){ return {}; }",
  ),
  "./MaterialLibrary": dataModule("export function MaterialLibrary(){ return null; }"),
  // Tiptap 编辑器（输入框的文字区）与上传能力无关，且要浏览器环境才跑得起来。
  // 桩成一个 textarea，占位文案照样落进 HTML —— 「文案还在不在邀请上传」要靠它。
  "./PromptHighlightArea": dataModule(`
    import { createElement, forwardRef } from "${reactUrl}";
    export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
      return createElement("textarea", {
        placeholder: props.placeholder,
        defaultValue: props.value || "",
        readOnly: true,
      });
    });
    export const TemplateFillArea = PromptHighlightArea;
    export function templateSegments(){ return []; }
    export function highlightSegments(){ return []; }
    export function stripPromptPlaceholders(text){ return text; }
  `),
};

const shellDir = "src/shell";

async function load(relativePath) {
  return import(
    await compileModule(`${shellDir}/${relativePath}`, OVERRIDES, {
      missingPackageStub: lazyStub,
    })
  );
}

/**
 * 渲染结果里的「上传能力」清点。三项各自独立可见，任何一项非零都意味着用户能把
 * 本地文件塞进来。
 */
function uploadAffordances(html) {
  return {
    filePicker: (html.match(/type="file"/g) || []).length,
    attachMenu: (html.match(/aria-label="添加附件"/g) || []).length,
    invitesUpload: /上传文件|可上传/.test(html),
  };
}

const { LeoComposer } = await load("LeoComposer.tsx");

test("LeoComposer：拿到 onAttachFiles 就同时开出文件选择与拖拽——这是被关掉的那个东西", () => {
  const withUpload = renderToStaticMarkup(
    createElement(LeoComposer, {
      value: "",
      onChange() {},
      onAttachFiles() {},
    }),
  );
  const on = uploadAffordances(withUpload);
  assert.equal(on.filePicker, 1, "传了 onAttachFiles 却没渲染 file input");
  assert.equal(on.attachMenu, 1, "传了 onAttachFiles 却没渲染「添加附件」按钮");

  const withoutUpload = renderToStaticMarkup(
    createElement(LeoComposer, { value: "", onChange() {} }),
  );
  const off = uploadAffordances(withoutUpload);
  assert.equal(off.filePicker, 0);
  assert.equal(off.attachMenu, 0);
});

test("拖拽上传与文件选择共用同一个开关，关掉选择器即关掉拖拽", async () => {
  // SSR 的 HTML 里看不到拖拽（overlay 只在 dragOver 状态出现），所以钉定义式。
  const source = await readFile(
    new URL("../src/shell/LeoComposer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /const dragEnabled = Boolean\(onAttachFiles\) && !disabled;/);
  assert.match(source, /\{onAttachFiles && \(\s*<input/);
});

const { FunctionAgentChat } = await load("FunctionAgentChat.tsx");
const { AgentChat } = await load("AgentChat.tsx");

const SCHEMA = {
  agentId: "game.arcade",
  title: "横版闯关游戏",
  fields: [{ key: "brief", label: "玩法描述", type: "longtext" }],
  actions: [],
};

function renderFunctionChat(props) {
  return renderToStaticMarkup(
    createElement(FunctionAgentChat, {
      agentId: "game.arcade",
      siteId: "game",
      schema: SCHEMA,
      opsContent: null,
      defaultTab: "agent",
      ...props,
    }),
  );
}

function renderAgentChat(props) {
  return renderToStaticMarkup(
    createElement(AgentChat, { siteId: "game", ...props }),
  );
}

test("默认（不传 prop）= 35 个站的现状：两个组件都照旧渲染上传能力", () => {
  const fn = uploadAffordances(renderFunctionChat({}));
  assert.equal(fn.filePicker, 1, "FunctionAgentChat 默认态丢了文件选择——35 站会被误伤");
  assert.equal(fn.attachMenu, 1);
  assert.equal(fn.invitesUpload, true, "FunctionAgentChat 默认占位文案应仍提「可上传文件」");

  const agent = uploadAffordances(renderAgentChat({}));
  assert.equal(agent.filePicker, 1, "AgentChat 默认态丢了文件选择——35 站会被误伤");
  assert.equal(agent.attachMenu, 1);
  assert.equal(agent.invitesUpload, true, "AgentChat 默认占位文案应仍提「上传文件」");
});

test("显式传 true 与不传完全一致（默认值不是另一条分支）", () => {
  assert.equal(
    renderFunctionChat({ enableInputTools: true }),
    renderFunctionChat({}),
  );
  assert.equal(renderAgentChat({ enableInputTools: true }), renderAgentChat({}));
});

test("enableInputTools={false}：渲染结果里一个上传能力都没有，文案也不再邀请上传", () => {
  const fn = uploadAffordances(renderFunctionChat({ enableInputTools: false }));
  assert.equal(fn.filePicker, 0, "FunctionAgentChat 关闭态仍渲染了 file input");
  assert.equal(fn.attachMenu, 0, "FunctionAgentChat 关闭态仍渲染了「添加附件」按钮");
  assert.equal(fn.invitesUpload, false, "FunctionAgentChat 关闭态占位文案仍在邀请上传");

  const agent = uploadAffordances(renderAgentChat({ enableInputTools: false }));
  assert.equal(agent.filePicker, 0, "AgentChat 关闭态仍渲染了 file input");
  assert.equal(agent.attachMenu, 0, "AgentChat 关闭态仍渲染了「添加附件」按钮");
  assert.equal(agent.invitesUpload, false, "AgentChat 关闭态占位文案仍在邀请上传");
});

test("关闭态的占位文案仍是本地化词条，不是硬编码中文", async () => {
  // 复用既有 key（17 语都已有译文），不新增待翻译条目。
  const zh = await readFile(
    new URL("../src/i18n/ui/messages/zh.ts", import.meta.url),
    "utf8",
  );
  const en = await readFile(
    new URL("../src/i18n/ui/messages/en.ts", import.meta.url),
    "utf8",
  );
  for (const dict of [zh, en]) {
    assert.match(dict, /^ {2}"继续追问":/m);
    assert.match(dict, /^ {2}"让 agent 帮你做「\{title\}」":/m);
  }
});

test("HomeIntro 的同名 prop 仍在，三个入口一套写法", async () => {
  const home = await readFile(
    new URL("../src/shell/HomeIntro.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /enableInputTools = true/);
  assert.match(home, /onAttachFiles=\{toolsOn \? atts\.handleAttachFiles : undefined\}/);
  for (const name of ["AgentChat", "FunctionAgentChat"]) {
    const source = await readFile(
      new URL(`../src/shell/${name}.tsx`, import.meta.url),
      "utf8",
    );
    assert.match(source, /enableInputTools = true/, `${name} 默认值必须是 true`);
    assert.match(
      source,
      /onAttachFiles=\{toolsOn \? atts\.handleAttachFiles : undefined\}/,
      `${name} 没有按 toolsOn 收敛 onAttachFiles`,
    );
  }
});
