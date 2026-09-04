// PDF 换核的接线闸（W06 · editor-core-swap）。
//
// `pdf-next-core-swap.test.mjs` 判的是三份纯模块的**内容**（加载地址、命令映射、chips）。
// 这一份判的是**接线**：那些模块有没有真被路由用上、双核 flag 有没有在顶层判一次、
// 专业模式走的是不是 adapter 的 mode 面。
//
// 为什么是读源码断言：接线错了的编辑器在单测里长得和接对了一样——
// 一个没人调用的 `pdfNextCommandAvailability` 依然能让它自己的用例全绿。
// 判据 1/2 里「真的渲染出一页 PDF」那半在浏览器里，归 V1（`_COMMON.md` §2 第 5 条
// 不许拿浏览器当验收），验收入口写在 `verdicts/W06-delivery.md`。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  PDFIUM_WASM_ENV_KEY,
  resolvePdfiumWasmUrl,
} from "../src/shell/media-editors/pdf-next-runtime.ts";
import {
  pdfNextCommandAvailability,
  pdfNextCommandGaps,
} from "../src/shell/media-editors/pdf-next-commands.ts";
import {
  pdfAgentChipsAreValid,
  pdfToolsManifestV2Fields,
} from "../src/shell/media-editors/pdf-agent-chips.ts";
import {
  PDF_NEXT_BLOCKED_COMMANDS,
  pdfNextBlockReason,
  pdfNextEditorFacade,
} from "../src/shell/media-editors/pdf-next-facade.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/PdfRoute.tsx");
const toolbar = read("src/shell/media-editors/PdfContextToolbar.tsx");
const controls = read("src/shell/media-editors/PdfControls.tsx");
/**
 * 去掉注释的路由源码。
 *
 * 「这里不许出现 X」这类断言必须只看代码：注释里本来就会提到 X
 * （例如「Native 件不发 postMessage」那句解释）。拿整份文件去 grep，
 * 会把一条正确的解释判成违规。
 */
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
const leaf = read("src/shell/media-editors/PdfNextStage.tsx");
const state = read("src/shell/media-editors/pdf-workbench-state.ts");

// `_COMMON.md` §10 第 3 条（双核 flag，默认 legacy）+ `editor-core-flags.ts` 纪律 1
// 违反后果：flag 判定写在组件深处 ⇒ 两套核的模块图进同一个 chunk，
// 31 个租户站每次打开任何编辑器都拖上 4.6 MB 的 PDFium。
test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /const core = resolveEditorCore\("pdf"\);/);
  // 重内核只许出现在懒加载叶子里（`W01-deps.md` §4）：路由自己不许 import 它。
  assert.doesNotMatch(route, /from "@embedpdf\//);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/PdfNextStage"\)/,
  );
  // `ssr: false` 是硬要求：PDFium 是 WASM + blob worker，服务端两者都不存在。
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  // 舞台按 flag 分流，旧核那一支一行不动。
  assert.match(route, /core === "next" \? \(\s*<PdfNextStage/);
  assert.match(route, /<PdfStage editor=\{editor\} accent=\{accent\} \/>/);
});

// 判据 1（自托管 WASM / 不向第三方要字体）
// 违反后果：不显式传 wasmUrl，上游用它写死的 jsDelivr 地址（dist/react/index.js:7），
// 于是每个租户站每次打开 PDF 都向第三方发一次 4.6 MB 请求。
test("the kernel is never handed a config that lets it fall back to a CDN", () => {
  // 地址算不出来时**不许**把 `{wasmUrl: undefined}` 递进去——那正好触发上游兜底。
  assert.match(
    leaf,
    /usePdfiumEngine\(\s*plan\.wasm\.ok\s*\?\s*\{ wasmUrl: plan\.wasm\.wasmUrl, fontFallback: plan\.fontFallback \}\s*:\s*undefined,\s*\)/,
  );
  // 字体：`null` 是上游唯一走得掉 CDN 的取值（`fontFallback ?? cdnFontConfig`）。
  assert.match(leaf, /fontFallback: fontFallback \?\? null/);
  // 专业模式的查看器同样不许向 Google Fonts 取字。
  assert.match(leaf, /fonts: PDF_VIEWER_NO_EXTERNAL_FONTS/);
  // 叶子里不许出现任何写死的 CDN 地址。
  assert.doesNotMatch(leaf, /cdn\.jsdelivr\.net/);

  // 纯函数那一侧的行为（这条是真调用，不是 grep）。
  const refused = resolvePdfiumWasmUrl({
    envUrl: PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
    bundledUrl: "/static/pdfium/pdfium.wasm",
  });
  assert.equal(refused.ok, false);
  assert.match(refused.reason, new RegExp(PDFIUM_WASM_ENV_KEY));
});

// 判据 2（专业模式 = 即用查看器，同一文档实例）+ R3（默认普通）
// 违反后果：切模式时重新载入文档 ⇒ 用户刚打的批注消失，而且没有任何报错。
test("professional mode is the adapter's mode face, over the same bytes", () => {
  assert.match(route, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  // Native 件走 adapter 的 mode 面，**不发 postMessage**（契约 v2 §4）。
  assert.doesNotMatch(routeCode, /postMessage|buildSetModeMessage/);
  assert.match(route, /mode: \{\s*\n\s*current: mode,/);
  // 旧核档没有专业模式可去 ⇒ 置灰 + 写明原因，开关不许消失。
  assert.match(route, /setMode: core === "next" \? setMode : undefined,/);
  assert.match(route, /unavailableReason:/);

  // 同一文档实例：两个模式吃的是同一个取值器（facade 后的那一个，见下一条用例）。
  assert.match(route, /bytes=\{nextCoreEditor\.currentBytes\(\)\}/);
  assert.match(state, /currentBytes: \(\) => Uint8Array \| null;/);
  // 叶子里两支都用同一份 `bytes`，专业模式不去网络再拉一遍。
  assert.match(leaf, /initialDocuments: \[\{ buffer: pdfArrayBuffer\(bytes\), name \}\]/);
  assert.doesNotMatch(leaf, /src:\s*(?:url|sourceUrl)/);
});

// 判据 5 后半（`tools-manifest` v2 声明 PDF chips）
// 违反后果：chips 写错 kind / 超过 8 条 ⇒ 宿主整条 manifest 丢掉，L4 一个都不显示。
test("the eight PDF chips satisfy the contract's own validator", () => {
  assert.equal(pdfAgentChipsAreValid(), true);
  const fields = pdfToolsManifestV2Fields();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  assert.equal(new Set(fields.chips.map((chip) => chip.id)).size, 8);
});

// 规范 §7 判据 2（任一入口触发同一动作）+ §2.1 第 6 条
// 违反后果：新核做不到的动作在 L1 上变成死键——按钮还在、点下去什么都不发生，
// 而这是换核最容易掉东西、也最难被发现的地方。
test("commands the new core cannot do are refused at the editor, for every entry", async () => {
  // 缺口逐条都要给得出原因，且原因不是空话。
  const gaps = pdfNextCommandGaps();
  assert.ok(gaps.length >= 1);
  for (const gap of gaps) {
    const gate = pdfNextCommandAvailability(gap.id);
    if (gap.readiness === "unavailable") {
      assert.equal(gate.enabled, false, gap.id);
      assert.ok(gate.reason.length > 20, `${gap.id} 的原因太短，等于没说`);
    }
  }
  // 未登记的 id 也要拒，而不是当成可用。
  assert.equal(pdfNextCommandAvailability("pdf.no-such-thing").enabled, false);

  // facade 的行为（真调用）：新核档拒绝 + 把原因回调出去；旧核档原样放行。
  const calls = [];
  const stub = {
    rotateCurrentPage: async () => calls.push("rotate"),
    addBlankPage: async () => calls.push("blank"),
  };
  const legacy = pdfNextEditorFacade(stub, "legacy", () => {});
  assert.equal(legacy, stub, "legacy 档必须原样返回同一个对象");

  const reasons = [];
  const next = pdfNextEditorFacade(stub, "next", (reason) => reasons.push(reason));
  await assert.rejects(() => next.rotateCurrentPage(-1));
  await assert.rejects(() => next.addBlankPage());
  // 抛是给指令面/agent 的（注册表把它转成 ok:false），回调是给 L1 的状态栏。
  assert.equal(reasons.length, 2);
  for (const reason of reasons) assert.ok(reason.length > 20, reason);
  // 被拦的动作一次都没真跑到旧核实现上。
  assert.deepEqual(calls, []);

  // 拒绝的原因取自命令表，不在 facade 里另写一份。
  for (const id of PDF_NEXT_BLOCKED_COMMANDS) {
    assert.equal(pdfNextBlockReason(id), pdfNextCommandAvailability(id).reason);
  }

  // 三个入口：路由把 facade 后的 editor 交给指令面、舞台、L1 浮条与 L2 操控台。
  // 只交给指令面的话，L1 上那个按钮仍然打到旧核实现上（死键或假成功）。
  // L1 的两处 `void` 调用必须接住（否则一次点击留下未处理的 promise 拒绝）。
  assert.match(
    route,
    /usePluginCommandSurface\(\s*buildPdfCommandSurface\(nextCoreEditor,/,
  );
  assert.match(route, /<PdfControls editor=\{nextCoreEditor\} \/>/);
  assert.match(
    route,
    /<PdfContextToolbar editor=\{nextCoreEditor\} accent=\{accent\} \/>/,
  );
  assert.match(route, /bytes=\{nextCoreEditor\.currentBytes\(\)\}/);
  assert.doesNotMatch(toolbar, /void editor\.rotateCurrentPage/);
  assert.match(toolbar, /editor\.rotateCurrentPage\(-1\)\.catch\(\(\) => \{\}\)/);
  assert.doesNotMatch(controls, /void editor\.addBlankPage/);
  assert.match(controls, /editor\.addBlankPage\(\)\.catch\(\(\) => \{\}\)/);
});
