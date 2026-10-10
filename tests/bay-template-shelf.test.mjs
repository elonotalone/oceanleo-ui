import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BAY_OWNED_ORIGIN_TYPE,
  BAY_TEMPLATE_ARTIFACT_TYPE,
  listBayOfficialTemplates,
  mergeOwnedAssets,
  mineArtifactTypeForBay,
  officialTemplatePreviewHref,
  originLibraryTypeForBay,
  templateArtifactTypeForBay,
  templateMaterialToBayAsset,
} from "../src/shell/bay/asset/bay-template-shelf.ts";
import {
  BAY_ASSET_TYPE_LABELS,
  BAY_ASSET_TYPE_ORDER,
} from "../src/shell/bay/asset/library-client.ts";
import {
  TYPE_ZONES,
  ZONE_LABELS,
  isBayAssetType,
  parseZone,
} from "../src/shell/bay/asset/origin-index.ts";
import {
  invalidateTemplateMaterialCache,
  listTemplateMaterials,
} from "../src/shell/material-library-template-source.ts";
import { workspaceTemplatePreviewHref } from "../src/shell/site-catalog-controller.ts";

const LIBRARY = readFileSync(
  new URL("../src/shell/bay/asset/BayAssetLibrary.tsx", import.meta.url),
  "utf8",
);
const SHELF = readFileSync(
  new URL("../src/shell/bay/asset/bay-template-shelf.ts", import.meta.url),
  "utf8",
);
const CARD = readFileSync(
  new URL("../src/shell/bay/asset/BayAssetCard.tsx", import.meta.url),
  "utf8",
);

function stubFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    return handler(String(url), init || {});
  };
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

test("Bay 类型映射到模板 artifactType 与原件货架 type", () => {
  const expected = {
    website: ["website", "website"],
    ppt: ["deck", "ppt"],
    document: ["document", "document"],
    poster: ["composite_image", null],
    chart: ["chart", "chart"],
    vector: ["vector_image", "vector"],
    "3d": ["model_3d", "3d"],
    video: ["video", "video"],
    audio: ["audio", "audio"],
    grid: ["grid", "sheet"],
    workflow: ["workflow", "video_workflow"],
    game: ["game", null],
    pdf: ["pdf", "pdf"],
  };
  for (const [bayType, [artifactType, originType]] of Object.entries(expected)) {
    assert.equal(templateArtifactTypeForBay(bayType), artifactType, bayType);
    assert.equal(BAY_TEMPLATE_ARTIFACT_TYPE[bayType], artifactType, bayType);
    assert.equal(originLibraryTypeForBay(bayType), originType, bayType);
    assert.equal(BAY_OWNED_ORIGIN_TYPE[bayType] || null, originType, bayType);
  }
  assert.equal(templateArtifactTypeForBay("image"), null);
  assert.equal(originLibraryTypeForBay("image"), "image");
  assert.equal(mineArtifactTypeForBay("image"), "single_file_image");
  assert.equal(mineArtifactTypeForBay("ppt"), "deck");
});

test("新类型进下拉：海报 / 表格 / 工作流 / 游戏 / PDF", () => {
  for (const type of ["poster", "grid", "workflow", "game", "pdf"]) {
    assert.equal(isBayAssetType(type), true, type);
    assert.ok(BAY_ASSET_TYPE_ORDER.includes(type), type);
    assert.ok(BAY_ASSET_TYPE_LABELS[type], type);
  }
  assert.equal(BAY_ASSET_TYPE_LABELS.poster, "海报");
  assert.equal(BAY_ASSET_TYPE_LABELS.grid, "表格");
  assert.equal(BAY_ASSET_TYPE_LABELS.workflow, "工作流");
  assert.equal(BAY_ASSET_TYPE_LABELS.game, "游戏");
  assert.equal(BAY_ASSET_TYPE_LABELS.pdf, "PDF");
});

test("来源有「我的」一档，stocked / live 还在", () => {
  assert.deepEqual(TYPE_ZONES, ["owned", "mine", "stocked", "live"]);
  assert.equal(ZONE_LABELS.mine, "我的");
  assert.equal(ZONE_LABELS.owned, "OceanLeo 自有");
  assert.equal(ZONE_LABELS.stocked, "开源专区（已入库）");
  assert.equal(ZONE_LABELS.live, "实时搜索");
  assert.equal(parseZone("mine", "website"), "mine");
  assert.equal(parseZone("owned", "website"), "owned");
  assert.match(LIBRARY, /data-bay-asset-mine/);
  assert.match(LIBRARY, /BaySignInPrompt/);
});

test("listTemplateMaterials({ artifactType: \"website\" }) 会打 artifactType=website", async () => {
  invalidateTemplateMaterialCache();
  const fetchStub = stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: "web-1",
          title: "站",
          summary: "",
          tags: [],
          previewUrl: "tpl-material/web-1",
          artifactId: "11111111-1111-4111-8111-111111111111",
          artifactType: "website",
          siteKey: "website",
          appId: "website",
        },
      ],
    }),
  }));
  try {
    const result = await listTemplateMaterials({ artifactType: "website" });
    assert.equal(result.ok, true);
    assert.equal(fetchStub.calls.length, 1);
    const requested = new URL(fetchStub.calls[0].url);
    assert.equal(requested.searchParams.get("artifactType"), "website");
    assert.equal(requested.searchParams.has("siteKey"), false);
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("官方成品不带 limit 拉全量，混杂目录在客户端按类型切片", async () => {
  invalidateTemplateMaterialCache();
  const websites = Array.from({ length: 8 }, (_, index) => ({
    id: `web-${index + 1}`,
    title: `站 ${index + 1}`,
    summary: "",
    tags: [],
    previewUrl: `tpl-material/web-${index + 1}`,
    artifactId: `11111111-1111-4111-8111-11111111111${index}`,
    artifactType: "website",
    siteKey: "website",
    appId: "landing",
  }));
  const fetchStub = stubFetch(() => ({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        {
          id: "deck-1",
          title: "甲板",
          summary: "",
          tags: [],
          previewUrl: "tpl-material/deck-1",
          artifactId: "22222222-2222-4222-8222-222222222222",
          artifactType: "deck",
          siteKey: "ppt",
          appId: "ppt",
        },
        ...websites,
      ],
      total: 9,
    }),
  }));
  try {
    const preview = await listBayOfficialTemplates({
      type: "website",
      limit: 6,
      offset: 0,
    });
    assert.equal(fetchStub.calls.length, 1);
    const requested = new URL(fetchStub.calls[0].url);
    assert.equal(requested.searchParams.get("artifactType"), "website");
    assert.equal(requested.searchParams.has("limit"), false);
    assert.equal(requested.searchParams.has("offset"), false);
    assert.equal(preview.total, 8);
    assert.equal(preview.items.length, 6);
    assert.equal(preview.hasMore, true);
    assert.equal(preview.items[0].id, "template-material:web-1");
    const next = await listBayOfficialTemplates({
      type: "website",
      limit: 6,
      offset: 6,
    });
    assert.equal(fetchStub.calls.length, 1);
    assert.equal(next.total, 8);
    assert.equal(next.items.length, 2);
    assert.equal(next.hasMore, false);
    assert.equal(next.items[0].id, "template-material:web-7");
  } finally {
    fetchStub.restore();
    invalidateTemplateMaterialCache();
  }
});

test("owned 合并不去掉原件样例", () => {
  const templates = [
    { id: "template-material:web-1", title: "官方站" },
    { id: "template-material:web-2", title: "官方站 2" },
  ];
  const originals = Array.from({ length: 9 }, (_, index) => ({
    id: `library:starter-${index + 1}`,
    title: `启动页 ${index + 1}`,
  }));
  const merged = mergeOwnedAssets(templates, originals);
  assert.equal(merged.length, 11);
  for (const original of originals) {
    assert.ok(
      merged.some((item) => item.id === original.id),
      original.id,
    );
  }
  assert.equal(merged[0].id, "template-material:web-1");
  assert.equal(
    merged.filter((item) => item.shelfKind === "origin").length,
    9,
  );
});

test("官方成品卡片只用 workspaceTemplatePreviewHref，Bay 内不调用 getArtifactEditDecision", () => {
  const material = {
    id: "web-1",
    title: "官方站",
    summary: "",
    tags: ["官网"],
    previewKey: "tpl-material/web-1",
    artifactId: "art-web-1",
    artifactType: "website",
    siteKey: "website",
    appId: "website",
    width: 1280,
    height: 800,
    deliveryFamily: "",
    activeRuntimeUrl: "",
  };
  const asset = templateMaterialToBayAsset(material, "website");
  const href = officialTemplatePreviewHref("website", "art-web-1");
  assert.equal(href, workspaceTemplatePreviewHref("website", "art-web-1"));
  assert.equal(asset.openHref, href);
  assert.match(asset.openHref, /tab=materials/);
  assert.match(asset.openHref, /mode=preview/);
  assert.match(asset.openHref, /item=art-web-1/);
  assert.equal(asset.shelfKind, "official");
  assert.doesNotMatch(SHELF, /getArtifactEditDecision/);
  assert.doesNotMatch(LIBRARY, /getArtifactEditDecision/);
  assert.doesNotMatch(CARD, /getArtifactEditDecision/);
  assert.match(CARD, /openHref/);
  assert.match(LIBRARY, /官方成品/);
});

test("LeoDev 门户上的网站成品链到网站槽，不落到正式站", () => {
  const path = workspaceTemplatePreviewHref("website", "art-web-1");
  const slot = "https://p-2f359b967f994a0f3be30693c92d1781.dev.oceanleo.com";
  const portalHost = "p-62ce000e97d86f914fc8e3877aee3f43.dev.oceanleo.com";
  const href = officialTemplatePreviewHref("website", "art-web-1", "website", {
    host: portalHost,
    embedOriginEnv: `website=${slot}`,
  });
  assert.equal(href, `${slot}${path}`);
  assert.doesNotMatch(href, /website\.oceanleo\.com/);
  const sameSite = officialTemplatePreviewHref("website", "art-web-1", "website", {
    host: "p-2f359b967f994a0f3be30693c92d1781.dev.oceanleo.com",
    embedOriginEnv: `website=${slot}`,
  });
  assert.equal(sameSite, `${slot}${path}`);
  const promptRow = officialTemplatePreviewHref("article", "art-2", "prompt", {
    host: portalHost,
    embedOriginEnv: `website=${slot}`,
  });
  assert.equal(promptRow, workspaceTemplatePreviewHref("article", "art-2"));
});
