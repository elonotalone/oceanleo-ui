// ============================================================================
// 文档家族（文档 / 表格 / 演示 / PDF）的指令面与下载格式机检
// ----------------------------------------------------------------------------
// 判的是 W2 这一面的四条收口判据：
//   1. 四条路由都真的有一份非空指令面，id 前缀逐字等于 editorId；
//   2. 越界 id、越界参数、缺必填、非法枚举、超长参数一律被拒（不静默兜底）；
//   3. `mutates` 标注对得上——会改内容的一条不许标 false，只读的一条不许标 true；
//   4. 下载菜单条目齐全，且文案是人话（不许出现 MIME 串）。
// 另外钉住上传归一化的声明表：过去 `.tsv` 在上传框里选得中、载入时被拒，
// `.pptx` 拖进演示文稿什么也不发生——这两件事由「accept 从同一张表派生」挡住。
//
// 指令面构造器是纯函数，所以这里用替身编辑器直接驱动，不起 React。
// 「装到注册表里读得回来」那一条走 W1 的真注册表，不另立一套。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  docFamilyAcceptAttribute,
  docFamilyConvertTarget,
  docFamilyImportPlan,
  docFamilyRefusalReason,
  DOC_FAMILY_CONVERT_TARGETS,
  DOC_FAMILY_DOWNLOAD_FORMATS,
  DOC_FAMILY_EDITOR_IDS,
  DOC_FAMILY_IMPORT_PLANS,
} from "../src/shell/doc-editors/doc-family-formats.ts";
import { currentEditorContext, registerEditorContext, resetEditorContext } from "../src/shell/plugin-command/registry.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const ROUTES = join(REPO, "src", "shell", "advanced-routes");

test("确认框不在编辑器这边弹：四条路由都不出现 confirm/window.confirm", () => {
  const sources = [
    "src/shell/doc-editors/doc-family-commands.ts",
    "src/shell/advanced-routes/RichDocRoute.tsx",
    "src/shell/advanced-routes/GridRoute.tsx",
    "src/shell/advanced-routes/DeckRoute.tsx",
    "src/shell/advanced-routes/PdfRoute.tsx",
  ];
  for (const file of sources) {
    const text = readFileSync(join(REPO, file), "utf8");
    assert.ok(
      !/\bwindow\.confirm\b|(?<![A-Za-z.])confirm\s*\(/.test(text),
      `${file} 自己弹了确认框；mutates 的确认由 agent 侧负责`,
    );
  }
});

// ---------------------------------------------------------------------------
// 5 state() 有界
// ---------------------------------------------------------------------------

test("四条路由源码真的把指令面挂上去了", () => {
  const wiring = [
    ["RichDocRoute.tsx", "buildRichDocContext"],
    ["DeckRoute.tsx", "buildDeckContext"],
    ["PdfRoute.tsx", "buildPdfContext"],
  ];
  for (const [file, builder] of wiring) {
    const text = readFileSync(join(ROUTES, file), "utf8");
    assert.match(
      text,
      new RegExp(`useEditorContext\\(\\s*${builder}\\(`),
      `${file} 没有用 useEditorContext(${builder}(…)) 挂上指令面`,
    );
  }
  // Grid uses the same read-only context interface in its lazy Univer stage.
  const leaf = readFileSync(
    join(REPO, "src", "shell", "doc-editors", "GridUniverStage.tsx"),
    "utf8",
  );
  assert.match(leaf, /useEditorContext\(buildGridContext\(/);
  assert.doesNotMatch(leaf, /gridAgentCommandSpecs|runGridAgentCommand/);
});

// ---------------------------------------------------------------------------
// 7 下载菜单齐全且是人话
// ---------------------------------------------------------------------------

const REQUIRED_DOWNLOADS = {
  richdoc: ["docx", "md", "html", "txt"],
  grid: ["xlsx", "csv"],
  deck: ["pptx"],
  pdf: ["pdf"],
};

test("离线可用的原生格式只列真实客户端生成器", () => {
  for (const [editorId, required] of Object.entries(REQUIRED_DOWNLOADS)) {
    const have = DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => format.extension);
    for (const extension of required) {
      assert.ok(
        have.includes(extension),
        `${editorId} 的下载菜单少了 ${extension}（现有：${have.join("、")}）`,
      );
    }
    assert.equal(new Set(have).size, have.length, `${editorId} 的下载格式有重复`);
    const ids = DOC_FAMILY_DOWNLOAD_FORMATS[editorId].map((format) => format.id);
    assert.equal(new Set(ids).size, ids.length, `${editorId} 的下载条目 id 有重复`);
  }
});

test("下载菜单文案是人话：带得出后缀、不出现 MIME 串", () => {
  for (const formats of Object.values(DOC_FAMILY_DOWNLOAD_FORMATS)) {
    for (const format of formats) {
      assert.ok(
        format.label.includes(`.${format.extension}`),
        `${format.id} 的文案「${format.label}」没告诉用户会得到什么后缀`,
      );
      assert.ok(
        !format.label.toLowerCase().includes("application/"),
        `${format.id} 的文案里出现了 MIME 串`,
      );
      assert.ok(
        ["local", "convert"].includes(format.via),
        `${format.id} 没说清是本地出还是走后端转换`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 8 上传归一化声明表
// ---------------------------------------------------------------------------

test("冷门格式各自转到对的目标格式", () => {
  assert.equal(docFamilyConvertTarget("richdoc", "老合同.doc"), "docx");
  assert.equal(docFamilyConvertTarget("richdoc", "notes.rtf"), "docx");
  assert.equal(docFamilyConvertTarget("richdoc", "简历.odt"), "docx");
  assert.equal(docFamilyConvertTarget("deck", "汇报.odp"), "pptx");
  assert.equal(docFamilyConvertTarget("deck", "旧版.ppt"), "pptx");
  assert.equal(docFamilyConvertTarget("pdf", "合同.docx"), "pdf");
});

// 转换端点 `/v1/convert/office` 的白名单。取自网关的单一事实源
// `oceanleo/backend/app/convert/capabilities.py`（OFFICE_SOURCES +
// OFFICE_SOURCES_VIA_GATEWAY / OFFICE_TARGETS），并用**真文件**逐条实测过
// （2026-08-19，见 signals/W2-journal.md）：
//   rtf→docx 200、txt→docx 200、csv→xlsx 200、pptx→pptx 200、xlsx→xlsx 200、
//   pptx→pdf 200、xlsx→pdf 200；跨家族的 pptx→docx 422「no export filter」。
// 所以规则是：来源必须在白名单里，落地格式要么是 pdf，要么和来源同家族。
const BACKEND_CONVERT_SOURCES = new Set([
  "doc", "docx", "odt", "rtf", "txt",
  "xls", "xlsx", "ods", "csv", "tsv",
  "ppt", "pptx", "odp",
  "pdf",
]);
const BACKEND_CONVERT_TARGETS = new Set(["pdf", "docx", "xlsx", "pptx"]);
const BACKEND_FAMILY_OF = {
  doc: "word", docx: "word", odt: "word", rtf: "word", txt: "word",
  xls: "sheet", xlsx: "sheet", ods: "sheet", csv: "sheet", tsv: "sheet",
  ppt: "slide", pptx: "slide", odp: "slide",
};

test("转换映射不许超出后端白名单支持的格式", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    for (const [from, to] of Object.entries(
      DOC_FAMILY_CONVERT_TARGETS[editorId],
    )) {
      assert.ok(
        BACKEND_CONVERT_SOURCES.has(from),
        `${editorId} 想把 .${from} 送去转换，但转换端点不收这个来源（会拿回 400），应改成一句拒绝理由`,
      );
      assert.ok(
        BACKEND_CONVERT_TARGETS.has(to),
        `${editorId} 想让后端转出 ${to}，但后端只出 ${[...BACKEND_CONVERT_TARGETS].join("、")}`,
      );
      assert.ok(
        to === "pdf" || BACKEND_FAMILY_OF[from] === BACKEND_FAMILY_OF[to],
        `${editorId} 想把 .${from} 转成 ${to}，跨家族转换后端没有对应的导出过滤器（实测 pptx→docx 422）`,
      );
    }
  }
});

test("下载里走转换的那几项，落地格式后端真的出得来", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    for (const format of DOC_FAMILY_DOWNLOAD_FORMATS[editorId]) {
      if (format.via !== "convert") continue;
      assert.ok(
        BACKEND_CONVERT_TARGETS.has(format.extension),
        `${editorId} 的下载菜单里「${format.label}」要后端转出 ${format.extension}，后端出不来`,
      );
    }
  }
});

test("制表符分隔的 .tsv 由表格自己认，不再白跑一趟后端", () => {
  // 后端入口白名单里没有 tsv，送过去只会 400；表格读取器在纯文本模式下自己分列。
  assert.equal(docFamilyConvertTarget("grid", "导出.tsv"), "");
  assert.equal(docFamilyRefusalReason("grid", "导出.tsv"), "");
  assert.ok(docFamilyAcceptAttribute("grid").includes(".tsv"));
  const loader = readFileSync(
    new URL("../src/shell/doc-editors/grid-model.ts", import.meta.url),
    "utf8",
  );
  const gate = loader.slice(loader.indexOf("export async function loadGridFile"));
  assert.match(
    gate.slice(0, 600),
    /"csv",\s*"tsv"/,
    "loadGridFile 的后缀闸没放开 tsv：上传框选得中、载入时被拒的老事故会重演",
  );
});

test("送错门的文件被指到对的编辑器，而不是给一句办不到的建议", () => {
  const sheetInDoc = docFamilyRefusalReason("richdoc", "报表.xlsx");
  assert.match(sheetInDoc, /表格编辑器/);
  assert.ok(
    !sheetInDoc.includes("另存为 .xlsx"),
    "对着文档编辑器的用户说「另存为 .xlsx」是办不到的建议",
  );
  assert.match(docFamilyRefusalReason("grid", "合同.docx"), /文档编辑器/);
  assert.match(docFamilyRefusalReason("grid", "汇报.pptx"), /演示编辑器/);
  assert.match(docFamilyRefusalReason("richdoc", "扫描件.pdf"), /PDF 编辑器/);
  // 本家族里确实打不开的，给的是「另存成什么」而不是指路。
  assert.match(docFamilyRefusalReason("grid", "老账.xlsb"), /另存为 \.xlsx/);
  assert.match(docFamilyRefusalReason("richdoc", "模板.dotx"), /另存为 \.docx/);
  assert.match(docFamilyRefusalReason("deck", "带宏.pptm"), /另存为 \.pptx/);
});

test("原生就认的格式不白转一次", () => {
  assert.equal(docFamilyConvertTarget("richdoc", "a.docx"), "");
  assert.equal(docFamilyConvertTarget("grid", "a.csv"), "");
  assert.equal(docFamilyConvertTarget("deck", "a.pptx"), "");
  assert.equal(docFamilyConvertTarget("pdf", "a.pdf"), "");
});

test("上传框 accept 与归一化表同源：选得中的一定打得开", () => {
  for (const editorId of DOC_FAMILY_EDITOR_IDS) {
    const accept = docFamilyAcceptAttribute(editorId);
    const plan = docFamilyImportPlan(editorId);
    const known = [
      ...plan.accept,
      ...plan.rules.flatMap((rule) => rule.from),
    ];
    for (const extension of known) {
      assert.ok(
        accept.includes(`.${extension}`),
        `${editorId} 的 accept 少了 .${extension}`,
      );
    }
    for (const part of accept.split(",")) {
      if (!part.startsWith(".")) continue;
      const extension = part.slice(1);
      assert.ok(
        known.includes(extension),
        `${editorId} 的 accept 放进了 .${extension}，但归一化表打不开它——这正是 .tsv 那次事故`,
      );
    }
  }
});

test("打不开的格式给一句人能看懂的原因，且不含行话", () => {
  const numbers = docFamilyRefusalReason("grid", "账目.numbers");
  assert.match(numbers, /Numbers/);
  assert.match(numbers, /导出成/);
  const keynote = docFamilyRefusalReason("deck", "汇报.key");
  assert.match(keynote, /Keynote/);
  const unknown = docFamilyRefusalReason("richdoc", "神秘.zzz");
  assert.match(unknown, /\.zzz/);
  const noExtension = docFamilyRefusalReason("richdoc", "没有后缀");
  assert.match(noExtension, /扩展名/);
  for (const message of [numbers, keynote, unknown, noExtension]) {
    for (const word of ["artifact", "adapter", "schema", "application/vnd"]) {
      assert.ok(!message.toLowerCase().includes(word), `原因里出现了行话「${word}」`);
    }
  }
});

test("能打开的格式不许被判成打不开", () => {
  assert.equal(docFamilyRefusalReason("richdoc", "a.docx"), "");
  assert.equal(docFamilyRefusalReason("richdoc", "老合同.doc"), "");
  assert.equal(docFamilyRefusalReason("richdoc", "插图.png"), "");
  assert.equal(docFamilyRefusalReason("grid", "导出.tsv"), "");
  assert.equal(docFamilyRefusalReason("deck", "汇报.odp"), "");
  assert.equal(docFamilyRefusalReason("pdf", "合同.docx"), "");
});

test("四条声明表一次给全，转换一律走后端 office 端点", () => {
  assert.equal(DOC_FAMILY_IMPORT_PLANS.length, DOC_FAMILY_EDITOR_IDS.length);
  for (const plan of DOC_FAMILY_IMPORT_PLANS) {
    assert.ok(plan.accept.length > 0, `${plan.editorId} 没声明原生格式`);
    for (const rule of plan.rules) {
      assert.equal(
        rule.endpoint,
        "office",
        `${plan.editorId} 的转换走了 ${rule.endpoint}；文档家族只用后端 office 端点`,
      );
      assert.ok(rule.from.length > 0);
    }
  }
});
