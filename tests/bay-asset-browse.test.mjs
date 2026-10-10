import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildPanelsFromCategories, categoryLabel, PPT_INDUSTRIES } from "../src/shell/bay/asset/asset-taxonomy.ts";
import {
  DOCUMENT_ZONES,
  DOCUMENT_ZONE_SLUGS,
  documentZoneBySlug,
  documentZoneHref,
  documentZonesForType,
} from "../src/shell/bay/asset/document-zones.ts";
import {
  applyAssetBrowseSearch,
  browseViewFor,
  defaultZone,
  hasSeriesFilter,
  parseAssetBrowseSearch,
  parseZone,
  seriesZoneOf,
  zoneCategories,
  zoneTotal,
} from "../src/shell/bay/asset/origin-index.ts";
import {
  SHELF_PIN_LIMIT,
  WASH_PIN_CATEGORIES,
  applyMatcherPins,
  applyShelfPins,
  attachShelfPins,
  itemMatchesPin,
  libraryPrefixedId,
  matchersFor,
  normalizeLibraryId,
} from "../src/shell/bay/asset/shelf-pins.ts";

const LIBRARY = readFileSync(new URL("../src/shell/bay/asset/BayAssetLibrary.tsx", import.meta.url), "utf8");
const LIVE = readFileSync(new URL("../src/shell/bay/asset/BayAssetLive.tsx", import.meta.url), "utf8");
const SERIES = readFileSync(new URL("../src/shell/bay/asset/BayAssetSeries.tsx", import.meta.url), "utf8");

test("索引里的分区件数与默认分区选择", () => {
  const index = {
    type: "image",
    categories: [
      { key: "food", origin: "first-party", total: 170, sample: [] },
      { key: "icon", origin: "external", total: 3, sample: [] },
    ],
    shelfTotal: 173,
    totalByOrigin: { "first-party": 170, external: 3 },
    mixedCategories: [],
    failed: false,
    incomplete: false,
    countsFromServer: true,
  };
  assert.equal(zoneTotal(index, "first-party"), 170);
  assert.equal(zoneTotal(index, "external"), 3);
  assert.deepEqual(
    zoneCategories(index, "first-party").map((item) => item.key),
    ["food"],
  );
  assert.equal(defaultZone("image", { owned: 170, stocked: 3 }), "owned");
  assert.equal(defaultZone("vector", { owned: 0, stocked: 40607 }), "stocked");
  assert.equal(defaultZone("document", { owned: 0, stocked: 0 }), "owned");
  assert.equal(defaultZone("image", { owned: 0, stocked: 0 }), "live");
  assert.equal(hasSeriesFilter("image", "owned"), true);
  assert.equal(hasSeriesFilter("image", "stocked"), false);
  assert.equal(seriesZoneOf("vector"), "stocked");
  assert.equal(parseZone("library", "image"), "owned");
  assert.equal(parseZone("open", "image"), "live");
  assert.equal(parseZone("open", "document"), "owned");
  assert.equal(parseZone("series", "ppt"), "owned");
});

test("目录面板构造：策划顺序在前，文档分区用中文名", () => {
  const panels = buildPanelsFromCategories("document", [
    "document-template",
    "legal-contract-model",
    "resume-template",
  ]);
  assert.deepEqual(
    panels.map((item) => item.key),
    ["legal-contract-model", "resume-template", "document-template"],
  );
  assert.equal(panels[0].label, "合同区");
  assert.equal(categoryLabel("etching"), "蚀刻编辑风");
  assert.equal(categoryLabel("legal-diligence"), "尽职调查区");
  assert.ok(PPT_INDUSTRIES.some((item) => item.key === "ind-edu" && item.label === "教育培训"));
  const sticker = buildPanelsFromCategories("sticker", ["hot", "unknown-cat"]);
  assert.equal(sticker[0].key, "hot");
  assert.ok(sticker[0].subs.length > 1);
  assert.equal(sticker[1].key, "unknown-cat");
  assert.deepEqual(sticker[1].subs.map((item) => item.key), [""]);
});

test("八类各有置顶槽，且不再钉 v2 废品 uuid", () => {
  assert.deepEqual([...WASH_PIN_CATEGORIES], [
    "legal-contract-model",
    "legal-diligence",
    "legal-litigation-form",
    "legal-lawyer-template",
    "resume-template",
    "flowchart-diagram",
    "longform-poster",
    "ecommerce-detail",
  ]);
  assert.equal(SHELF_PIN_LIMIT, 3);
  assert.deepEqual(matchersFor("legal-contract-model"), []);
  assert.deepEqual(matchersFor("legal-litigation-form"), []);
  assert.equal(matchersFor("resume-template").length, 3);
  assert.ok(matchersFor("resume-template").every((item) => item.titlePrefix?.startsWith("OLR-")));
  assert.ok(matchersFor("flowchart-diagram").every((item) => item.source === "oceanleo-flowchart-wash"));
  assert.deepEqual(matchersFor("not-a-wash-cat"), []);
});

test("id 带不带 library: 前缀都能对上", () => {
  assert.equal(normalizeLibraryId("library:abc-1"), "abc-1");
  assert.equal(normalizeLibraryId("abc-1"), "abc-1");
  assert.equal(libraryPrefixedId("abc-1"), "library:abc-1");
  assert.equal(libraryPrefixedId("library:abc-1"), "library:abc-1");
});

test("applyShelfPins 把钉住的提到最前，缺件的槽空着，其余保持原序", () => {
  const items = [
    { id: "library:old-1" },
    { id: "library:old-2" },
    { id: "library:pin-b" },
    { id: "library:old-3" },
  ];
  const extras = [{ id: "library:pin-a" }];
  const out = applyShelfPins(items, ["pin-a", "pin-b", "pin-c"], extras);
  assert.deepEqual(
    out.map((item) => item.id),
    ["library:pin-a", "library:pin-b", "library:old-1", "library:old-2", "library:old-3"],
  );
});

test("标题前缀钉把匹配件提前，缺件跳过不拿别人顶上", () => {
  const items = [
    { id: "library:old", title: "旧件" },
    { id: "library:olr2", title: "OLR-0002 唯美四页" },
  ];
  const extras = [{ id: "library:olr1", title: "OLR-0001 创意三页" }];
  const out = applyMatcherPins(items, matchersFor("resume-template"), extras);
  assert.deepEqual(
    out.map((item) => item.id),
    ["library:olr1", "library:olr2", "library:old"],
  );
});

test("source 钉把约定来源提到最前，货还没到就保持原序", () => {
  const empty = applyMatcherPins(
    [{ id: "library:old", source: "other" }],
    matchersFor("longform-poster"),
  );
  assert.deepEqual(empty.map((item) => item.id), ["library:old"]);

  const items = [
    { id: "library:a", source: "other" },
    { id: "library:b", source: "oceanleo-poster-wash" },
    { id: "library:c", source: "oceanleo-poster-wash" },
    { id: "library:d", source: "oceanleo-poster-wash" },
  ];
  const out = applyMatcherPins(items, matchersFor("longform-poster"));
  assert.deepEqual(
    out.map((item) => item.id),
    ["library:b", "library:c", "library:d", "library:a"],
  );
});

test("第 2 页会把已按标题钉的件滤掉；无标题钉的类原样返回", async () => {
  const page2 = await attachShelfPins({
    category: "not-a-wash-cat",
    page: 2,
    items: [{ id: "library:x" }],
    searchPinned: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.deepEqual(page2, [{ id: "library:x" }]);

  const resumePage2 = await attachShelfPins({
    category: "resume-template",
    page: 2,
    items: [
      { id: "library:olr1", title: "OLR-0001 x" },
      { id: "library:other", title: "其它" },
    ],
  });
  assert.deepEqual(
    resumePage2.map((item) => item.id),
    ["library:other"],
  );
});

test("第 1 页缺件时按标题前缀去搜，搜不到就空着那个槽", async () => {
  const fetched = [];
  const out = await attachShelfPins({
    category: "resume-template",
    page: 1,
    items: [{ id: "library:old", title: "旧件" }],
    searchPinned: async (matcher) => {
      fetched.push(matcher.titlePrefix);
      if (matcher.titlePrefix === "OLR-0002") {
        return { id: "library:olr2", title: "OLR-0002 唯美四页" };
      }
      throw new Error("not ingested");
    },
  });
  assert.deepEqual(fetched, ["OLR-0001", "OLR-0002", "OLR-0003"]);
  assert.deepEqual(
    out.map((item) => item.id),
    ["library:olr2", "library:old"],
  );
});

test("itemMatchesPin 认标题前缀和 source", () => {
  assert.equal(
    itemMatchesPin({ id: "1", title: "OLR-0001 简历" }, { titlePrefix: "OLR-0001" }),
    true,
  );
  assert.equal(
    itemMatchesPin({ id: "1", title: "其它" }, { titlePrefix: "OLR-0001" }),
    false,
  );
  assert.equal(
    itemMatchesPin({ id: "1", source: "oceanleo-poster-wash" }, { source: "oceanleo-poster-wash" }),
    true,
  );
});

test("八个分区一个不少，标题是中文直白名不是英文 category", () => {
  assert.deepEqual(
    DOCUMENT_ZONES.map((zone) => zone.title),
    [
      "合同区",
      "尽职调查区",
      "诉讼文书区",
      "律师文书区",
      "简历区",
      "流程架构图区",
      "长图海报区",
      "电商详情区",
    ],
  );
  assert.deepEqual(
    DOCUMENT_ZONES.map((zone) => zone.category),
    [
      "legal-contract-model",
      "legal-diligence",
      "legal-litigation-form",
      "legal-lawyer-template",
      "resume-template",
      "flowchart-diagram",
      "longform-poster",
      "ecommerce-detail",
    ],
  );
  for (const zone of DOCUMENT_ZONES) {
    assert.notEqual(zone.title, zone.category);
    assert.match(zone.title, /区$/);
    assert.equal(documentZoneHref(zone.slug), `/zones/${zone.slug}`);
    assert.equal(documentZoneBySlug(zone.slug)?.category, zone.category);
  }
  assert.equal(documentZoneBySlug("not-a-zone"), undefined);
  assert.deepEqual(DOCUMENT_ZONE_SLUGS, DOCUMENT_ZONES.map((zone) => zone.slug));
  assert.deepEqual(documentZonesForType("document").map((zone) => zone.slug), [
    "contract",
    "diligence",
    "litigation",
    "lawyer",
    "resume",
  ]);
});

test("官方来源分区标出国家编号，自有分区不冒充官方", () => {
  const contract = documentZoneBySlug("contract");
  const diligence = documentZoneBySlug("diligence");
  const litigation = documentZoneBySlug("litigation");
  const resume = documentZoneBySlug("resume");
  assert.ok(contract.officialNumbers.includes("GF-2026-24"));
  assert.ok(diligence.officialNumbers.includes("证监会公告〔2022〕36号"));
  assert.ok(diligence.officialNumbers.includes("证监会公告〔2022〕35号"));
  assert.equal(contract.licenseKind, "official-public-domain");
  assert.equal(diligence.licenseKind, "official-public-domain");
  assert.equal(litigation.licenseKind, "official-public-domain");
  assert.equal(resume.licenseKind, "oceanleo-owned");
  assert.deepEqual(resume.officialNumbers, []);
  assert.equal(contract.licenseLabel, "官方公有领域");
  assert.equal(resume.licenseLabel, "OceanLeo 自有");
});

test("文档分区页头画授权标签和格式说明，空区是整理中", () => {
  assert.match(LIBRARY, /整理中/);
  assert.match(LIBRARY, /官方原文/);
  assert.match(LIBRARY, /许可来源/);
  assert.match(LIBRARY, /可下载格式/);
  assert.match(LIBRARY, /素材数/);
  assert.match(LIBRARY, /文档分区/);
  assert.doesNotMatch(LIBRARY, /throw /);
});

test("地址参数解析与写回，不碰别人管的参数", () => {
  const parsed = parseAssetBrowseSearch(
    "?kind=asset&type=ppt&view=owned&cat=etching&series=1&asset=library:abc&q=海报&category=word&bay=feed",
  );
  assert.equal(parsed.type, "ppt");
  assert.equal(parsed.view, "owned");
  assert.equal(parsed.cat, "etching");
  assert.equal(parsed.series, true);
  assert.equal(parsed.asset, "library:abc");

  const slug = parseAssetBrowseSearch("?cat=contract");
  assert.equal(slug.cat, "legal-contract-model");

  const liveOnDoc = parseAssetBrowseSearch("?type=document&view=live");
  assert.equal(browseViewFor("document", liveOnDoc), "owned");

  const written = applyAssetBrowseSearch(
    "?kind=asset&q=海报&category=word&bay=feed&foo=1",
    { type: "image", view: "stocked", cat: "food", series: false, asset: "library:xyz" },
  );
  const next = new URLSearchParams(written);
  assert.equal(next.get("kind"), "asset");
  assert.equal(next.get("q"), "海报");
  assert.equal(next.get("category"), "word");
  assert.equal(next.get("bay"), "feed");
  assert.equal(next.get("foo"), "1");
  assert.equal(next.get("type"), "image");
  assert.equal(next.get("view"), "stocked");
  assert.equal(next.get("cat"), "food");
  assert.equal(next.get("series"), null);
  assert.equal(next.get("asset"), "library:xyz");
  assert.match(written, /library:xyz/);

  const cleared = applyAssetBrowseSearch(written, { cat: "", asset: "", view: null });
  const clearedParams = new URLSearchParams(cleared);
  assert.equal(clearedParams.get("cat"), null);
  assert.equal(clearedParams.get("asset"), null);
  assert.equal(clearedParams.get("view"), null);
  assert.equal(clearedParams.get("kind"), "asset");
  assert.equal(clearedParams.get("type"), "image");
});

test("BayAssetLibrary 筛选进工具条下拉，不再出现 flex-wrap 筛选排", () => {
  assert.match(LIBRARY, /BayToolbarFilters/);
  assert.match(LIBRARY, /BayFilterSelect/);
  assert.match(LIBRARY, /name="type"/);
  assert.match(LIBRARY, /name="view"/);
  assert.match(LIBRARY, /name="cat"/);
  assert.match(LIBRARY, /授权说明/);
  assert.match(LIBRARY, /BayLicensesView/);
  assert.match(LIBRARY, /BayAssetCard/);
  assert.match(LIBRARY, /BayAssetDetail/);
  assert.match(LIBRARY, /BayAssetSeries/);
  assert.match(LIBRARY, /BayAssetLive/);
  assert.match(LIBRARY, /history\.replaceState|replaceBrowseUrl/);
  assert.match(LIBRARY, /fetchBayAssetById/);
  assert.doesNotMatch(LIBRARY, /flex-wrap/);
  assert.doesNotMatch(LIBRARY, /data-bay-asset-types/);
  assert.doesNotMatch(LIBRARY, /data-bay-asset-zones/);
  assert.doesNotMatch(LIBRARY, /data-bay-asset-rooms/);
  assert.match(LIVE, /searchBayLive/);
  assert.doesNotMatch(LIVE, /<input/);
  assert.match(SERIES, /listBaySeries/);
  assert.ok(fileURLToPath(new URL("../src/shell/bay/asset/origin-index.ts", import.meta.url)));
});
