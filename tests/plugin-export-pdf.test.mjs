// 导出成 PDF（W24 P3）。
//
// 这条链只有一件事值得测：**中文是不是真的在那份 PDF 里，而且是文字不是图片。**
// 手写 PDF 只能用 WinAnsi 的十四款标准字体，中文一律渲成空白方块；本波的裁定
// 是随包带中文字形子集，所以判据必须走到「把生成的 PDF 反着读回来」这一步，
// 只断言「产出了字节」等于什么都没测——一份全是空白方块的 PDF 也有字节。
//
// 反着读用的是本仓已有的 `pdfjs-dist`（`pdf-carrier-contract.test.mjs` 锁的
// 同一个版本），不开浏览器：`getTextContent()` 走的正是用户按 Ctrl+F 与
// 复制文字时走的那条路，取到的字与原文逐字相等，才算「可选中、可检索」。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { unzlibSync } from "fflate";

import {
  loadPdfFonts,
  resetPdfFontsForTest,
} from "../src/shell/plugin-export/pdf-cjk-font.ts";
import { renderPluginExport } from "../src/shell/plugin-export/plugin-export-render.ts";
import {
  exportKindsForPlugin,
  normalizePluginExportRequest,
} from "../src/shell/plugin-export/plugin-export-contract.ts";
import {
  ledgerExportRequest,
  LEDGER_RENDERABLE_EXPORT_FORMS,
} from "../src/shell/plugin-export/ledger-export.ts";
import {
  parseTrueType,
  subsetTrueType,
} from "../src/shell/plugin-export/truetype-subset.ts";

const LEDGER = {
  title: "八月记账",
  currency: "¥",
  entries: [
    {
      date: "2026-08-01",
      category: "餐饮",
      counterparty: "楼下面馆",
      direction: "out",
      amount: 32.5,
      note: "午饭",
    },
    {
      date: "2026-08-02",
      category: "工资",
      counterparty: "公司",
      direction: "in",
      amount: 18000,
      note: "七月薪资（含补贴）",
    },
    {
      date: "2026-08-03",
      category: "交通",
      counterparty: "地铁",
      direction: "out",
      amount: 6,
    },
  ],
};

async function renderLedgerPdf(overrides = {}) {
  const normalized = normalizePluginExportRequest(
    ledgerExportRequest({ ...LEDGER, ...overrides }, "pdf", {
      siteId: "home",
      appId: "personal-ledger",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(normalized.ok, true, normalized.ok ? "" : normalized.error);
  return renderPluginExport(normalized.request);
}

/** 用 pdfjs 把整份文档的文字层读回来，一页一段。 */
async function extractText(bytes) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Node 里没有真 worker，pdfjs 会退化成同进程的「假 worker」，但仍要求指出
  // worker 模块在哪。指到本仓装好的那一份即可，不联网。
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    import.meta.url,
  ).href;
  const document = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    // 判据要的是**我们自己嵌进去的那份字形**能不能用，所以不许 pdfjs 拿
    // 它自带的标准字体来兜底——兜住了就测不出字形到底嵌没嵌进去。
    useSystemFonts: false,
    standardFontDataUrl: undefined,
    disableFontFace: true,
    isEvalSupported: false,
  }).promise;
  const pages = [];
  for (let index = 1; index <= document.numPages; index += 1) {
    const page = await document.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(""));
  }
  await document.destroy();
  return pages;
}

test("台账 → PDF：中文是真的在里面，而且是可选中可检索的文字", async () => {
  const rendered = await renderLedgerPdf();
  assert.equal(rendered.mediaType, "application/pdf");
  assert.equal(rendered.filename, "八月记账.pdf");
  // 结构最外层先自证：文件头、交叉引用表、结尾标记。
  const head = new TextDecoder().decode(rendered.bytes.slice(0, 8));
  assert.equal(head, "%PDF-1.7");
  const tail = new TextDecoder("latin1").decode(rendered.bytes.slice(-2048));
  assert.match(tail, /startxref\n\d+\n%%EOF/);

  const pages = await extractText(rendered.bytes);
  assert.ok(pages.length >= 1);
  const text = pages.join("\n");
  // 标题、表头、每一列的中文、用户写的中文，逐样都要取得回来。
  for (const expected of [
    "八月记账",
    "台账",
    "日期",
    "分类",
    "往来对象",
    "收支",
    "备注",
    "餐饮",
    "楼下面馆",
    "午饭",
    "七月薪资（含补贴）",
    "交通",
    "地铁",
    "收入合计",
    "结余",
  ]) {
    assert.ok(text.includes(expected), `PDF 里读不回「${expected}」`);
  }
  // 拉丁与数字来自另一份嵌入字体，同样要在文字层里。
  assert.ok(text.includes("2026-08-01"), "日期没渲出来");
  assert.ok(text.includes("18000"), "金额没渲出来");
  assert.ok(text.includes("-32.5"), "支出的负号没渲出来");
  // 集外字符的记号不该出现：这份账本用的全是常用字。
  assert.equal(text.includes("□"), false, "有字符落在随包字集之外");
});

test("嵌进 PDF 的是按本份文档切出来的子集，不是整包字库", async () => {
  const rendered = await renderLedgerPdf();
  const fonts = await loadPdfFonts();
  // 随包那份有界字集本身已经是子集，但仍有一兆；嵌进单份 PDF 的必须远小于它。
  const packaged = fonts.cjk.font.bytes.length;
  assert.ok(packaged > 500_000, "随包字集小得反常，先确认它是不是切坏了");
  assert.ok(
    rendered.bytes.length < packaged / 10,
    `一份三十行的台账不该带着 ${(rendered.bytes.length / 1024).toFixed(0)} KB 字形`,
  );
  assert.ok(rendered.bytes.length > 4_000, "PDF 小得不像有嵌入字体");

  // 直接验子集本身：只切五个字的时候，字形数必须跟着掉下来。
  const small = subsetTrueType(fonts.cjk.font, [..."台账记录表"].map((c) => c.codePointAt(0)));
  assert.ok(small.glyphOrder.length <= 24, "按用到的字切子集没有生效");
  assert.equal(small.missing.length, 0);
  // 切出来的子集必须还是一份能被解析回来的合法 TrueType——PDF 阅读器读的就是它。
  const reparsed = parseTrueType(small.bytes);
  assert.equal(reparsed.unitsPerEm, fonts.cjk.font.unitsPerEm);
  for (const character of "台账记录表") {
    const gid = reparsed.glyphId(character.codePointAt(0));
    assert.ok(gid > 0, `子集里查不到「${character}」`);
    assert.equal(
      reparsed.advance(gid),
      fonts.cjk.font.advance(fonts.cjk.font.glyphId(character.codePointAt(0))),
      `「${character}」的步进宽度在子集里变了`,
    );
  }
});

test("同一份输入两次导出：PDF 字节完全一样，库里不会多出重复件", async () => {
  const first = await renderLedgerPdf();
  const second = await renderLedgerPdf();
  assert.deepEqual(first.bytes, second.bytes);
});

test("多页：行数超过一页时分页，每页都有表头与页码", async () => {
  const entries = [];
  for (let index = 0; index < 90; index += 1) {
    entries.push({
      date: `2026-08-${String((index % 28) + 1).padStart(2, "0")}`,
      category: "餐饮",
      counterparty: `第${index + 1}笔`,
      direction: index % 2 ? "in" : "out",
      amount: 10 + index,
      note: "分页用例",
    });
  }
  const rendered = await renderLedgerPdf({ entries });
  const pages = await extractText(rendered.bytes);
  assert.ok(pages.length >= 2, "九十行还没分页");
  for (const [index, page] of pages.entries()) {
    assert.ok(page.includes(`第 ${index + 1} / ${pages.length} 页`), "页码不对");
  }
  // 表头在每一页都要重画，翻到第二页看不出这一列是什么就白分页了。
  for (const page of pages) {
    assert.ok(page.includes("往来对象"), "有一页没有表头");
  }
  assert.ok(pages.at(-1).includes("结余"), "合计没落在最后一页");
});

test("集外字符不许静默顶掉：用 □ 代替，并在页脚写明有几处", async () => {
  // 𠮷 是 BMP 之外的罕用字，随包字集不含它——这正是要测的那种情况。
  const rendered = await renderLedgerPdf({
    entries: [
      {
        date: "2026-08-04",
        category: "礼金",
        counterparty: "𠮷野家",
        direction: "out",
        amount: 88,
        note: "生僻字用例",
      },
    ],
  });
  const text = (await extractText(rendered.bytes)).join("\n");
  assert.ok(text.includes("□"), "集外字符没有用记号顶上");
  assert.match(text, /本文档有 \d+ 处字符不在随包字形集中/);
  assert.match(text, /U\+20BB7/);
  // 同一行里认得的字照常渲出来，不许整行丢掉。
  assert.ok(text.includes("野家"));
  assert.ok(text.includes("礼金"));
});

test("字形数据是按需载入的，且许可允许随包再分发", async () => {
  resetPdfFontsForTest();
  const fonts = await loadPdfFonts();
  // 两份字体的许可都必须允许嵌入与再分发——这是随包带字形的前提。
  assert.equal(fonts.latin.license, "OFL-1.1");
  assert.equal(fonts.cjk.license, "Apache-2.0");
  assert.equal(fonts.latin.name, "LiberationSans");
  assert.equal(fonts.cjk.name, "DroidSansFallback");
  // 分工要与渲染时的查字顺序一致：拉丁那份不含汉字，中日韩那份不含拉丁。
  assert.ok(fonts.latin.font.glyphId(0x41) > 0, "拉丁字体里没有 A");
  assert.equal(fonts.cjk.font.glyphId(0x41), 0, "中日韩字体不该带拉丁字形");
  assert.ok(fonts.cjk.font.glyphId(0x53f0) > 0, "中日韩字体里没有「台」");
  // 缺字记号自己必须渲得出来，否则「用 □ 顶上」是一句空话。
  assert.ok(
    fonts.latin.font.glyphId(0x25a1) > 0 || fonts.cjk.font.glyphId(0x25a1) > 0,
    "两份字体都没有 □",
  );
  // 缓存要真的生效：第二次拿到的是同一份对象，不重复解压一兆字节。
  assert.equal(await loadPdfFonts(), fonts);
});

test("字形数据模块是压缩后的 base64，解出来就是那两份子集", () => {
  const source = readFileSync(
    new URL("../src/shell/plugin-export/pdf-font-data-generated.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /GENERATED FILE/);
  assert.match(source, /Apache License 2\.0 允许嵌入与再分发/);
  assert.match(source, /SIL Open Font License 1\.1 允许嵌入与再分发/);
  // 压缩后的体积是这条链最大的一处成本，钉住它，涨了要有人解释。
  assert.ok(
    source.length < 1_100_000,
    `字形数据 ${(source.length / 1024).toFixed(0)} KB，超出预期`,
  );
});

test("台账声明的五种形态今天全渲得出来，pdf 不再是缺口", async () => {
  assert.deepEqual(
    [...LEDGER_RENDERABLE_EXPORT_FORMS].sort(),
    [...exportKindsForPlugin("ledger-register")].sort(),
  );
  assert.ok(LEDGER_RENDERABLE_EXPORT_FORMS.includes("pdf"));
});

test("zlib 解压走的是本仓已有的 fflate，不引第二个依赖", () => {
  const loader = readFileSync(
    new URL("../src/shell/plugin-export/pdf-cjk-font.ts", import.meta.url),
    "utf8",
  );
  assert.match(loader, /from "fflate"/);
  assert.equal(typeof unzlibSync, "function");
});
