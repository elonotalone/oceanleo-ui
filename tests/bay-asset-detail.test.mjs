// 素材详情 / 来源授权 / 放大预览 / 不可信渲染面。对着新文件搬原站断言。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  assetFormat,
  assetFileName,
  dimensionLabel,
  formatByteSize,
  officialDocNumbers,
} from "../src/shell/bay/asset/asset-file-meta.ts";
import { downloadHref, pptPageUrls } from "../src/shell/bay/asset/detail-client.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ownedSrc = [
  "src/shell/bay/asset/BayAssetCard.tsx",
  "src/shell/bay/asset/BayAssetDetail.tsx",
  "src/shell/bay/asset/BayLicensesView.tsx",
  "src/shell/bay/asset/BayAssetProvenance.tsx",
  "src/shell/bay/asset/BayLicenseBadge.tsx",
  "src/shell/bay/asset/BayModelViewer.tsx",
  "src/shell/bay/asset/BayZoomablePreview.tsx",
  "src/shell/bay/asset/asset-file-meta.ts",
  "src/shell/bay/asset/detail-client.ts",
];

function source(rel) {
  return readFileSync(join(here, "..", rel), "utf8");
}

function render(node) {
  return renderToStaticMarkup(node);
}

const uiStub = dataModule(
  "export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m,k)=> k in vars ? String(vars[k]) : m) : zh; }",
);
const stubs = { "../../../i18n/ui/useUI": uiStub };

const {
  BayAssetOriginChip,
  BayAssetProvenance,
  PROVENANCE_FIXTURES,
  deriveProvenance,
  safeHttpUrl,
} = await import(await compileModule("src/shell/bay/asset/BayAssetProvenance.tsx", stubs));
const { BayLicenseBadge, BayLicenseFlags } = await import(
  await compileModule("src/shell/bay/asset/BayLicenseBadge.tsx", stubs)
);

const { firstParty, externalCc0, externalApache } = PROVENANCE_FIXTURES;

function licenseOf(fixture) {
  const l = fixture.license || {};
  return {
    code: l.code || "",
    name: l.name || "",
    url: l.url || "",
    commercial_ok: l.commercial_ok !== false,
    modify_ok: l.modify_ok !== false,
    attribution_required: l.attribution_required === true,
    attribution_text: l.attribution_text || "",
  };
}

test("自产素材按来源认出，不依赖 origin 列", () => {
  assert.equal(deriveProvenance(firstParty).origin, "first-party");
  assert.equal(deriveProvenance(externalCc0).origin, "external");
  assert.equal(deriveProvenance(externalApache).origin, "external");
});

test("服务端 origin 一旦上线就优先于按来源的推导", () => {
  const overridden = { ...firstParty, origin: "external" };
  assert.equal(deriveProvenance(overridden).origin, "external");
});

test("自产素材恒为禁止再分发；外部素材没明说可以就当不可以", () => {
  assert.equal(deriveProvenance(firstParty).redistributeOk, false);
  assert.equal(deriveProvenance(externalCc0).redistributeOk, false);
  assert.equal(
    deriveProvenance({ ...externalCc0, redistribute_ok: true }).redistributeOk,
    true,
  );
  assert.equal(
    deriveProvenance({ ...firstParty, redistribute_ok: true }).redistributeOk,
    false,
  );
});

test("Free-Commercial / OFL 的开源字体不许被说成 OceanLeo 自产", () => {
  const ofl = {
    source: "opensource-font",
    source_url: "https://fonts.example/x",
    license: {
      code: "OFL",
      name: "SIL Open Font License 1.1",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: true,
    },
  };
  const freeCommercial = { ...ofl, license: { ...ofl.license, code: "Free-Commercial" } };
  assert.equal(deriveProvenance(ofl).origin, "external");
  assert.equal(deriveProvenance(freeCommercial).origin, "external");
  assert.match(render(React.createElement(BayAssetProvenance, { asset: ofl })), /必须附带许可证原文/);
  assert.ok(!render(React.createElement(BayAssetProvenance, { asset: ofl })).includes("OceanLeo 自产"));
});

test("自产素材的产权块里没有 CC0 字样，且明说禁止再分发", () => {
  const html = render(React.createElement(BayAssetProvenance, { asset: firstParty }));
  assert.ok(!html.includes("CC0"), "自产素材不许出现 CC0 字样");
  assert.match(html, /OceanLeo 自产/);
  assert.match(html, /禁止再分发/);
  assert.match(html, /可商用/);
  assert.match(html, /legal\/first-party-assets/);
});

test("库里挂着 license_code=CC0 的自产素材，角标也不显示 CC0", () => {
  const cc0FirstParty = {
    source: "oceanleo-design",
    source_url: "https://example.invalid/x.json",
    license: {
      code: "CC0",
      name: "CC0",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  };
  const badge = render(
    React.createElement(BayLicenseBadge, {
      license: licenseOf(cc0FirstParty),
      asset: cc0FirstParty,
    }),
  );
  assert.ok(!badge.includes("CC0"), "自产素材的授权角标不许显示 CC0");
  assert.match(badge, /免费商用/);

  const flags = render(
    React.createElement(BayLicenseFlags, {
      license: licenseOf(cc0FirstParty),
      asset: cc0FirstParty,
    }),
  );
  assert.ok(!flags.includes("CC0"));
  assert.match(flags, /禁止再分发/);

  const block = render(React.createElement(BayAssetProvenance, { asset: cc0FirstParty }));
  assert.ok(!block.includes("CC0"));
});

test("Apache-2.0 明说必须附带许可证原文，CC0 不说", () => {
  const apache = render(React.createElement(BayAssetProvenance, { asset: externalApache }));
  const cc0 = render(React.createElement(BayAssetProvenance, { asset: externalCc0 }));
  assert.match(apache, /必须附带许可证原文/);
  assert.ok(
    !cc0.includes("必须附带许可证原文"),
    "CC0 没有随附原文的义务，不许照抄 Apache 的话",
  );
  assert.match(cc0, /无附加义务/);
  assert.notEqual(apache, cc0, "两种授权渲染出来不许一模一样");
});

test("权限行里 Apache-2.0 与 CC0 也不一样", () => {
  const apache = render(React.createElement(BayLicenseFlags, { license: licenseOf(externalApache) }));
  const cc0 = render(React.createElement(BayLicenseFlags, { license: licenseOf(externalCc0) }));
  assert.match(apache, /必须附带许可证原文/);
  assert.ok(!cc0.includes("必须附带许可证原文"));
});

test("share-alike 的素材说明衍生作品要沿用同一授权", () => {
  const sa = {
    source: "openverse",
    source_url: "https://example.org/a",
    license: {
      code: "CC-BY-SA",
      name: "CC Attribution-ShareAlike",
      url: "https://creativecommons.org/licenses/by-sa/4.0/",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: true,
      attribution_text: "x",
    },
  };
  assert.match(
    render(React.createElement(BayAssetProvenance, { asset: sa })),
    /衍生作品必须沿用相同授权条款/,
  );
});

test("未登记条款的 code 渲染成请自行核对，不渲染成无义务", () => {
  const unknown = {
    source: "somewhere",
    source_url: "https://example.org/a",
    license: {
      code: "SOME-NEW-LICENSE",
      name: "Some New License",
      url: "",
      commercial_ok: true,
      modify_ok: true,
      attribution_required: false,
      attribution_text: "",
    },
  };
  const html = render(React.createElement(BayAssetProvenance, { asset: unknown }));
  assert.match(html, /请自行核对原始许可证/);
  assert.ok(!html.includes("无附加义务"));
});

test("UNKNOWN 与 arXiv 这类 family=unknown 的 code 也走最严那一支", () => {
  for (const code of ["UNKNOWN", "ARXIV-PERPETUAL-1.0", "WB-MICRODATA"]) {
    const f = deriveProvenance({ source: "x", license: { code } });
    assert.equal(f.noticeRequired, undefined, `${code} 不许被当成无 notice 义务`);
    assert.equal(f.shareAlike, undefined);
  }
});

test("下载资格是三态，缺字段时说未标注而不是能或不能", () => {
  assert.equal(deriveProvenance({ source: "x", supply_tier: "byte-portable" }).downloadable, true);
  assert.equal(deriveProvenance({ source: "x", supply_tier: "link-only" }).downloadable, false);
  assert.equal(deriveProvenance({ source: "x" }).downloadable, undefined);
  const html = render(
    React.createElement(BayAssetProvenance, {
      asset: { source: "svgrepo", source_url: "https://a.example/b", license: { code: "CC0" } },
    }),
  );
  assert.match(html, /下载资格未标注/);
});

test("外部素材渲染可点开的出处链接", () => {
  const html = render(React.createElement(BayAssetProvenance, { asset: externalApache }));
  assert.match(html, /href="https:\/\/www\.svgrepo\.com\/svg\/303108\/apache-logo"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /svgrepo\.com/);
});

test("自产素材不把内部 JSON 当出处渲染", () => {
  const html = render(React.createElement(BayAssetProvenance, { asset: firstParty }));
  assert.ok(
    !html.includes("internal/mc-logo-02.json"),
    "自产素材的 source_url 指向内部 JSON，不是出处，不许渲染成可点链接",
  );
  assert.equal(deriveProvenance(firstParty).sourceUrl, "");
});

test("非 http(s) 的出处一律不渲染成链接", () => {
  assert.equal(safeHttpUrl("javascript:alert(1)"), "");
  assert.equal(safeHttpUrl("data:text/html,<script>"), "");
  assert.equal(safeHttpUrl("  not a url  "), "");
  assert.equal(safeHttpUrl("https://ok.example/a"), "https://ok.example/a");
  const html = render(
    React.createElement(BayAssetProvenance, {
      asset: { source: "svgrepo", source_url: "javascript:alert(1)", license: { code: "CC0" } },
    }),
  );
  assert.ok(!html.includes("javascript:"));
  assert.match(html, /该来源未提供可跳转的原始页面/);
});

test("卡片角标一眼分清自产与外部", () => {
  assert.match(render(React.createElement(BayAssetOriginChip, { asset: firstParty })), /自产/);
  assert.match(render(React.createElement(BayAssetOriginChip, { asset: externalCc0 })), /外部/);
});

test("缩放档位从铺满栏宽起，能放大到四倍", () => {
  const PREVIEW = source("src/shell/bay/asset/BayZoomablePreview.tsx");
  assert.match(PREVIEW, /PREVIEW_ZOOM_STEPS = \[1, 1\.5, 2, 3, 4\]/);
});

test("看图器按宽度铺开，高度随比例，不给 img 加 max-height", () => {
  const PREVIEW = source("src/shell/bay/asset/BayZoomablePreview.tsx");
  assert.match(PREVIEW, /width: `\$\{zoom \* 100}%`/);
  assert.match(PREVIEW, /height: "auto"/);
  assert.match(PREVIEW, /maxWidth: "none"/);
  assert.doesNotMatch(PREVIEW, /className=\{?[`'"][^`'"]*object-contain/);
  assert.doesNotMatch(PREVIEW, /max-h-\[50vh\]/);
  assert.match(PREVIEW, /overflow-auto/);
  assert.match(PREVIEW, /全屏查看/);
  assert.match(PREVIEW, /cursor-zoom-in/);
  assert.match(PREVIEW, /ctrlKey/);
});

test("详情页图片、文档预览、PPT 页都走看图器", () => {
  const DETAIL = source("src/shell/bay/asset/BayAssetDetail.tsx");
  assert.doesNotMatch(DETAIL, /function ZoomImage/);
  assert.match(DETAIL, /<BayZoomablePreview/);
  assert.match(DETAIL, /function DocumentPreview/);
  assert.match(DETAIL, /function PptPager/);
  assert.match(DETAIL, /preview = asset\.preview_url \|\| asset\.thumb_url/);
  assert.match(DETAIL, /<BayZoomablePreview[\s\S]*full=\{preview\}/);
  assert.match(DETAIL, /pages\[idx\]/);
  assert.doesNotMatch(DETAIL, /max-h-\[50vh\] w-full object-contain/);
  assert.doesNotMatch(DETAIL, /mx-auto max-h-40 object-contain/);
});

test("UC-3 图表 iframe 不得拿到同源能力", () => {
  const assetDetailSrc = source("src/shell/bay/asset/BayAssetDetail.tsx");
  const chartFrame = assetDetailSrc.slice(
    assetDetailSrc.indexOf("function ChartFrame"),
    assetDetailSrc.indexOf("function CopyButton"),
  );
  assert.ok(chartFrame.includes("<iframe"), "ChartFrame 应当仍在渲染 iframe");
  assert.match(chartFrame, /sandbox="allow-scripts"/);
  assert.doesNotMatch(chartFrame, /allow-same-origin/);
  assert.doesNotMatch(chartFrame, /allow-top-navigation/);
  assert.doesNotMatch(chartFrame, /allow-popups-to-escape-sandbox/);
});

test("UC-3 详情里任何 iframe 都不得同时给脚本与同源", () => {
  const assetDetailSrc = source("src/shell/bay/asset/BayAssetDetail.tsx");
  for (const [, value] of assetDetailSrc.matchAll(/sandbox="([^"]*)"/g)) {
    const tokens = value.split(/\s+/).filter(Boolean);
    assert.ok(
      !(tokens.includes("allow-scripts") && tokens.includes("allow-same-origin")),
      `BayAssetDetail.tsx 的 sandbox="${value}" 同时给了 allow-scripts 与 allow-same-origin`,
    );
  }
});

test("归属实现文件没有禁用的渲染面与旧站链接", () => {
  const htmlSink = ["dangerously", "Set", "Inner", "HTML"].join("");
  const oldHost = ["asset.", "oceanleo"].join("");
  const nextImport = ["ne", "xt/"].join("");
  for (const rel of ownedSrc) {
    const text = source(rel);
    assert.ok(!text.includes(htmlSink), `${rel} 含 HTML 注入`);
    assert.ok(!text.includes(oldHost), `${rel} 仍指向旧素材站`);
    assert.ok(!text.includes(nextImport), `${rel} 引入了站点框架模块`);
  }
});

test("文件信息：缺宽高不拼字，编号只认官方格式", () => {
  assert.equal(dimensionLabel(null, null), null);
  assert.equal(dimensionLabel(800, 600), "800 × 600");
  assert.equal(formatByteSize(null), null);
  assert.equal(formatByteSize(1200), "1.2 KB");
  assert.equal(assetFormat({ format: "docx" }), "docx");
  assert.equal(assetFileName({ title: "合同", format: "docx" }), "合同.docx");
  assert.deepEqual(officialDocNumbers(["GF-2026-2621", "noise", "GF-2026-2621"]), ["GF-2026-2621"]);
});

test("库内 PPT 按 pages 标签拼预览页；下载走原文件或网关", () => {
  const pages = pptPageUrls({
    tags: ["pages:3"],
    full_url: "https://cdn.example/decks/a/deck.pptx",
  });
  assert.deepEqual(pages, [
    "https://cdn.example/decks/a/p01.webp",
    "https://cdn.example/decks/a/p02.webp",
    "https://cdn.example/decks/a/p03.webp",
  ]);
  assert.equal(
    downloadHref({ id: "library:1", source: "oceanleo", full_url: "https://cdn.example/f.pptx" }),
    "https://cdn.example/f.pptx",
  );
  assert.match(
    downloadHref({ id: "polyhaven:rock", source: "polyhaven", full_url: "" }),
    /\/v1\/assets\/download\?id=polyhaven%3Arock/,
  );
});
