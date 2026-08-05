// 应用内功能件的导出链（W15）。
//
// 锁住四件事：
//   ① 台账导出 Excel 产出一件合法、可下载的素材条目，并落进「我的库」；
//   ② 同一份数据换一种形态导出，产出第二件互相独立的素材；
//   ③ 软件本身既不进库也不可下载——反面用例，这是红线的机检；
//   ④ 同样的输入两次导出得到同样的字节与同样的幂等键，库里不会长出重复件。
//
// 假网关只假到网络这一层：投影规范化、下载闸门判定都用的是真实实现
// （`artifact-contract.ts` 的 `normalizeArtifactProjection` 与
// `artifactDownloadPlanFor`），所以「可下载」这个结论不是打桩打出来的。

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { strFromU8, unzipSync } from "fflate";

import {
  artifactDownloadPlanFor,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  MATERIAL_ARTIFACT_TYPES,
  PLUGIN_EXPORT_FORMS,
  exportKindsForPlugin,
  isMaterialArtifactType,
  libraryEntryIsDownloadableMaterial,
  libraryEntryIsRuntimeSurface,
  normalizePluginExportRequest,
  pluginExportForm,
} from "../src/shell/plugin-export/plugin-export-contract.ts";
import {
  PLUGIN_EXPORT_CATALOG,
  PLUGIN_EXPORT_CATALOG_GENERATED_AT,
} from "../src/shell/plugin-export/export-catalog.ts";
import { renderPluginExport } from "../src/shell/plugin-export/plugin-export-render.ts";
import { exportToLibrary } from "../src/shell/plugin-export/plugin-export-runtime.ts";
import {
  LEDGER_EXPORT_FORMS,
  LEDGER_RENDERABLE_EXPORT_FORMS,
  LEDGER_SOURCE_ID,
  ledgerExportRequest,
} from "../src/shell/plugin-export/ledger-export.ts";

const REGISTRY_VIEW =
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-app-plugins.json";

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
      note: "七月薪资 <含补贴>",
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

const MEDIA_BY_FORMAT = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  html: "text/html",
  svg: "image/svg+xml",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/**
 * 假网关：上传返回一条文件行，ensure 按 transient 声明的载体登记一件 artifact。
 * `artifactTypeOverride` 用来模拟「网关把导出结果登记成运行时工程态」这种
 * 必须被拒的情况。
 */
function gateway({ artifactTypeOverride = "", uploadOk = true } = {}) {
  const uploads = [];
  const ensures = [];
  const announced = [];
  let counter = 0;
  return {
    uploads,
    ensures,
    announced,
    dependencies: {
      upload: async (file, options) => {
        counter += 1;
        uploads.push({
          filename: file.name,
          mediaType: file.type,
          byteLength: file.size,
          options,
        });
        if (!uploadOk) {
          return { ok: false, error: "上传失败" };
        }
        return {
          ok: true,
          data: {
            file: {
              id: `file-${counter}`,
              url: `https://signed.test/${counter}-${file.name}`,
              site_id: options.siteId,
              meta: {},
            },
          },
        };
      },
      ensure: async (transient) => {
        ensures.push(transient);
        const artifactType = artifactTypeOverride || transient.artifactType;
        const wire = {
          schema: "oceanleo.artifact.v1",
          artifact_id: `artifact-${ensures.length}`,
          revision_id: `r-${ensures.length}`,
          artifact_type: artifactType,
          roles: ["deliverable"],
          title: transient.title,
          favorite: false,
          owner: { principal_id: "user-w15", visibility: "private" },
          access: {
            can_read: true,
            can_preview: true,
            can_edit: false,
            can_fork: false,
            can_insert: false,
            can_replace: false,
            can_favorite: true,
            can_bind: false,
            can_export_source: true,
          },
          editability: "view_only",
          editor_capability: null,
          source_format: transient.sourceFormat,
          renditions: {
            preview: {
              purpose: "preview",
              revision_id: `r-${ensures.length}`,
              url: `${transient.renditionUrl}#preview`,
              format: "png",
              media_type: "image/png",
            },
            source: {
              purpose: "source",
              revision_id: `r-${ensures.length}`,
              url: transient.renditionUrl,
              format: transient.sourceFormat,
              media_type:
                MEDIA_BY_FORMAT[transient.sourceFormat] ||
                "application/octet-stream",
              digest: `sha256:${transient.payloadDigest}`,
            },
          },
          provenance: {
            id: `provenance-${ensures.length}`,
            source_kind: "owned",
            license_code: "owned",
          },
          integrity: { ok: true, code: "ok", reason: "" },
          context_bindings: [],
        };
        const projection = normalizeArtifactProjection(wire);
        assert.ok(projection, "假网关造出的投影必须能按 rich v1 规范化");
        return { ok: true, data: artifactProjectionToLibraryItem(projection) };
      },
      // 真实的下载判定，不是打桩：产物拿不到合同要求的交付 rendition 就是不可下载。
      downloadEvidence: (item) => {
        const [candidate] = item.artifact
          ? artifactDownloadPlanFor(item.artifact)
          : [];
        return candidate
          ? { visible: true, available: true, reason: "" }
          : {
              visible: true,
              available: false,
              reason: "当前 revision 缺少符合能力合同的真实交付 rendition。",
            };
      },
      announce: (item, via) => announced.push({ item, via }),
    },
  };
}

function runtimeStateItem(artifactType) {
  const wire = {
    schema: "oceanleo.artifact.v1",
    artifact_id: `runtime-${artifactType}`,
    revision_id: "r1",
    artifact_type: artifactType,
    roles: ["project"],
    title: "未命名可算文档（空白起手）",
    favorite: false,
    owner: { principal_id: "user-w15", visibility: "private" },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: false,
      can_insert: false,
      can_replace: false,
      can_favorite: false,
      can_bind: false,
      can_export_source: false,
    },
    editability: "view_only",
    editor_capability: null,
    source_format: "",
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "r1",
        url: "https://signed.test/runtime-preview.png",
        format: "png",
        media_type: "image/png",
      },
    },
    provenance: {
      id: "provenance-runtime",
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
  const projection = normalizeArtifactProjection(wire);
  assert.ok(projection);
  return artifactProjectionToLibraryItem(projection);
}

function exportLedger(form, deps, overrides = {}) {
  return exportToLibrary(
    ledgerExportRequest(LEDGER, form, {
      siteId: "home",
      appId: "personal-ledger",
      exportedAt: "2026-08-05T04:00:00.000Z",
      ...overrides,
    }),
    deps,
  );
}

/* ------------------------------ P1 导出契约 ------------------------------ */

test("形态闭集与 W10 清册逐字一致，每一种都落在可下载的成品载体上", () => {
  assert.deepEqual(
    PLUGIN_EXPORT_FORMS.map((form) => form.id),
    ["xlsx", "csv", "html", "long-image", "docx", "pdf", "srt", "vtt"],
  );
  const declared = new Set(
    Object.values(PLUGIN_EXPORT_CATALOG).flatMap((entry) => entry.exportKinds),
  );
  assert.deepEqual(
    [...declared].sort(),
    ["csv", "docx", "html", "long-image", "pdf", "srt", "vtt", "xlsx"],
    "清册用到的形态必须全在形态表里，形态表也不许多出没人用的取值",
  );
  for (const form of PLUGIN_EXPORT_FORMS) {
    assert.ok(
      isMaterialArtifactType(form.artifactType),
      `${form.id} 的产物必须是十三类载体之一`,
    );
    assert.ok(form.mediaType && form.extension && form.sourceFormat);
    assert.equal(
      form.renderable || Boolean(form.unavailableReason),
      true,
      `${form.id} 渲不出来就必须说清缺什么`,
    );
  }
  // 运行时工程态两类永远不在成品载体表里。
  for (const type of ["geo_map", "interactive_doc"]) {
    assert.ok(!MATERIAL_ARTIFACT_TYPES.includes(type));
  }
  for (const sourceKind of ["editor", "standalone"]) {
    const normalized = normalizePluginExportRequest({
      ...ledgerExportRequest(LEDGER, "xlsx", { siteId: "home" }),
      sourceKind,
    });
    assert.equal(normalized.ok, true, `${sourceKind} 应当可以导出`);
  }
});

test("逐工具的形态清单是清册的发布副本，没有漂移", { skip: !existsSync(REGISTRY_VIEW) }, () => {
  const view = JSON.parse(readFileSync(REGISTRY_VIEW, "utf8"));
  assert.equal(view.schema, "oceanleo.app-plugins.v1");
  // 清册重算不必然改内容，所以判据是逐条内容一致；`generatedAt` 只作出处记录。
  assert.match(PLUGIN_EXPORT_CATALOG_GENERATED_AT, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    Object.keys(PLUGIN_EXPORT_CATALOG).sort(),
    Object.keys(view.plugins).sort(),
  );
  for (const [id, entry] of Object.entries(view.plugins)) {
    assert.deepEqual(
      PLUGIN_EXPORT_CATALOG[id].exportKinds,
      entry.exportKinds,
      `${id} 的形态清单与清册不一致`,
    );
    assert.equal(PLUGIN_EXPORT_CATALOG[id].label, entry.label);
    assert.equal(PLUGIN_EXPORT_CATALOG[id].family, entry.family);
  }
});

test("台账的形态清单来自清册，不是抄的", () => {
  assert.deepEqual(exportKindsForPlugin(LEDGER_SOURCE_ID), [
    "xlsx",
    "csv",
    "pdf",
    "long-image",
    "html",
  ]);
  assert.deepEqual(LEDGER_EXPORT_FORMS, exportKindsForPlugin(LEDGER_SOURCE_ID));
  assert.deepEqual(LEDGER_RENDERABLE_EXPORT_FORMS, [
    "xlsx",
    "csv",
    "long-image",
    "html",
  ]);
});

test("清册没给这个工具声明的形态，一律拒绝", () => {
  const rejected = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, "srt", { siteId: "home" }),
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "form-not-declared");
  assert.match(rejected.error, /台账没有声明/);
  // 换算器只有 xlsx / long-image，docx 同样越界。
  const converter = normalizePluginExportRequest({
    ...ledgerExportRequest(LEDGER, "docx", { siteId: "home" }),
    sourceId: "unit-converter",
    sourceLabel: "换算器",
  });
  assert.equal(converter.ok, false);
  assert.equal(converter.code, "form-not-declared");
});

test("PDF 与字幕形态明确拒绝，并说清缺什么", () => {
  assert.equal(pluginExportForm("pdf").renderable, false);
  const rejected = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, "pdf", { siteId: "home" }),
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "form-not-renderable");
  assert.match(rejected.error, /中文字形/);
  for (const id of ["srt", "vtt"]) {
    assert.equal(pluginExportForm(id).renderable, false);
    assert.match(pluginExportForm(id).unavailableReason, /时间轴/);
  }
});

test("没有数据时不导出空文件", () => {
  const rejected = normalizePluginExportRequest(
    ledgerExportRequest({ entries: [] }, "xlsx", { siteId: "home" }),
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "empty-payload");
});

/* --------------------------- P2/P3 两条端到端链 --------------------------- */

test("台账 → Excel：产出一件合法的 xlsx 素材，落进我的库并可下载", async () => {
  const fake = gateway();
  const result = await exportLedger("xlsx", fake.dependencies);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  assert.equal(result.form.id, "xlsx");
  assert.equal(result.filename, "八月记账.xlsx");
  assert.equal(result.artifactTypeMatchesForm, true);

  // 上传走的是文件库那条既有通路，带稳定幂等键。
  assert.equal(fake.uploads.length, 1);
  assert.equal(
    fake.uploads[0].mediaType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.match(
    fake.uploads[0].options.idempotencyKey,
    new RegExp(`^plugin-export-v1:${LEDGER_SOURCE_ID}:xlsx:[0-9a-f]{24}$`),
  );
  assert.equal(fake.uploads[0].options.registerAsset, false);

  // 库条目：durable、是成品、标题带形态。
  const item = result.item;
  assert.equal(item.artifactType, "grid");
  assert.equal(item.title, "八月记账（Excel 表格）");
  assert.equal(libraryEntryIsDownloadableMaterial(item), true);
  assert.ok(artifactDownloadPlanFor(item.artifact).length > 0);
  assert.equal(fake.announced.length, 1);
  assert.equal(fake.announced[0].item.artifactId, item.artifactId);

  // 来源写进 ensure 的 provenance —— 库表没有「谁导出的」这一列。
  const provenance = fake.ensures[0].provenance;
  assert.equal(provenance.export_schema, "oceanleo.plugin-export.v1");
  assert.equal(provenance.export_form, "xlsx");
  assert.equal(provenance.export_source_id, LEDGER_SOURCE_ID);
  assert.equal(provenance.export_source_label, "台账");
  assert.equal(provenance.app_id, "personal-ledger");
});

test("导出的 xlsx 是一个部件齐全、数值真的在里面的工作簿", () => {
  const normalized = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, "xlsx", {
      siteId: "home",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(normalized.ok, true);
  const rendered = renderPluginExport(normalized.request);
  assert.equal(rendered.bytes[0], 0x50);
  assert.equal(rendered.bytes[1], 0x4b);
  const parts = unzipSync(rendered.bytes);
  for (const name of [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/core.xml",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    assert.ok(parts[name], `xlsx 缺部件 ${name}`);
  }
  const sheet = strFromU8(parts["xl/worksheets/sheet1.xml"]);
  assert.match(sheet, /<t xml:space="preserve">日期<\/t>/);
  assert.match(sheet, /<t xml:space="preserve">楼下面馆<\/t>/);
  // 收入为正、支出为负，直接求和即为结余。
  assert.match(sheet, /<v>18000<\/v>/);
  assert.match(sheet, /<v>-32\.5<\/v>/);
  assert.match(sheet, /<t xml:space="preserve">结余<\/t>/);
  // 用户输入里的尖括号必须被转义，不能带进 XML。
  assert.match(sheet, /七月薪资 &lt;含补贴&gt;/);
});

test("同一份数据换一种形态：产出第二件互相独立的素材", async () => {
  const fake = gateway();
  const excel = await exportLedger("xlsx", fake.dependencies);
  const html = await exportLedger("html", fake.dependencies);
  assert.equal(excel.ok, true);
  assert.equal(html.ok, true);

  assert.notEqual(excel.item.artifactId, html.item.artifactId);
  assert.notEqual(excel.idempotencyKey, html.idempotencyKey);
  assert.notEqual(excel.digest, html.digest);
  assert.equal(html.item.artifactType, "website");
  assert.equal(html.filename, "八月记账.html");
  assert.equal(html.item.title, "八月记账（网页）");
  assert.equal(libraryEntryIsDownloadableMaterial(html.item), true);
  assert.equal(fake.announced.length, 2);
  assert.equal(fake.uploads[1].mediaType, "text/html");
});

function render(form) {
  const normalized = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, form, {
      siteId: "home",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(normalized.ok, true, normalized.ok ? "" : normalized.error);
  return renderPluginExport(normalized.request);
}

test("网页与图文长图是自包含的成品文件，标记语言里的用户数据一律转义", () => {
  for (const form of ["html", "long-image"]) {
    const rendered = render(form);
    const text = strFromU8(rendered.bytes);
    assert.match(text, /八月记账/);
    assert.match(text, /楼下面馆/);
    // 用户写的尖括号必须是实体，不能变成标记。
    assert.doesNotMatch(text, /<含补贴>/);
    assert.ok(rendered.bytes.length > 500);
  }
  const poster = render("long-image");
  const svg = strFromU8(poster.bytes);
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(svg, /width="1080"/);
  assert.equal(poster.mediaType, "image/svg+xml");
});

test("CSV 带 BOM 与 CRLF，Excel 双击不乱码；含分隔符的字段加引号", () => {
  const rendered = render("csv");
  // BOM 要在字节里看：TextDecoder 解码时会把它吃掉。
  assert.deepEqual([...rendered.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  const text = strFromU8(rendered.bytes);
  assert.match(text, /\r\n/);
  const lines = text.replace(/^\ufeff/, "").trim().split("\r\n");
  assert.equal(lines[0], "日期,分类,往来对象,收支,金额（¥）,备注");
  assert.equal(lines[1], "2026-08-01,餐饮,楼下面馆,支出,-32.5,午饭");
  assert.match(text, /七月薪资 <含补贴>/);
  assert.match(text, /结余,¥17961\.50/);
  // 逗号与引号必须按 RFC 4180 转义，不能把一列劈成两列。
  const tricky = normalizePluginExportRequest({
    ...ledgerExportRequest(LEDGER, "csv", { siteId: "home" }),
    data: {
      columns: [{ key: "note", label: "备注" }],
      rows: [['他说 "买菜, 顺便"']],
    },
  });
  assert.equal(tricky.ok, true);
  assert.match(
    strFromU8(renderPluginExport(tricky.request).bytes),
    /"他说 ""买菜, 顺便"""/,
  );
});

test("docx 是部件齐全的 Word 包，正文里有表格与合计", () => {
  // 台账没有声明 docx；合同装配声明了 pdf/html/docx，所以这一条走它。
  const normalized = normalizePluginExportRequest({
    ...ledgerExportRequest(LEDGER, "docx", {
      siteId: "home",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
    sourceId: "contract-assembly",
    sourceLabel: "合同装配",
  });
  assert.equal(normalized.ok, true, normalized.ok ? "" : normalized.error);
  const rendered = renderPluginExport(normalized.request);
  assert.equal(rendered.bytes[0], 0x50);
  assert.equal(rendered.bytes[1], 0x4b);
  const parts = unzipSync(rendered.bytes);
  for (const name of [
    "[Content_Types].xml",
    "_rels/.rels",
    "docProps/core.xml",
    "word/_rels/document.xml.rels",
    "word/document.xml",
  ]) {
    assert.ok(parts[name], `docx 缺部件 ${name}`);
  }
  const document = strFromU8(parts["word/document.xml"]);
  assert.match(document, /<w:tbl>/);
  assert.match(document, /楼下面馆/);
  assert.match(document, /结余：¥17961\.50/);
  assert.match(document, /七月薪资 &lt;含补贴&gt;/);
});

test("同样的输入两次导出：字节与幂等键都一样，库里不会多出重复件", async () => {
  const fake = gateway();
  const first = await exportLedger("xlsx", fake.dependencies);
  const second = await exportLedger("xlsx", fake.dependencies);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.digest, second.digest);
  assert.equal(first.idempotencyKey, second.idempotencyKey);
  assert.equal(
    fake.uploads[0].options.idempotencyKey,
    fake.uploads[1].options.idempotencyKey,
  );
});

/* -------------------- P4 反面：软件本身不进库、不可下载 -------------------- */

test("反面：运行时工程态不是可下载的成品，进不了我的库", () => {
  for (const artifactType of ["geo_map", "interactive_doc"]) {
    const item = runtimeStateItem(artifactType);
    assert.equal(libraryEntryIsRuntimeSurface(item), true);
    assert.equal(
      libraryEntryIsDownloadableMaterial(item),
      false,
      `${artifactType} 不该被当成可下载的成品`,
    );
    // 今天的下载闸门并不会拦住它：拿不到成品就把预览图当交付物发出去。
    // 这正是准入判据必须在闸门之前先拦一道的原因——用户要的是成品，
    // 不是一张工程态的截图。
    const [candidate] = artifactDownloadPlanFor(item.artifact);
    assert.equal(candidate?.mode, "export");
    assert.equal(candidate?.purpose, "preview");
  }
  // 显式标记自己是运行时面的条目，同样进不来。
  const marked = runtimeStateItem("geo_map");
  const disguised = {
    ...marked,
    artifactType: "grid",
    artifact: { ...marked.artifact, artifactType: "grid" },
    meta: { ...marked.meta, oceanleo_surface: "runtime" },
  };
  assert.equal(libraryEntryIsDownloadableMaterial(disguised), false);
});

test("反面：网关把导出结果登记成运行时工程态时，这条链就地终止", async () => {
  const fake = gateway({ artifactTypeOverride: "interactive_doc" });
  const result = await exportLedger("xlsx", fake.dependencies);
  assert.equal(result.ok, false);
  assert.equal(result.code, "not-a-material");
  // 没有通告库，也就不会在我的库里出现，更谈不上下载。
  assert.equal(fake.announced.length, 0);
});

test("反面：下载闸门说不可下载，就不算导出成功", async () => {
  const fake = gateway();
  const result = await exportLedger("xlsx", {
    ...fake.dependencies,
    downloadEvidence: () => ({
      visible: true,
      available: false,
      reason: "当前 revision 缺少符合能力合同的真实交付 rendition。",
    }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "not-downloadable");
  assert.match(result.error, /真实交付 rendition/);
  assert.equal(fake.announced.length, 0);
});

test("反面：上传失败不会伪造一件库条目", async () => {
  const fake = gateway({ uploadOk: false });
  const result = await exportLedger("xlsx", fake.dependencies);
  assert.equal(result.ok, false);
  assert.equal(result.code, "upload-failed");
  assert.equal(fake.ensures.length, 0);
  assert.equal(fake.announced.length, 0);
});

test("「我的库」在两处收口都过了准入判据", () => {
  const source = readFileSync(
    new URL("../src/shell/MyLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /libraryEntryIsDownloadableMaterial\(item\)/);
  assert.match(source, /libraryEntryIsDownloadableMaterial\(entry\.libraryItem\)/);
  assert.match(
    source,
    /from "\.\/plugin-export\/plugin-export-contract"/,
  );
});

test("导出链的文案里没有那个被 35 个站占用的内部概念名", () => {
  for (const file of [
    "export-catalog.ts",
    "plugin-export-contract.ts",
    "plugin-export-render.ts",
    "plugin-export-runtime.ts",
    "plugin-export-wiring.ts",
    "ledger-export.ts",
    "index.ts",
  ]) {
    const source = readFileSync(
      new URL(`../src/shell/plugin-export/${file}`, import.meta.url),
      "utf8",
    );
    assert.ok(
      !source.includes("插件"),
      `${file} 里出现了不许出现在文案里的那两个字`,
    );
  }
});
