// H2 · slide 探索页的 PPTX / HTML 双板块（`tasks5/H2.md` 产品合同 1–6）。
//
// 七条判据都在这一份里：
//   1. 275 个旧 PPTX + 3 件 H1 HTML 得到 `275 / 3`，不是 `278 / 3`；
//   2. 标签/标题里写了 "html" 的 PPTX 仍进 PPTX（归类只认受控字段）；
//   3. H1 三件逐件落在 HTML，卡片「查看」指 runtime、「编辑」指结构稿；
//   4. 相似域 / userinfo / 端口 / query / fragment 的 runtime 一律被拒；
//   5. 没有结构稿的 HTML 件不显示「编辑」（但「查看」不跟着降级）；
//   6. 没有 runtime 的 HTML 件不显示「查看」（但「编辑」不跟着降级）；
//   7. 当前 app 的编辑仍是 inline handoff：一颗就地按钮，不是跳页深链。
//
// 另外守住「非 deck 素材布局不变」：没有 HTML 交付时货架仍是今天那一张平铺网格。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const ARTIFACT_CLIENT = dataModule(`
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
  export function artifactDownloadEvidence(){
    return { visible: true, available: true, reason: "", purpose: "source", mode: "attachment" };
  }
  export async function getArtifactDownload(){ return { ok: true, data: {} }; }
  export async function getArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
  export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function prepareArtifactForAction(action, item){ return { ok: true, data: item }; }
  export async function setArtifactFavorite(){ return { ok: true, data: {} }; }
  export async function refreshArtifactRendition(){ return { ok: false, status: 404 }; }
  export async function ensureDurableArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getArtifactEditDecision(){ return { ok: false, status: 404 }; }
  export async function resolveArtifactEditOwnership(){ return { ok: false, status: 404 }; }
  export async function getCurrentPrincipalId(){ return { ok: false, status: 404 }; }
  export async function listMyArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function listFavoriteArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function ensureArtifact(){ return { ok: false, status: 404 }; }
  export async function forkArtifact(){ return { ok: false, status: 404 }; }
  export async function createArtifactRevision(){ return { ok: false, status: 404 }; }
  export async function bindArtifactToContext(){ return { ok: false, status: 404 }; }
  export async function retireArtifact(){ return { ok: false, status: 404 }; }
  export function artifactDownloadTypeHint(){ return { ext: "", mediaType: "" }; }
  export function primeCurrentPrincipalId(){}
  export function resetCurrentPrincipalId(){}
  export const ARTIFACT_EDITABLE_SHELF_PER_TYPE = 5;
`);

const UI = dataModule("export function useUI(){ return (zh) => zh; }");

const SHELL_OVERRIDES = {
  "../i18n/ui/useUI": UI,
  "./artifact-client": ARTIFACT_CLIENT,
  "./AdvancedContentWorkbench": dataModule(
    "export function AdvancedContentWorkbench(){ return null; }",
  ),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; }",
  ),
  "./workbench-material-registry": dataModule(`
    export function materialScopeKey(siteId, appId){ return siteId + ":" + appId; }
    export function registerWorkbenchMaterialSource(){ return () => {}; }
  `),
};

const {
  DECK_DELIVERY_SECTION_LABEL,
  deckDeliveryCounts,
  deckDeliveryFamilyOf,
  deckDeliverySections,
  deckHtmlOpenPlan,
  deckHtmlRuntimeUrl,
  safeDeckHtmlRuntimeUrl,
} = await import(
  await compileModule("src/shell/deck-delivery-family.ts", SHELL_OVERRIDES)
);

const { WorkspaceLibrary } = await import(
  await compileModule("src/shell/WorkspaceLibrary.tsx", SHELL_OVERRIDES)
);

const { ArtifactActionButtons, artifactActionMatrix } = await import(
  await compileModule("src/shell/ArtifactActions.tsx", SHELL_OVERRIDES)
);

const { MaterialLibrary } = await import(
  await compileModule("src/shell/material-library-view.tsx", {
    ...SHELL_OVERRIDES,
    "./material-library-effects": dataModule(`
      export function useMaterialLibraryChangeEvents(){}
      export function useMaterialLibraryDeepLink(){}
      export function useMaterialLibraryPreviewIntent(){}
      export function useMaterialShelfSettle(){ return { settled: true, markSettled(){} }; }
      export function useOfficialTemplateMaterials(){
        return { entries: [], loading: false, error: "", status: undefined, deepLinkEntryId: "" };
      }
    `),
    "./WorkspaceLibrary": dataModule(`
      import { createElement } from ${JSON.stringify(reactUrl)};
      export function WorkspaceLibrary(props) {
        const sections = props.sectionsFor?.(props.entries) || null;
        return createElement("section", {
          "data-workspace-library": "true",
          "data-open-item-handoff": String(typeof props.onOpenItem === "function"),
          "data-deck-sections": sections
            ? sections.map((section) => section.id + ":" + section.count).join(",")
            : "none",
        });
      }
    `),
  })
);

const PPTX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/** H1 三件的真实隔离域入口（`asset/active-runtime-plan.deck-html.json`）。 */
const H1_RUNTIME = {
  "deck-html-nocturne-01":
    "https://s-b15b61eb08dfb478236383d2408a7507.oceanleo.app/embed",
  "deck-html-monotype-01":
    "https://s-7e967a18f4e078e87d374566c8cb34de.oceanleo.app/embed",
  "deck-html-manual-01":
    "https://s-8fe57ddda07cf9c733583721b30d7579.oceanleo.app/embed",
};

function rendition(purpose, revisionId, { url, mediaType, format }) {
  return {
    purpose,
    revisionId,
    url,
    mediaType,
    format,
    expiresAt: null,
    rendererVersion: null,
    width: null,
    height: null,
    durationMs: null,
    byteSize: 4096,
    digest: `sha256:${revisionId}:${purpose}`,
  };
}

function deckItem({
  id,
  title,
  full,
  source,
  sourceFormat,
  meta = {},
  editorCapability = "deck-editor",
  artifactType = "deck",
}) {
  const revisionId = `${id}-rev`;
  const renditions = {};
  if (full) renditions.full = rendition("full", revisionId, full);
  if (source) renditions.source = rendition("source", revisionId, source);
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId: id,
    revisionId,
    artifactType,
    roles: ["approved_inventory_example"],
    owner: {
      principalId: "workspace:ppt",
      visibility: "public",
      originSiteKey: "ppt",
      originAppId: "slide",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: true,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: true,
      canBind: true,
      canExportSource: true,
    },
    editability: "native",
    editorCapability,
    sourceFormat,
    title,
    favorite: false,
    renditions,
    scene: null,
    provenance: {
      id: `provenance-${id}`,
      sourceKind: "owned",
      licenseCode: "internal",
      licenseUrl: "",
      attribution: "",
    },
    bindings: [
      {
        contextId: "olctx:v1:ppt:app:slide",
        role: "approved_inventory_example",
        rank: 1,
        pinnedRevisionId: revisionId,
      },
    ],
    integrity: { ok: true, code: "ok", reason: "" },
    createdAt: "2026-08-01T00:00:00Z",
  };
  return {
    key: `artifact:${id}:${revisionId}`,
    source: "artifact",
    id,
    artifactId: id,
    revisionId,
    artifactType,
    artifact,
    title,
    kind: "deck",
    siteId: "ppt",
    url: renditions.full?.url || renditions.source?.url,
    previewUrl: renditions.full?.url,
    favorite: false,
    meta: {
      artifact_id: id,
      revision_id: revisionId,
      artifact_type: artifactType,
      source_format: sourceFormat,
      full_media_type: full?.mediaType || "",
      source_media_type: source?.mediaType || "",
      ...meta,
    },
    descriptor: {
      contentType: artifactType,
      representation: sourceFormat,
      subtype: artifactType,
      editor: null,
      capabilities: ["load", "mutate", "save", "reopen"],
      unavailableReason: "",
    },
  };
}

/** 旧件：只有 PPTX 字节，没有结构稿。 */
function legacyPptxDeck(index) {
  const id = `legacy-deck-${String(index).padStart(3, "0")}`;
  return deckItem({
    id,
    title: `旧演示 ${index}`,
    sourceFormat: "pptx",
    full: {
      url: `https://signed.example/${id}.pptx`,
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
    source: {
      url: `https://signed.example/${id}-source.pptx`,
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
  });
}

/** H1 三件：结构稿 + HTML full rendition + 隔离域 runtime。 */
function htmlDeck(id, { runtime = H1_RUNTIME[id], source = true } = {}) {
  return deckItem({
    id,
    title: `HTML 演示 ${id}`,
    sourceFormat: "oceanleo.deck.v1",
    full: {
      url: `https://signed.example/${id}.html`,
      mediaType: "text/html",
      format: "html",
    },
    source: source
      ? {
          url: `https://signed.example/${id}.deck.json`,
          mediaType: "application/json",
          format: "oceanleo.deck.v1",
        }
      : null,
    meta: {
      ...(runtime ? { active_runtime_url: runtime } : {}),
      ...(source
        ? { editor_project_url: `https://signed.example/${id}.deck.json`,
            editor_project_schema: "oceanleo.deck.v1" }
        : {}),
    },
  });
}

function entryOf(item) {
  return {
    id: item.key,
    title: item.title,
    kind: item.kind,
    thumbUrl: undefined,
    libraryItem: item,
  };
}

const LEGACY_ITEMS = Array.from({ length: 275 }, (_, index) =>
  legacyPptxDeck(index + 1),
);
const HTML_ITEMS = Object.keys(H1_RUNTIME).map((id) => htmlDeck(id));
const SHELF_ENTRIES = [...LEGACY_ITEMS, ...HTML_ITEMS].map(entryOf);

test("判据 1 · 275 个旧 PPTX 与 3 件 HTML 分别计数，得到 275 / 3", () => {
  const counts = deckDeliveryCounts(SHELF_ENTRIES);
  assert.equal(counts.pptx, 275);
  assert.equal(counts.html, 3);
  assert.equal(counts.unknown, 0);

  const sections = deckDeliverySections(SHELF_ENTRIES);
  assert.ok(sections, "有 HTML 交付时必须分板块");
  const byId = Object.fromEntries(
    sections.map((section) => [section.id, section]),
  );
  assert.equal(byId["deck-pptx"].count, 275);
  assert.equal(byId["deck-pptx"].entries.length, 275);
  assert.equal(byId["deck-html"].count, 3);
  assert.equal(byId["deck-html"].entries.length, 3);
  assert.equal(byId["deck-pptx"].label, DECK_DELIVERY_SECTION_LABEL.pptx);
  assert.equal(byId["deck-html"].label, DECK_DELIVERY_SECTION_LABEL.html);
  // 278 = 把 HTML 件重复算进 PPTX，或者给旧件凭空造 HTML 卡片。
  assert.notEqual(byId["deck-pptx"].count + byId["deck-html"].count, 278 + 3);
  assert.equal(byId["deck-pptx"].count + byId["deck-html"].count, 278);
});

test("判据 2 · 标签/标题/meta 里写 html 的 PPTX 仍然归 PPTX", () => {
  const disguised = deckItem({
    id: "disguised-pptx",
    title: "年度汇报 HTML 网页版",
    sourceFormat: "pptx",
    full: {
      url: "https://signed.example/disguised.pptx",
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
    source: {
      url: "https://signed.example/disguised-source.pptx",
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
    meta: {
      tags: ["html", "网页版", "deck-html"],
      label: "html",
      category: "html",
      // 连隔离域 runtime 都伪造出来也不算证据：交付家族只看受控表示。
      active_runtime_url: H1_RUNTIME["deck-html-nocturne-01"],
    },
  });
  assert.equal(deckDeliveryFamilyOf(disguised), "pptx");
  assert.equal(deckHtmlOpenPlan(disguised).view.visible, false);

  // 反过来：受控字段冲突时不许误归 HTML。
  const conflicted = deckItem({
    id: "conflicted",
    title: "冲突件",
    sourceFormat: "oceanleo.deck.v1",
    full: {
      url: "https://signed.example/conflicted.bin",
      mediaType: PPTX_MEDIA_TYPE,
      format: "html",
    },
    source: {
      url: "https://signed.example/conflicted.deck.json",
      mediaType: "application/json",
      format: "oceanleo.deck.v1",
    },
  });
  assert.equal(deckDeliveryFamilyOf(conflicted), "unknown");

  // 字段读不到时同样不是 HTML。
  const unknown = deckItem({
    id: "no-representation",
    title: "没有交付表示",
    sourceFormat: "oceanleo.deck.v1",
    full: null,
    source: {
      url: "https://signed.example/x.deck.json",
      mediaType: "application/json",
      format: "oceanleo.deck.v1",
    },
  });
  assert.equal(deckDeliveryFamilyOf(unknown), "unknown");

  // 非 deck 的东西根本不参与这条分组。
  assert.equal(
    deckDeliveryFamilyOf(
      deckItem({
        id: "an-image",
        title: "一张图",
        artifactType: "single_file_image",
        sourceFormat: "png",
        full: {
          url: "https://signed.example/x.png",
          mediaType: "image/png",
          format: "png",
        },
        source: null,
      }),
    ),
    "none",
  );
});

test("判据 3 · H1 三件逐件落在 HTML，查看指 runtime、编辑指结构稿", () => {
  for (const item of HTML_ITEMS) {
    assert.equal(deckDeliveryFamilyOf(item), "html", item.id);
    const plan = deckHtmlOpenPlan(item);
    assert.equal(plan.family, "html");
    assert.equal(plan.view.visible, true);
    assert.equal(plan.view.available, true);
    assert.equal(plan.view.url, H1_RUNTIME[item.id]);
    assert.equal(plan.edit.visible, true);
    assert.equal(plan.edit.available, true);
    assert.equal(
      plan.edit.sourceUrl,
      `https://signed.example/${item.id}.deck.json`,
      "编辑必须拿结构稿，不能拿 HTML 交付物",
    );
    assert.notEqual(plan.edit.sourceUrl, plan.view.url);
  }
});

test("判据 4 · 相似域 / userinfo / 端口 / query / fragment 的 runtime 全部被拒", () => {
  const hex = "b15b61eb08dfb478236383d2408a7507";
  const rejected = [
    `https://s-${hex}.oceanleo.app.evil.example/embed`,
    `https://s-${hex}.oceanleo.appevil.com/embed`,
    `https://s-${hex}.oceanleo.com/embed`,
    `https://s-${hex}.leoapp.cn/embed`,
    `https://xs-${hex}.oceanleo.app/embed`,
    `https://s-${hex.slice(0, 31)}.oceanleo.app/embed`,
    `https://s-${hex.toUpperCase()}.oceanleo.app/embed`,
    `https://user:pass@s-${hex}.oceanleo.app/embed`,
    `https://s-${hex}.oceanleo.app:8443/embed`,
    `https://s-${hex}.oceanleo.app/embed?token=1`,
    `https://s-${hex}.oceanleo.app/embed#slide-2`,
    `http://s-${hex}.oceanleo.app/embed`,
    `https://s-${hex}.oceanleo.app/embed/../admin`,
    `https://s-${hex}.oceanleo.app/other`,
    `//s-${hex}.oceanleo.app/embed`,
    "javascript:alert(1)",
    "",
  ];
  for (const candidate of rejected) {
    assert.equal(
      safeDeckHtmlRuntimeUrl(candidate),
      "",
      `这个 runtime 不该被放行：${candidate}`,
    );
  }
  // 只有精确的两种形状放行。
  assert.equal(
    safeDeckHtmlRuntimeUrl(`https://s-${hex}.oceanleo.app/embed`),
    `https://s-${hex}.oceanleo.app/embed`,
  );
  assert.equal(
    safeDeckHtmlRuntimeUrl(`https://s-${hex}.oceanleo.app`),
    `https://s-${hex}.oceanleo.app`,
  );

  // 被拒的 runtime 只让「查看」消失，不牵连「编辑」。
  const spoofed = htmlDeck("deck-html-manual-01", {
    runtime: `https://s-${hex}.oceanleo.app:8443/embed`,
  });
  const plan = deckHtmlOpenPlan(spoofed);
  assert.equal(plan.view.visible, false);
  assert.equal(plan.view.url, "");
  assert.equal(plan.edit.visible, true);
});

test("判据 5 · 没有结构稿的 HTML 件不显示编辑，查看不跟着降级", () => {
  const sourceless = htmlDeck("deck-html-monotype-01", { source: false });
  const plan = deckHtmlOpenPlan(sourceless);
  assert.equal(plan.family, "html");
  assert.equal(plan.edit.visible, false);
  assert.equal(plan.edit.sourceUrl, "");
  assert.equal(plan.view.visible, true);
  assert.equal(plan.view.url, H1_RUNTIME["deck-html-monotype-01"]);

  const matrix = artifactActionMatrix(sourceless, {
    hidePreview: true,
    canOpenEdit: true,
    materialEditRoute: "in-place",
  });
  assert.equal(matrix.edit.visible, false);

  const html = renderToStaticMarkup(
    createElement(ArtifactActionButtons, {
      item: sourceless,
      matrix,
      onEdit: () => {},
    }),
  );
  assert.doesNotMatch(html, /aria-label="编辑「/);
  assert.match(html, /data-deck-html-view="true"/);
});

test("判据 6 · 没有 runtime 的 HTML 件不显示查看，编辑不跟着降级", () => {
  const runtimeless = htmlDeck("deck-html-nocturne-01", { runtime: "" });
  const plan = deckHtmlOpenPlan(runtimeless);
  assert.equal(plan.view.visible, false);
  assert.equal(plan.view.url, "");
  assert.equal(plan.edit.visible, true);

  const matrix = artifactActionMatrix(runtimeless, {
    hidePreview: true,
    canOpenEdit: true,
    materialEditRoute: "in-place",
  });
  assert.equal(matrix.edit.visible, true);

  const html = renderToStaticMarkup(
    createElement(ArtifactActionButtons, {
      item: runtimeless,
      matrix,
      onEdit: () => {},
    }),
  );
  assert.doesNotMatch(html, /data-deck-html-view="true"/);
  assert.match(html, /aria-label="编辑「/);
});

test("判据 7 · 当前 app 的编辑仍是 inline handoff，查看只在新窗口外开、不 iframe", () => {
  const item = HTML_ITEMS[0];
  const matrix = artifactActionMatrix(item, {
    hidePreview: true,
    canOpenEdit: true,
    materialEditRoute: "in-place",
  });
  assert.equal(matrix.edit.visible, true);
  assert.equal(matrix.edit.available, true);

  const html = renderToStaticMarkup(
    createElement(ArtifactActionButtons, {
      item,
      matrix,
      onEdit: () => {},
    }),
  );
  // 编辑是一颗就地按钮，不是把用户送走的链接。
  assert.match(html, /<button[^>]*aria-label="编辑「/);
  assert.doesNotMatch(html, /<a[^>]*aria-label="编辑「/);
  // 查看只在新窗口打开隔离域，且绝不 iframe。
  const viewAnchor = html.match(/<a\b[^>]*data-deck-html-view="true"[^>]*>/);
  assert.ok(viewAnchor, "HTML 演示的详情里没有「查看」入口");
  assert.ok(
    viewAnchor[0].includes(`href="${H1_RUNTIME[item.id]}"`),
    `「查看」指向的不是这一件的隔离域 runtime：${viewAnchor[0]}`,
  );
  assert.ok(viewAnchor[0].includes('rel="noopener noreferrer"'));
  assert.ok(viewAnchor[0].includes('target="_blank"'));
  assert.doesNotMatch(html, /<iframe|srcdoc/);
  // 「网页版」这个临时导出动作不出现在 HTML 件上（它属于 PPTX 卡片）。
  assert.doesNotMatch(html, /data-deck-html-action="true"/);
});

test("货架渲染：两个板块各自显示真实件数，卡片仍先进共享详情", () => {
  const html = renderToStaticMarkup(
    createElement(WorkspaceLibrary, {
      entries: SHELF_ENTRIES,
      sectionsFor: deckDeliverySections,
      onOpenItem: () => {},
      plain: true,
    }),
  );
  assert.match(
    html,
    /data-library-section="deck-pptx"[^>]*data-library-section-count="275"/,
  );
  assert.match(
    html,
    /data-library-section="deck-html"[^>]*data-library-section-count="3"/,
  );
  assert.match(html, /PPTX 演示/);
  assert.match(html, /HTML 网页版演示/);
  // 卡片上没有直接开 runtime 的入口：先进共享详情，动作在详情里。
  assert.doesNotMatch(html, /data-deck-html-view="true"/);
  assert.doesNotMatch(html, /<iframe/);
  // 「早期素材没有可编辑内容」这类替产品空缺道歉的话一个字都不许有。
  assert.doesNotMatch(html, /没有可编辑内容|制作得较早/);
});

test("没有 HTML 交付时布局不变：不分板块，仍是今天那张平铺网格", () => {
  const pptxOnly = LEGACY_ITEMS.slice(0, 12).map(entryOf);
  assert.equal(deckDeliverySections(pptxOnly), null);
  const html = renderToStaticMarkup(
    createElement(WorkspaceLibrary, {
      entries: pptxOnly,
      sectionsFor: deckDeliverySections,
      onOpenItem: () => {},
      plain: true,
    }),
  );
  assert.doesNotMatch(html, /data-library-section=/);
  assert.match(html, /data-workspace-card-grid="auto-fill"/);

  // 非 deck 素材同样不分板块。
  const images = [
    entryOf(
      deckItem({
        id: "img-1",
        title: "一张图",
        artifactType: "single_file_image",
        sourceFormat: "png",
        full: {
          url: "https://signed.example/img-1.png",
          mediaType: "image/png",
          format: "png",
        },
        source: null,
      }),
    ),
  ];
  assert.equal(deckDeliverySections(images), null);
});

// ---------------------------------------------------------------------------
// W11 · 匿名访客拿到的是官方模板目录行（`GET /v1/template-materials`），不是 durable
// 库行：没有 revision 身份，也就永远没有 renditions。它的家族证据是服务端对这一行
// pinned revision 的声明。下面这几格钉住那条**窄**分支的三个条件，以及「条件不齐时
// 逐字维持今天的行为」——后者防的是「一改就把 35 个站的货架布局改了」。
// ---------------------------------------------------------------------------

/** 逐字照 `templateMaterialLibraryItem()` 铸出来的形状：不是 durable，类型在 meta 里。 */
function templateRow(
  id,
  { artifactType = "deck", family, runtime, extraMeta = {} } = {},
) {
  const key = `template-material:${id}`;
  return {
    key,
    source: "artifact",
    id: key,
    kind: "image",
    title: `官方模板 ${id}`,
    siteId: "ppt",
    url: `https://asset.oceanleo.com/${id}.webp`,
    previewUrl: `https://asset.oceanleo.com/${id}.webp`,
    thumbUrl: `https://asset.oceanleo.com/${id}.webp`,
    favorite: false,
    meta: {
      workspace_library_surface: "materials",
      template_material_id: id,
      template_material_site_key: "ppt",
      template_material_app_id: "year-summary",
      template_material_artifact_id: `${id}-artifact`,
      template_material_artifact_type: artifactType,
      template_material_download_path: `/v1/template-materials/${id}/download`,
      width: 1920,
      height: 1080,
      ...(family ? { deliveryFamily: family } : {}),
      ...(runtime ? { activeRuntimeUrl: runtime } : {}),
      ...extraMeta,
    },
  };
}

test("判据 8 · 模板行 + 受控 html + 合格 runtime：进 HTML 节，「查看」拿得到地址", () => {
  const runtime = H1_RUNTIME["deck-html-nocturne-01"];
  const row = templateRow("ppt-year-summary-1", { family: "html", runtime });

  assert.equal(deckDeliveryFamilyOf(row), "html");
  assert.equal(deckHtmlRuntimeUrl(row), runtime);

  // 没有 artifact projection 也不许炸：`deckHtmlOpenPlan()` 被动作条无条件调用。
  const plan = deckHtmlOpenPlan(row);
  assert.equal(plan.family, "html");
  assert.equal(plan.view.visible, true);
  assert.equal(plan.view.available, true);
  assert.equal(plan.view.url, runtime);
  // 目录行没有结构稿，「编辑」照旧不出现——两条链互不牵连。
  assert.equal(plan.edit.visible, false);
  assert.equal(plan.edit.sourceUrl, "");

  // 这才是用户看得见的修复：匿名那一屏终于分得出板块。
  const shelf = [...LEGACY_ITEMS.slice(0, 5), row].map(entryOf);
  const counts = deckDeliveryCounts(shelf);
  assert.equal(counts.pptx, 5);
  assert.equal(counts.html, 1);
  assert.equal(counts.unknown, 0);
  const sections = deckDeliverySections(shelf);
  assert.ok(sections, "有 HTML 模板行时必须分板块");
  const byId = Object.fromEntries(
    sections.map((section) => [section.id, section]),
  );
  assert.equal(byId["deck-html"].count, 1);
  assert.equal(byId["deck-html"].label, DECK_DELIVERY_SECTION_LABEL.html);
  assert.equal(byId["deck-html"].entries[0].id, row.key);
  assert.equal(byId["deck-pptx"].count, 5);
});

test("判据 9 · 模板行 + 受控 pptx：进 PPTX 节，runtime 为空串", () => {
  const row = templateRow("ppt-year-summary-2", {
    family: "pptx",
    // 给一件 PPTX 挂上合格 runtime 也拿不到地址：伪造一个字段不该多出播放入口。
    runtime: H1_RUNTIME["deck-html-monotype-01"],
  });
  assert.equal(deckDeliveryFamilyOf(row), "pptx");
  assert.equal(deckHtmlRuntimeUrl(row), "");
  assert.equal(deckHtmlOpenPlan(row).view.visible, false);

  const sections = deckDeliverySections([row].map(entryOf));
  // 一屏里没有 HTML 件就不分节，布局逐字不变。
  assert.equal(sections, null);
  assert.equal(deckDeliveryCounts([row].map(entryOf)).pptx, 1);
});

test("判据 10 · 模板行没有受控家族：不进任何演示节，与今天逐字一致", () => {
  // 今天绝大多数官方 PPTX 老件就是这样：目录里既没有 deliveryFamily 也没有 runtime。
  const bare = templateRow("ppt-year-summary-legacy");
  assert.equal(deckDeliveryFamilyOf(bare), "none");
  assert.equal(deckHtmlRuntimeUrl(bare), "");
  assert.equal(deckHtmlOpenPlan(bare).view.visible, false);

  // 空串、垃圾值、大小写以外的取值都不算声明。
  for (const family of ["", "  ", "HTML5", "web", "html-deck", "pptx-ish"]) {
    assert.equal(
      deckDeliveryFamilyOf(templateRow("x", { extraMeta: { deliveryFamily: family } })),
      "none",
      `不该被当成家族声明：${JSON.stringify(family)}`,
    );
  }
  // 大小写与空白无所谓，字面量本身才算数。
  assert.equal(
    deckDeliveryFamilyOf(templateRow("x", { extraMeta: { deliveryFamily: " HTML " } })),
    "html",
  );

  // 三个条件缺一不可：不是目录行、或者目录行的类型不是 deck，都不走这条分支。
  const notCatalog = templateRow("x", { family: "html" });
  delete notCatalog.meta.template_material_id;
  assert.equal(deckDeliveryFamilyOf(notCatalog), "none");
  assert.equal(
    deckDeliveryFamilyOf(
      templateRow("an-image", { artifactType: "single_file_image", family: "html" }),
    ),
    "none",
  );

  // 一屏全是无家族的模板行 + 旧 PPTX：仍然不分节，仍是今天那张平铺网格。
  const shelf = [
    ...LEGACY_ITEMS.slice(0, 4),
    bare,
    templateRow("ppt-year-summary-legacy-2"),
  ].map(entryOf);
  assert.equal(deckDeliverySections(shelf), null);
  const counts = deckDeliveryCounts(shelf);
  assert.equal(counts.pptx, 4);
  assert.equal(counts.html, 0);
  // `none` 不计入 unknown：模板行照旧只是一张普通卡片，不是「判不出家族的 deck」。
  assert.equal(counts.unknown, 0);
});

test("判据 11 · 模板行家族是 html 但 runtime 歪掉：进 HTML 节，没有「查看」地址", () => {
  const hex = "b15b61eb08dfb478236383d2408a7507";
  for (const runtime of [
    `https://s-${hex}.oceanleo.com/embed`,
    `https://s-${hex}.oceanleo.app.evil.example/embed`,
    `http://s-${hex}.oceanleo.app/embed`,
    `https://s-${hex}.oceanleo.app/embed?token=1`,
    `https://s-${hex}.oceanleo.app:8443/embed`,
    "javascript:alert(1)",
  ]) {
    const row = templateRow("ppt-year-summary-3", { family: "html", runtime });
    // 家族是服务端声明的，歪 URL 不改家族——它只让导航入口消失。
    assert.equal(deckDeliveryFamilyOf(row), "html", runtime);
    assert.equal(deckHtmlRuntimeUrl(row), "", `这个 runtime 不该被放行：${runtime}`);
    const plan = deckHtmlOpenPlan(row);
    assert.equal(plan.view.visible, false);
    assert.equal(plan.view.url, "");
  }
});

test("判据 12 · durable 行一步都不走这条分支：真交付物仍是唯一说话的人", () => {
  // 往一件真 PPTX 的 meta 里塞满目录行的键，也不许把它搬进 HTML 板块。
  const spoofed = deckItem({
    id: "legacy-with-catalog-meta",
    title: "旧演示",
    sourceFormat: "pptx",
    full: {
      url: "https://signed.example/legacy.pptx",
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
    source: null,
    meta: {
      template_material_id: "ppt-year-summary-9",
      template_material_artifact_type: "deck",
      deliveryFamily: "html",
      activeRuntimeUrl: H1_RUNTIME["deck-html-manual-01"],
    },
  });
  // 结果是既有那条冲突判据给的 `unknown`（声明与交付表示打架 → 不归任何一边），
  // 不是新分支给的 `html`：durable 行的判法逐字没动。
  assert.equal(deckDeliveryFamilyOf(spoofed), "unknown");
  assert.equal(deckHtmlRuntimeUrl(spoofed), "");
  assert.equal(deckHtmlOpenPlan(spoofed).view.visible, false);

  // 声明与交付表示一致时也仍然由交付表示说话，走的是原来那条路。
  const honest = deckItem({
    id: "legacy-honest",
    title: "旧演示",
    sourceFormat: "pptx",
    full: {
      url: "https://signed.example/legacy2.pptx",
      mediaType: PPTX_MEDIA_TYPE,
      format: "pptx",
    },
    source: null,
    meta: {
      template_material_id: "ppt-year-summary-10",
      template_material_artifact_type: "deck",
      deliveryFamily: "pptx",
    },
  });
  assert.equal(deckDeliveryFamilyOf(honest), "pptx");
});

test("探索页把分板块函数接到货架上，未接线会当场红", () => {
  const html = renderToStaticMarkup(
    createElement(MaterialLibrary, {
      materials: [],
      siteId: "ppt",
      appId: "slide",
      contextId: "olctx:v1:ppt:app:slide",
      fetchPrimary: false,
      onOpenItem: () => {},
      featuredEntries: SHELF_ENTRIES,
    }),
  );
  assert.match(html, /data-deck-sections="deck-pptx:275,deck-html:3"/);
  assert.match(html, /data-open-item-handoff="true"/);
});
