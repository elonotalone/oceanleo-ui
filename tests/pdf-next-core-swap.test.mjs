// PDF 换核（EmbedPDF）的可机检部分。W06 · editor-core-swap。
//
// 这份闸守三件事，每一件都是「不看浏览器也能判红」的：
//   §1 PDFium 的 WASM 与回退字体不许落到第三方 CDN 上（上游默认就是 CDN）；
//   §2 页面整理为什么走字节（pdf-lib）：引擎确实没有写旋转 / 插页的 API；
//   §3 L4 chips 真的过宿主契约 v2 的校验器（不是本地占位）。
//
// 判据 1/2 里「真的渲染出一页 PDF」那部分不在这里：PDFium 是 4.6 MB WASM +
// blob worker，node --test 里跑不起来，也不许用浏览器验收（`_COMMON.md` §2 第 5 条）。
// 那一半的验收入口写在 `verdicts/W06-delivery.md`。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  PDFIUM_FONT_BASE_ENV_KEY,
  PDFIUM_FONT_GROUPS,
  PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  PDFIUM_UPSTREAM_FONT_CDN_PREFIX,
  PDFIUM_WASM_ENV_KEY,
  PDF_VIEWER_NO_EXTERNAL_FONTS,
  isVendorCdnUrl,
  resolvePdfiumFontFallback,
  resolvePdfiumWasmUrl,
} from "../src/shell/media-editors/pdf-next-runtime.ts";
import {
  PDF_AGENT_CHIPS,
  pdfAgentChipsAreValid,
  pdfToolsManifestV2Fields,
} from "../src/shell/media-editors/pdf-agent-chips.ts";
import {
  CHIP_ANY_SELECTION,
  chipsForSelection,
  renderChipPrompt,
  validAgentChips,
} from "../src/shell/hosted-editor/index.ts";

const repoFile = (relative) =>
  fileURLToPath(new URL(`../${relative}`, import.meta.url));

// ── §1 加载路径：不许回落到第三方 CDN ────────────────────────────────────

test("上游写死的 WASM 兜底地址会被认出来是第三方 CDN", () => {
  assert.equal(isVendorCdnUrl(PDFIUM_UPSTREAM_DEFAULT_WASM_URL), true);
  assert.equal(isVendorCdnUrl(`${PDFIUM_UPSTREAM_FONT_CDN_PREFIX}sc@latest`), true);
  // 反面：自家地址不许被误判成 CDN，否则这道闸会把正确配置也拦掉。
  assert.equal(isVendorCdnUrl("/static/pdfium/pdfium.wasm"), false);
  assert.equal(isVendorCdnUrl("https://oceanleo.com/static/pdfium.wasm"), false);
});

test("协议相对与 http 写法的 CDN 一样拦得住", () => {
  assert.equal(isVendorCdnUrl("//cdn.jsdelivr.net/npm/@embedpdf/pdfium/x.wasm"), true);
  assert.equal(isVendorCdnUrl("http://cdn.jsdelivr.net/npm/x.wasm"), true);
  assert.equal(isVendorCdnUrl("https://unpkg.com/@embedpdf/pdfium/x.wasm"), true);
});

test("环境变量优先，其次打包器资源", () => {
  const env = resolvePdfiumWasmUrl({
    envUrl: "/static/pdfium/pdfium.wasm",
    bundledUrl: "/_next/static/media/pdfium.abc.wasm",
  });
  assert.deepEqual(env, {
    ok: true,
    wasmUrl: "/static/pdfium/pdfium.wasm",
    origin: "env",
  });
  const bundled = resolvePdfiumWasmUrl({
    bundledUrl: "/_next/static/media/pdfium.abc.wasm",
  });
  assert.equal(bundled.ok, true);
  assert.equal(bundled.origin, "bundled");
});

test("两档都缺时拒绝，并且把两条修法都写进原因里", () => {
  const none = resolvePdfiumWasmUrl();
  assert.equal(none.ok, false);
  assert.match(none.reason, /pdfium\.wasm/);
  assert.match(none.reason, new RegExp(PDFIUM_WASM_ENV_KEY));
  // 拒绝的原因里要点名那个不被接受的兜底地址，否则读的人不知道躲的是什么。
  assert.ok(none.reason.includes(PDFIUM_UPSTREAM_DEFAULT_WASM_URL));
});

test("部署侧自己把变量指向 CDN 也一样拒绝", () => {
  const cdn = resolvePdfiumWasmUrl({ envUrl: PDFIUM_UPSTREAM_DEFAULT_WASM_URL });
  assert.equal(cdn.ok, false);
  assert.match(cdn.reason, /第三方 CDN/);
  const bundledCdn = resolvePdfiumWasmUrl({
    bundledUrl: PDFIUM_UPSTREAM_DEFAULT_WASM_URL,
  });
  assert.equal(bundledCdn.ok, false);
});

test("回退字体默认显式关闭，配了自托管目录才开", () => {
  // `null` 是上游唯一走得掉 CDN 的取值：worker 里写的是
  // `fontFallback === null ? undefined : fontFallback ?? cdnFontConfig`。
  assert.equal(resolvePdfiumFontFallback(), null);
  assert.equal(resolvePdfiumFontFallback(""), null);
  assert.equal(
    resolvePdfiumFontFallback(`${PDFIUM_UPSTREAM_FONT_CDN_PREFIX}sc@latest`),
    null,
  );
  const hosted = resolvePdfiumFontFallback("/static/pdfium-fonts");
  assert.ok(hosted);
  assert.equal(hosted.baseUrl, "/static/pdfium-fonts/");
  // 上游按 FontCharset 取字体：简中 134、繁中 136、日 128、韩 129、阿 178、希伯来 177，
  // 拉丁包覆盖西里尔 204 / 希腊 161 / 越南 163。
  assert.equal(hosted.fonts[134], "/static/pdfium-fonts/sc.ttf");
  assert.equal(hosted.fonts[136], "/static/pdfium-fonts/tc.ttf");
  assert.equal(hosted.fonts[128], "/static/pdfium-fonts/jp.ttf");
  assert.equal(hosted.fonts[129], "/static/pdfium-fonts/kr.ttf");
  assert.equal(hosted.fonts[204], "/static/pdfium-fonts/latin.ttf");
  assert.equal(Object.keys(hosted.fonts).length, 9);
  for (const group of PDFIUM_FONT_GROUPS) {
    assert.ok(Object.values(hosted.fonts).includes(`/static/pdfium-fonts/${group}.ttf`));
  }
  for (const url of Object.values(hosted.fonts)) assert.equal(isVendorCdnUrl(url), false);
  assert.equal(typeof PDFIUM_FONT_BASE_ENV_KEY, "string");
});

test("即用查看器把两处外部 webfont 都关掉", () => {
  assert.deepEqual({ ...PDF_VIEWER_NO_EXTERNAL_FONTS }, {
    ui: null,
    signature: null,
  });
});

test("上游 2.15.0 的默认值没有变（变了这道闸就该重读）", async () => {
  const source = await readFile(
    repoFile("node_modules/@embedpdf/engines/dist/react/index.js"),
    "utf8",
  );
  assert.ok(
    source.includes(PDFIUM_UPSTREAM_DEFAULT_WASM_URL),
    "上游 usePdfiumEngine 的默认 wasmUrl 变了，pdf-next-runtime.ts 的常量要跟着改",
  );
  const worker = await readFile(
    repoFile("node_modules/@embedpdf/engines/dist/lib/pdfium/web/worker-engine.js"),
    "utf8",
  );
  assert.ok(
    worker.includes("fontFallback ?? cdnFontConfig"),
    "上游 worker 的字体回退兜底逻辑变了，`fontFallback: null` 这条结论要重验",
  );
});

// ── §2 页面整理走字节的依据 ─────────────────────────────────────────────

test("2.15.0 确实没有把页面旋转写进文件的 API（缺口的依据）", async () => {
  const types = await readFile(
    repoFile("node_modules/@embedpdf/models/dist/pdf.d.ts"),
    "utf8",
  );
  // 先用一个确定存在的成员验证读取本身没问题（`_COMMON.md` §6：零命中先验探针）。
  assert.ok(types.includes("saveAsCopy"), "读到的不是 PdfEngine 的类型文件");
  assert.ok(types.includes("deletePage"));
  assert.equal(/setPageRotation|rotatePage\b|insertPage/.test(types), false);
});

// ── §3 L4 chips：真的过契约 v2 的校验器 ─────────────────────────────────

test("八条 chips 过宿主契约 v2 的校验器", () => {
  assert.equal(PDF_AGENT_CHIPS.length, 8);
  assert.equal(pdfAgentChipsAreValid(), true);
  assert.equal(validAgentChips([...PDF_AGENT_CHIPS]), true);
});

test("tools-manifest v2 的两个字段成对发出", () => {
  const fields = pdfToolsManifestV2Fields();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  // 返回的是副本：调用方改了不该污染常量。
  fields.chips[0].label = "改坏它";
  assert.notEqual(PDF_AGENT_CHIPS[0].label, "改坏它");
});

test("没有选区时只剩声明了通配的 chips", () => {
  const none = chipsForSelection([...PDF_AGENT_CHIPS], null);
  assert.ok(none.length > 0);
  for (const chip of none) {
    assert.ok(chip.appliesTo.includes(CHIP_ANY_SELECTION));
  }
  // 「翻译选区」没有通配，没选区时就该消失。
  assert.equal(
    none.some((chip) => chip.id === "pdf.chip.translate-selection"),
    false,
  );
  const onPage = chipsForSelection([...PDF_AGENT_CHIPS], "pdf-page");
  assert.ok(onPage.some((chip) => chip.id === "pdf.chip.translate-selection"));
});

test("chip 提示词只替换一轮占位符", () => {
  const translate = PDF_AGENT_CHIPS.find(
    (chip) => chip.id === "pdf.chip.translate-selection",
  );
  const rendered = renderChipPrompt(translate, {
    selection: "用户内容里也写了 {document}",
  });
  assert.ok(rendered.includes("用户内容里也写了 {document}"));
  // 递归展开的话这里会变成整份文档，那正是契约禁止的。
  assert.equal(rendered.includes("我是整份文档"), false);
});

test("八条 chips 的 id 前缀一致且不重复", () => {
  const ids = PDF_AGENT_CHIPS.map((chip) => chip.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^pdf\.chip\./);
});
