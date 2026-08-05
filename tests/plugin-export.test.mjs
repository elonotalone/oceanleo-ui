// 应用内功能件的导出链（W15 起，W21 收口）。
//
// 锁住六件事：
//   ① 台账导出 Excel 产出一件合法、可下载的素材条目，并落进「我的库」；
//   ② 同一份数据换一种形态导出，产出第二件互相独立的素材；
//   ③ 两条端到端链的产物都能按库里的下载方案**原样取回字节**，不是只拿到一条记录；
//   ④ 软件本身既不进库也不可下载——反面用例，这是红线的机检；
//   ⑤ 同样的输入两次导出得到同样的字节与同样的幂等键，库里不会长出重复件；
//   ⑥ 全工程只有一套 id（L3 族 id），清册声明的每一种形态在导出链里都有确定结果。
//
// 假网关只假到网络这一层：投影规范化、下载闸门判定都用的是真实实现
// （`artifact-contract.ts` 的 `normalizeArtifactProjection` 与
// `artifactDownloadPlanFor`），所以「可下载」这个结论不是打桩打出来的。
// 取回字节这一步也是真的：假网关按 URL 存下上传的字节，用例按库条目算出来的
// 下载方案去同一个 URL 取，取到的必须与渲染出来的一模一样。

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { inflateSync } from "node:zlib";

import { strFromU8, unzipSync } from "fflate";

import {
  artifactDownloadPlanFor,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
  isDurableLibraryItem,
  libraryItemIdentityKey,
} from "../src/shell/library-data.ts";
import {
  pluginInitialStateIds,
  pluginInstanceLibraryItem,
} from "../src/shell/plugin-initial-state.ts";
import {
  GENERATED_APP_PLUGIN_MAP,
  GENERATED_PLUGIN_EXPORT_CATALOG,
} from "../src/shell/app-plugins-generated.ts";
import {
  MATERIAL_ARTIFACT_TYPES,
  PLUGIN_EXPORT_CATALOG,
  PLUGIN_EXPORT_CATALOG_GENERATED_AT,
  PLUGIN_EXPORT_FORMS,
  exportKindsForPlugin,
  isMaterialArtifactType,
  libraryEntryIsDownloadableMaterial,
  libraryEntryIsRuntimeSurface,
  normalizePluginExportRequest,
  pluginExportForm,
} from "../src/shell/plugin-export/plugin-export-contract.ts";
import { renderPluginExport } from "../src/shell/plugin-export/plugin-export-render.ts";
import { parseTrueType } from "../src/shell/plugin-export/truetype-subset.ts";
import {
  auditPluginExportCatalog,
  formatPluginExportAudit,
} from "../src/shell/plugin-export/plugin-export-audit.ts";
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
 *
 * 上传的字节按 URL 存进 `stored`，`fetchBytes()` 就是「用户点下载」那一步的
 * 非浏览器替身：库条目 → 下载方案 → 同一个 URL → 字节。
 */
function gateway({ artifactTypeOverride = "", uploadOk = true } = {}) {
  const uploads = [];
  const ensures = [];
  const announced = [];
  const stored = new Map();
  let counter = 0;
  return {
    uploads,
    ensures,
    announced,
    stored,
    /** 按库条目算出来的下载方案去取字节；取不到返回 null。 */
    fetchBytes: (item) => {
      const [candidate] = item.artifact
        ? artifactDownloadPlanFor(item.artifact)
        : [];
      const url = candidate?.rendition?.url || "";
      return stored.has(url) ? stored.get(url) : null;
    },
    dependencies: {
      upload: async (file, options) => {
        counter += 1;
        const bytes = new Uint8Array(await file.arrayBuffer());
        uploads.push({
          filename: file.name,
          mediaType: file.type,
          byteLength: file.size,
          bytes,
          options,
        });
        if (!uploadOk) {
          return { ok: false, error: "上传失败" };
        }
        // 真实签名 URL 是转义过的，这里照做：否则「取回字节」那一步会因为
        // 投影层归一化了 URL 而对不上，看起来像取不到，其实是假网关不真。
        const url = `https://signed.test/${counter}-${encodeURIComponent(
          file.name,
        )}`;
        stored.set(url, bytes);
        return {
          ok: true,
          data: {
            file: {
              id: `file-${counter}`,
              url,
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

/**
 * 临时改一处清册或形态表，跑一遍对账闸，再原样改回来。
 * 用来证明那道闸真的会红，不是恒返回空数组。
 */
async function auditWith(catalogPatch = {}, formPatch = {}) {
  const catalogBackup = new Map();
  const formBackup = new Map();
  for (const [id, patch] of Object.entries(catalogPatch)) {
    catalogBackup.set(id, PLUGIN_EXPORT_CATALOG[id].exportKinds);
    PLUGIN_EXPORT_CATALOG[id].exportKinds = patch.exportKinds;
  }
  for (const [id, patch] of Object.entries(formPatch)) {
    const form = pluginExportForm(id);
    formBackup.set(id, {
      renderable: form.renderable,
      unavailableReason: form.unavailableReason,
    });
    Object.assign(form, patch);
  }
  try {
    return await auditPluginExportCatalog();
  } finally {
    for (const [id, kinds] of catalogBackup) {
      PLUGIN_EXPORT_CATALOG[id].exportKinds = kinds;
    }
    for (const [id, snapshot] of formBackup) {
      Object.assign(pluginExportForm(id), snapshot);
    }
  }
}

/* ------------------------------ P1 导出契约 ------------------------------ */

test("形态闭集与 W10 清册逐字一致，每一种都落在可下载的成品载体上", () => {
  assert.deepEqual(
    PLUGIN_EXPORT_FORMS.map((form) => form.id),
    ["xlsx", "csv", "html", "long-image", "docx", "pdf"],
  );
  const declared = new Set(
    Object.values(PLUGIN_EXPORT_CATALOG).flatMap((entry) => entry.exportKinds),
  );
  assert.deepEqual(
    [...declared].sort(),
    ["csv", "docx", "html", "long-image", "pdf", "xlsx"],
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

test("逐工具的形态清单走生成物，与清册没有漂移", { skip: !existsSync(REGISTRY_VIEW) }, () => {
  const view = JSON.parse(readFileSync(REGISTRY_VIEW, "utf8"));
  assert.equal(view.schema, "oceanleo.app-plugins.v1");
  // W24 P2 之后这份清单不再是手抄的发布副本，而是 `scripts/sync-app-plugins.mjs`
  // 同步进来的生成物。判据因此有两层：形态清单读的确实是那份生成物，
  // 生成物又与清册逐条一致。
  assert.equal(
    PLUGIN_EXPORT_CATALOG,
    GENERATED_PLUGIN_EXPORT_CATALOG.plugins,
    "形态清单必须直接读生成物，不许在包里另存一份副本",
  );
  assert.equal(GENERATED_PLUGIN_EXPORT_CATALOG.schema, view.schema);
  assert.equal(GENERATED_PLUGIN_EXPORT_CATALOG.generatedAt, view.generatedAt);
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
    assert.equal(PLUGIN_EXPORT_CATALOG[id].runtime, entry.runtime);
    // 键就是族 id。清册那一列只用来确认这件事，生成物里不再另存一份 `family`：
    // 键与字段各存一份就是两个真相，改一处漏一处必然漂移。
    assert.equal(entry.family, id, `${id} 的键必须就是它的族 id`);
    assert.equal(
      "family" in PLUGIN_EXPORT_CATALOG[id],
      false,
      `${id} 不许再单存一个 family 字段`,
    );
    assert.equal(
      "doc" in PLUGIN_EXPORT_CATALOG[id],
      false,
      `${id} 的文档路径与导出无关，不该同步进共享包`,
    );
  }
});

test("发布副本已删除：包里不许再有第二份手抄的形态清单", () => {
  const directory = new URL("../src/shell/plugin-export/", import.meta.url);
  assert.equal(
    readdirSync(directory).includes("export-catalog.ts"),
    false,
    "export-catalog.ts 还在——那是清册之外的第二个真相",
  );
  // 反过来也要成立：判据真的接在生成物上，而不是在别处又硬编码了一份。
  const contract = readFileSync(
    new URL("plugin-export-contract.ts", directory),
    "utf8",
  );
  assert.match(contract, /from "\.\.\/app-plugins-generated"/);
});

test("全工程一套 id：短 id 在导出链里绝迹，键都是第一屏认得的族 id", () => {
  // R-1 归一之后短 id 已废除，且不保留别名与映射表。这六个是原来的短 id，
  // 出现在导出链任何一处都算没归一干净。
  const retired = [
    "city-map",
    "concept-graph",
    "dialogue-branch",
    "floorplan",
    "formula-walkthrough",
    "spaced-repetition",
  ];
  const directory = new URL("../src/shell/plugin-export/", import.meta.url);
  const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));
  assert.ok(files.length >= 7, "导出链的文件一个都不许漏扫");
  for (const file of files) {
    const source = readFileSync(new URL(file, directory), "utf8");
    for (const shortId of retired) {
      assert.doesNotMatch(
        source,
        new RegExp(`["'\`]${shortId}["'\`]`),
        `${file} 里还留着已废除的短 id ${shortId}`,
      );
    }
  }
  // 反过来核一遍：按键、第一屏、导出清单三处必须是同一套 id。
  // 判据落在「用户真的点得到的那些按键」上：一枚按键点下去要能开出第一屏，
  // 开出来还要查得到自己的导出形态。三处任意一处用了另一套 id 都会红。
  const firstScreenIds = new Set(pluginInitialStateIds());
  const keyed = new Set(
    Object.values(GENERATED_APP_PLUGIN_MAP.apps).flatMap((row) =>
      row.map((button) => button.id),
    ),
  );
  assert.ok(keyed.size > 0, "发布副本里一枚按键都没有，这条判据就白判了");
  for (const id of keyed) {
    assert.ok(firstScreenIds.has(id), `按键 ${id} 点下去没有第一屏`);
    assert.ok(PLUGIN_EXPORT_CATALOG[id], `按键 ${id} 在导出清单里查不到`);
  }
  for (const id of firstScreenIds) {
    assert.ok(
      PLUGIN_EXPORT_CATALOG[id],
      `${id} 有第一屏却不在导出清单里，两处已经分家`,
    );
  }
  // 清册里多出来的那几条既没按键也没第一屏（仲裁 A-7 撤掉了节点连线图那两族）。
  // 它们可以留在清册里，但不许只撤掉一半——半撤的结果就是点得开却导不出。
  for (const id of Object.keys(PLUGIN_EXPORT_CATALOG)) {
    if (firstScreenIds.has(id)) continue;
    assert.equal(
      keyed.has(id),
      false,
      `${id} 没有第一屏却还发着按键，用户点下去是空的`,
    );
  }
});

test("清册声明的每一种形态，导出链都有确定结果——不许「文档说能导出、点下去没反应」", async () => {
  const issues = await auditPluginExportCatalog();
  assert.deepEqual(
    issues,
    [],
    `清册与导出链对不上：\n${formatPluginExportAudit(issues)}`,
  );
});

test("那道闸真的会红：形态表少一种、或缺口不说原因，都当场判红", async () => {
  // 闸门自己也要有反面用例，否则它可能只是恒返回空数组。
  // ① 清册声明了一个形态表里没有的取值。
  const unknown = await auditWith(
    { "ledger-register": { exportKinds: ["xlsx", "tiff"] } },
  );
  assert.ok(
    unknown.some(
      (issue) => issue.code === "unknown-form" && issue.form === "tiff",
    ),
    "形态表里没有的取值必须判红",
  );
  // ② 缺口不给用户任何原因。
  const silent = await auditWith(
    {},
    { pdf: { renderable: false, unavailableReason: "" } },
  );
  assert.ok(
    silent.some((issue) => issue.code === "silent-rejection"),
    "渲不出却不说缺什么，必须判红",
  );
  // ③ 渲染器其实已经实现了，形态表却还标着渲不出。
  const stale = await auditWith({}, { html: { renderable: false } });
  assert.ok(
    stale.some((issue) => issue.code === "stale-gap"),
    "形态表陈旧把用户白挡在门外，必须判红",
  );
  // ④ 实现了却没人声明。
  const orphan = await auditWith(
    Object.fromEntries(
      Object.keys(PLUGIN_EXPORT_CATALOG).map((id) => [
        id,
        { exportKinds: ["xlsx"] },
      ]),
    ),
  );
  assert.ok(
    orphan.some((issue) => issue.code === "implemented-not-declared"),
    "没人声明的渲染器必须判红",
  );
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
  // W24 P3 之后 pdf 也渲得出来，台账声明的五种形态全通。
  assert.deepEqual(
    LEDGER_RENDERABLE_EXPORT_FORMS,
    exportKindsForPlugin(LEDGER_SOURCE_ID),
  );
});

test("清册没给这个工具声明的形态，一律拒绝", () => {
  // 台账声明的是 xlsx / csv / pdf / long-image / html，docx 越界。
  const rejected = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, "docx", { siteId: "home" }),
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "form-not-declared");
  assert.match(rejected.error, /台账没有声明/);
  // 换算器只有 xlsx / long-image，csv 同样越界——哪怕它与 xlsx 同属 `grid` 载体。
  const converter = normalizePluginExportRequest({
    ...ledgerExportRequest(LEDGER, "csv", { siteId: "home" }),
    sourceId: "unit-converter",
    sourceLabel: "换算器",
  });
  assert.equal(converter.ok, false);
  assert.equal(converter.code, "form-not-declared");
});

test("字幕形态的声明已撤销：形态表与清册两侧同时绝迹", () => {
  // W24 P4：口播脚本第一屏只有「已写段落」与「已写字数」两个计数，没有任何一段
  // 台词、没有任何一条时间码。按段数均分或按字数折算都是假字幕，所以声明撤销，
  // 而不是留一条「声明了但渲不出」的缺口挂在那里。
  for (const id of ["srt", "vtt"]) {
    assert.equal(pluginExportForm(id), null, `${id} 还留在形态表里`);
    for (const [pluginId, entry] of Object.entries(PLUGIN_EXPORT_CATALOG)) {
      assert.equal(
        entry.exportKinds.includes(id),
        false,
        `${pluginId} 还声明着 ${id}`,
      );
    }
  }
  // 撤销的理由必须落在清册里，不能只活在某个人的交付摘要中。
  const registry = new URL(
    "file:///opt/cursor-workspaces/oceandino/scripts/data/oceanleo-plugin-registry.json",
  );
  if (existsSync(registry)) {
    const plugins = JSON.parse(readFileSync(registry, "utf8")).plugins;
    const voiceover = plugins.find((row) => row.id === "voiceover-script");
    assert.ok(voiceover.exportKindsWithdrawn, "清册里没记下这次撤销");
    assert.deepEqual(voiceover.exportKindsWithdrawn.kinds, ["srt", "vtt"]);
    assert.ok(voiceover.exportKindsWithdrawn.reason.length > 60);
    assert.ok(voiceover.exportKindsWithdrawn.restoreWhen.length > 20);
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

test("导出的 xlsx 是一个部件齐全、数值真的在里面的工作簿", async () => {
  const normalized = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, "xlsx", {
      siteId: "home",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(normalized.ok, true);
  const rendered = await renderPluginExport(normalized.request);
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

/**
 * 「我的库」的准入：`MyLibrary.tsx` 的两处收口逐字同一套判据
 * （durable → 可下载的成品 → 按身份去重）。这里用同样的真实函数复现一遍，
 * 用来回答「导出物到底进没进库」。
 */
function admitToMyLibrary(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!isDurableLibraryItem(item)) return false;
    if (!libraryEntryIsDownloadableMaterial(item)) return false;
    const identity = libraryItemIdentityKey(item);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

test("两条端到端链：台账 → Excel 与 台账 → 图文长图，都落进我的库且能原样取回字节", async () => {
  const fake = gateway();
  // 第一条是最自然的一条：记账记录本来就是一张表，Excel 是它的成品形态，
  // 落 `grid` 载体。第二条特意挑形状最不一样的图文长图：它落的是
  // `vector_image` 载体、字节是文本 SVG 而不是 zip 包，走的是与表格完全
  // 不同的渲染器与下载规则——两条链只要有一处是靠表格假设撑着的，它就会红。
  const chains = [
    { form: "xlsx", artifactType: "grid", filename: "八月记账.xlsx" },
    { form: "long-image", artifactType: "vector_image", filename: "八月记账.svg" },
  ];
  const exported = [];
  for (const chain of chains) {
    const result = await exportLedger(chain.form, fake.dependencies);
    assert.equal(result.ok, true, result.ok ? "" : result.error);
    assert.equal(result.item.artifactType, chain.artifactType);
    assert.equal(result.filename, chain.filename);
    assert.equal(result.artifactTypeMatchesForm, true);
    exported.push(result);

    // ① 落库记录：ensure 收到的那一条带得住来源，产物身份稳定。
    const ensured = fake.ensures.at(-1);
    assert.equal(ensured.provenance.export_source_id, "ledger-register");
    assert.equal(ensured.provenance.export_form, chain.form);
    assert.equal(ensured.payloadDigest, result.digest);
    assert.ok(result.item.artifactId && result.item.revisionId);

    // ② 可取到字节：按库条目算出来的下载方案去取，取到的就是渲出来的那一串。
    const bytes = fake.fetchBytes(result.item);
    assert.ok(bytes, `${chain.form} 的库条目算不出可取字节的下载方案`);
    assert.equal(bytes.length, result.byteLength);
    assert.deepEqual(bytes, fake.uploads.at(-1).bytes);
  }

  // ③ 取回来的字节是真的能用：Excel 解得开且数值在里面，长图是合法 SVG。
  const workbook = unzipSync(fake.fetchBytes(exported[0].item));
  assert.match(
    strFromU8(workbook["xl/worksheets/sheet1.xml"]),
    /<v>18000<\/v>/,
  );
  const svg = strFromU8(fake.fetchBytes(exported[1].item));
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(svg, /楼下面馆/);

  // ④ 两件互相独立地进「我的库」，同一份记录导两次不会互相顶掉；
  //    同一个列表里的运行时实例（用户正在用的那个台账本身）进不来。
  const runtimeInstance = pluginInstanceLibraryItem("ledger-register", {
    siteId: "home",
    appId: "personal-ledger",
  });
  assert.ok(runtimeInstance, "台账的第一屏必须造得出运行时实例");
  const admitted = admitToMyLibrary([
    exported[0].item,
    runtimeInstance,
    exported[1].item,
  ]);
  assert.deepEqual(
    admitted.map((item) => item.title),
    ["八月记账（Excel 表格）", "八月记账（图文长图）"],
  );
});

async function render(form) {
  const normalized = normalizePluginExportRequest(
    ledgerExportRequest(LEDGER, form, {
      siteId: "home",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(normalized.ok, true, normalized.ok ? "" : normalized.error);
  return renderPluginExport(normalized.request);
}

test("网页与图文长图是自包含的成品文件，标记语言里的用户数据一律转义", async () => {
  for (const form of ["html", "long-image"]) {
    const rendered = await render(form);
    const text = strFromU8(rendered.bytes);
    assert.match(text, /八月记账/);
    assert.match(text, /楼下面馆/);
    // 用户写的尖括号必须是实体，不能变成标记。
    assert.doesNotMatch(text, /<含补贴>/);
    assert.ok(rendered.bytes.length > 500);
  }
  const poster = await render("long-image");
  const svg = strFromU8(poster.bytes);
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg /);
  assert.match(svg, /width="1080"/);
  assert.equal(poster.mediaType, "image/svg+xml");
});

test("CSV 带 BOM 与 CRLF，Excel 双击不乱码；含分隔符的字段加引号", async () => {
  const rendered = await render("csv");
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
    strFromU8((await renderPluginExport(tricky.request)).bytes),
    /"他说 ""买菜, 顺便"""/,
  );
});

test("docx 是部件齐全的 Word 包，正文里有表格与合计", async () => {
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
  const rendered = await renderPluginExport(normalized.request);
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

test("反面：把用户正在用的那个功能件本身当素材落库，一律被拒", () => {
  // 造的不是仿制品，是承载层真的会挂到右侧的那份运行时实例
  // （`plugin-initial-state.ts` 的 `pluginInstanceLibraryItem()`），
  // 三个内核各取一个：地图、台账、换算器。
  for (const pluginId of [
    "annotatable-city-map",
    "ledger-register",
    "unit-converter",
  ]) {
    const instance = pluginInstanceLibraryItem(pluginId, { siteId: "home" });
    assert.ok(instance, `${pluginId} 的第一屏必须造得出运行时实例`);
    assert.equal(
      libraryEntryIsRuntimeSurface(instance),
      true,
      `${pluginId} 的运行时实例必须被认成「打开来用的那个东西」`,
    );
    assert.equal(
      libraryEntryIsDownloadableMaterial(instance),
      false,
      `${pluginId} 的运行时实例不许被当成可下载的成品`,
    );
    assert.deepEqual(admitToMyLibrary([instance]), []);
  }
  // 连伪装都不行：给它补上 durable 身份与成品载体，`meta.plugin_id` 还在，
  // 判别就还认得出它（与保存守门人 `saveTargetForItem()` 同一个字段）。
  const ledger = pluginInstanceLibraryItem("ledger-register", {
    siteId: "home",
  });
  const material = runtimeStateItem("geo_map");
  const disguised = {
    ...material,
    artifactType: "grid",
    artifact: { ...material.artifact, artifactType: "grid" },
    meta: { ...material.meta, plugin_id: ledger.meta.plugin_id },
  };
  assert.equal(libraryEntryIsRuntimeSurface(disguised), true);
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

/* ------------------------- PDF：中文是真字形，不是空白方块 ------------------------- */

/**
 * 从 PDF 字节里把对象抓出来。**刻意不引任何 PDF 库**：这条用例要证的就是
 * 「我们自己写出去的那串字节里到底有什么」，用第三方解析器等于换个人复述一遍。
 */
function pdfObjects(bytes) {
  const buffer = Buffer.from(bytes);
  const text = buffer.toString("latin1");
  const found = new Map();
  const re = /(\d+) 0 obj([\s\S]*?)endobj/g;
  let match;
  while ((match = re.exec(text))) {
    const body = match[2];
    const bodyAt = match.index + match[1].length + " 0 obj".length;
    const streamAt = body.indexOf("stream");
    let stream = null;
    if (streamAt >= 0) {
      let start = streamAt + "stream".length;
      // stream 关键字后面是 CRLF 或 LF，两种都要认。
      if (body[start] === "\r") start += 1;
      if (body[start] === "\n") start += 1;
      stream = buffer.subarray(
        bodyAt + start,
        bodyAt + body.lastIndexOf("endstream"),
      );
    }
    found.set(match[1] * 1, {
      dict: streamAt < 0 ? body : body.slice(0, streamAt),
      stream,
    });
  }
  return { text, objects: found };
}

function pdfStream(parsed, id) {
  const object = parsed.objects.get(id);
  assert.ok(object?.stream, `${id} 号对象里没有 stream`);
  return object.dict.includes("/FlateDecode")
    ? inflateSync(object.stream)
    : object.stream;
}

/** `/FontFile2` 指向的每一份嵌入字体，已解压并重新解析成 TrueType。 */
function embeddedFonts(bytes) {
  const parsed = pdfObjects(bytes);
  return [...parsed.text.matchAll(/\/FontFile2 (\d+) 0 R/g)].map((match) => {
    const file = pdfStream(parsed, Number(match[1]));
    // 解析得动，就说明写进去的是一份结构完整的字体，不是一段占位字节。
    return { bytes: file, font: parseTrueType(new Uint8Array(file)) };
  });
}

/** ToUnicode CMap 反过来读：unicode 码位 → PDF 里那个字用的字形号。 */
function pdfGlyphIdByCodePoint(bytes) {
  const parsed = pdfObjects(bytes);
  const map = new Map();
  for (const match of parsed.text.matchAll(/\/ToUnicode (\d+) 0 R/g)) {
    const cmap = pdfStream(parsed, Number(match[1])).toString("latin1");
    for (const block of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const pair of block[1].matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      )) {
        map.set(parseInt(pair[2], 16), parseInt(pair[1], 16));
      }
    }
    for (const block of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
      for (const row of block[1].matchAll(
        /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
      )) {
        const lo = parseInt(row[1], 16);
        const hi = parseInt(row[2], 16);
        const unicode = parseInt(row[3], 16);
        for (let i = 0; i <= hi - lo; i += 1) map.set(unicode + i, lo + i);
      }
    }
  }
  return map;
}

/**
 * 一个字形到底有没有轮廓。DroidSansFallback 的汉字绝大多数是**复合字形**：
 * 它自己只有 24 字节的引用头，真正的笔画在被引用的部件里。所以「非空」必须
 * 递归看到底——只看外层字节数会把「部件没被子集带进来」这种正好渲成空白方块的
 * 情况判成绿。
 */
function glyphOutlineBytes(font, gid, seen = new Set()) {
  if (seen.has(gid)) return 0;
  seen.add(gid);
  const range = font.glyphRange(gid);
  if (range.end <= range.start) return 0;
  const dv = new DataView(
    font.bytes.buffer,
    font.bytes.byteOffset,
    font.bytes.byteLength,
  );
  const contours = dv.getInt16(range.start);
  if (contours >= 0) return range.end - range.start;
  let total = 0;
  let cursor = range.start + 10;
  for (;;) {
    const flags = dv.getUint16(cursor);
    total += glyphOutlineBytes(font, dv.getUint16(cursor + 2), seen);
    cursor += 4 + (flags & 1 ? 4 : 2);
    if (flags & 8) cursor += 2;
    else if (flags & 0x40) cursor += 4;
    else if (flags & 0x80) cursor += 8;
    if (!(flags & 0x20)) break;
  }
  return total;
}

async function renderLedgerPdf(snapshot) {
  const request = normalizePluginExportRequest(
    ledgerExportRequest(snapshot, "pdf", {
      siteId: "home",
      appId: "personal-ledger",
      exportedAt: "2026-08-05T04:00:00.000Z",
    }),
  );
  assert.equal(request.ok, true, request.ok ? "" : request.error);
  return renderPluginExport(request.request);
}

function ledgerOf(title, rows) {
  return {
    title,
    currency: "¥",
    entries: rows.map((row, index) => ({
      date: `2026-08-0${index + 1}`,
      category: row[0],
      counterparty: row[1],
      direction: index % 2 === 0 ? "out" : "in",
      amount: 100 + index,
      note: row[2],
    })),
  };
}

test("PDF 里的中文是真嵌进去的字形，逐个字形都有轮廓", async () => {
  const rendered = await renderLedgerPdf(
    ledgerOf("八月记账", [
      ["餐饮", "楼下面馆", "午饭"],
      ["工资", "公司", "七月薪资"],
      ["交通", "地铁", "通勤"],
    ]),
  );
  assert.equal(
    Buffer.from(rendered.bytes.subarray(0, 8)).toString("latin1"),
    "%PDF-1.7",
  );
  const fonts = embeddedFonts(rendered.bytes);
  assert.equal(fonts.length, 2, "拉丁与中日韩两份字体都要嵌进去");
  const byCodePoint = pdfGlyphIdByCodePoint(rendered.bytes);
  // 文档里出现过的每一个汉字都必须在 ToUnicode 里查得到，并且那个字形有笔画。
  // 少一条就说明它在页面上是个空白方块，而这正是不带字形的手写 PDF 的样子。
  const cjk = fonts[1].font;
  for (const character of "八月记账餐饮楼下面馆午饭工资公司七薪交通地铁勤日期分类对方向金额备注") {
    const codePoint = character.codePointAt(0);
    const gid = byCodePoint.get(codePoint);
    assert.ok(
      gid !== undefined,
      `「${character}」U+${codePoint.toString(16).toUpperCase()} 没进 ToUnicode，选中与检索都拿不到它`,
    );
    assert.ok(
      glyphOutlineBytes(cjk, gid) > 0,
      `「${character}」的字形是空的——页面上就是一个空白方块`,
    );
  }
  // 反面：字体表本身不许是「整包塞进去」的。随包那份 cjk 有界字集是 7096 个码位，
  // 一份三行的台账用不到其中的百分之二。
  assert.ok(
    cjk.numGlyphs < 1000,
    `嵌进去的中日韩字形有 ${cjk.numGlyphs} 个，不像是按文档切的子集`,
  );
  assert.ok(rendered.bytes.byteLength < 200_000, "一份三行台账的 PDF 不该这么大");
});

test("字形子集按文档现切：换一份文档，嵌进去的字形跟着换", async () => {
  const a = await renderLedgerPdf(
    ledgerOf("八月记账", [
      ["餐饮", "楼下面馆", "午饭"],
      ["工资", "公司", "七月薪资"],
    ]),
  );
  const b = await renderLedgerPdf(
    ledgerOf("旅行开销", [
      ["医疗", "协和医院", "体检费用"],
      ["旅行", "航空公司", "机票改签"],
    ]),
  );
  const inA = pdfGlyphIdByCodePoint(a.bytes);
  const inB = pdfGlyphIdByCodePoint(b.bytes);
  // 两份文档各自独有的字，只许出现在自己那一份里。恒切全字库的话这四条全会红。
  for (const character of "餐饮楼馆午") {
    const codePoint = character.codePointAt(0);
    assert.ok(inA.has(codePoint), `A 少了「${character}」`);
    assert.equal(inB.has(codePoint), false, `B 白带了「${character}」`);
  }
  for (const character of "医协旅票") {
    const codePoint = character.codePointAt(0);
    assert.ok(inB.has(codePoint), `B 少了「${character}」`);
    assert.equal(inA.has(codePoint), false, `A 白带了「${character}」`);
  }
  const fontsA = embeddedFonts(a.bytes);
  const fontsB = embeddedFonts(b.bytes);
  assert.notEqual(
    fontsA[1].font.numGlyphs,
    fontsB[1].font.numGlyphs,
    "两份用字不同的文档切出了字形数完全相同的子集，八成没在切",
  );
  // 子集前缀是 PDF 规范要求的，而且必须随内容变：两份用字不同的子集自称同一个
  // BaseFont 时，阅读器会把先看到的那一份缓存下来当成后一份，第二份文档的汉字
  // 就会渲成别的字或空白。
  //
  // 只比中日韩那一份：两份文档的拉丁用字（数字、`-`、`.`）本来就一样，
  // 它的前缀相同才是对的，拿它来比会把一条真判据变成必然红。
  const subsetTagFor = (bytes, baseFont) => {
    const match = new RegExp(`/BaseFont /([A-Z]{6})\\+${baseFont}\\b`).exec(
      Buffer.from(bytes).toString("latin1"),
    );
    assert.ok(match, `${baseFont} 没有带六字母子集前缀`);
    return match[1];
  };
  const cjkFontName = "DroidSansFallback";
  assert.notEqual(
    subsetTagFor(a.bytes, cjkFontName),
    subsetTagFor(b.bytes, cjkFontName),
  );
  // 同一份文档两次导出必须给出同一个前缀，否则「同样的输入同样的字节」那条就破了。
  const again = await renderLedgerPdf(
    ledgerOf("旅行开销", [
      ["医疗", "协和医院", "体检费用"],
      ["旅行", "航空公司", "机票改签"],
    ]),
  );
  assert.equal(
    subsetTagFor(again.bytes, cjkFontName),
    subsetTagFor(b.bytes, cjkFontName),
  );
});

test("导出链的文案里没有那个被 35 个站占用的内部概念名", () => {
  const directory = new URL("../src/shell/plugin-export/", import.meta.url);
  // 逐个文件列名单会漏掉新加的文件，所以扫整个目录。
  for (const file of readdirSync(directory).filter((name) =>
    name.endsWith(".ts"),
  )) {
    const source = readFileSync(new URL(file, directory), "utf8");
    assert.ok(
      !source.includes("插件"),
      `${file} 里出现了不许出现在文案里的那两个字`,
    );
  }
});
