/**
 * W3 · 货架素材「点开看到真东西」的判据（PPT 与网站）。
 *
 * 两份投影 fixture 是 2026-08-06 从生产网关匿名取回的真响应裁剪而来
 * （`GET https://api.oceanleo.com/v1/library/items/<artifactId>`，只删掉与
 * rendition 选择无关的字段、并把 access token 截短）。判据锁的是**选谁去渲染**：
 * PPT 必须拿到 pptx 字节而不是封面位图；网站必须拿到页面 HTML 而不是封面 webp。
 *
 * 证据与复现：docs/work-logs/2026-08/explore-inplace-preview/verdicts/W3-delivery.md
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeArtifactProjection,
  selectArtifactRendition,
  viewerRenditionOrder,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  officePackageKindForItem,
  officeViewerRenditionPurposes,
} from "../src/shell/doc-editors/office-file.ts";
import {
  isWebsitePageMediaType,
  websiteInlineOutline,
  websitePaintMode,
} from "../src/shell/website-inline-preview.ts";

const PPTX_MEDIA_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DECK_DIGEST =
  "e3ba41604a216391266e761b92681ce2294d75b50b0dc11b667bf1af5d3305bf";
const WEBSITE_SOURCE_DIGEST =
  "a8b8af9ae9475ecb6ac27a117bf0849d7876b2631cb66ff596abe40e06902f4a";

function rendition(purpose, revisionId, url, mediaType, digest, extra = {}) {
  return {
    purpose,
    revisionId,
    url,
    accessUrl: url,
    mediaType,
    digest,
    expiresAt: "2036-01-01T00:00:00Z",
    ...extra,
  };
}

/** 货架 PPT 模板：preview / full / source 是同一份真 pptx（实测 461,746 B）。 */
function deckProjectionPayload() {
  const artifactId = "9acf68a6-867d-4be5-b3ad-5865f3c1224c";
  const revisionId = "194c396b-e95e-4179-b5fc-08c50eec15cf";
  return {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "deck",
    roles: ["template", "reference"],
    owner: {
      principalId: "platform",
      visibility: "public",
      originSiteKey: "ppt",
      originAppId: "academic-report",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: false,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: false,
      canBind: false,
      canExportSource: true,
    },
    editability: "native",
    editorCapability: "deck-editor",
    sourceFormat: "pptx",
    title: "学术汇报幻灯片 · 暖调剪纸风",
    renditions: {
      thumbnail: rendition(
        "thumbnail",
        revisionId,
        `/v1/artifact-renditions/access/public?artifactId=${artifactId}&revisionId=${revisionId}&purpose=thumbnail`,
        PPTX_MEDIA_TYPE,
        DECK_DIGEST,
      ),
      preview: rendition(
        "preview",
        revisionId,
        `/v1/artifact-renditions/access/public?artifactId=${artifactId}&revisionId=${revisionId}&purpose=preview`,
        PPTX_MEDIA_TYPE,
        DECK_DIGEST,
      ),
      full: rendition(
        "full",
        revisionId,
        "/v1/artifact-renditions/access/eyJhcnRpZmFjdCI6IjlhY2Y2OGE2LWRlY2sifQ",
        PPTX_MEDIA_TYPE,
        DECK_DIGEST,
      ),
      source: rendition(
        "source",
        revisionId,
        `/v1/artifacts/${artifactId}/revisions/${revisionId}/source-tree/`,
        PPTX_MEDIA_TYPE,
        DECK_DIGEST,
      ),
    },
  };
}

/** 货架网站模板：full 是整站 HTML，preview/thumbnail 是封面 webp。 */
function websiteProjectionPayload() {
  const artifactId = "5e8b6f06-2e37-4892-bc4e-a5312ff730a1";
  const revisionId = "c035cf0f-a302-4b55-acf6-ee4d7509f56e";
  return {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "website",
    roles: ["template", "reference"],
    owner: {
      principalId: "platform",
      visibility: "public",
      originSiteKey: "website",
      originAppId: "blog",
      originFunctionId: null,
    },
    access: {
      canRead: true,
      canPreview: true,
      canEdit: false,
      canFork: true,
      canInsert: true,
      canReplace: true,
      canFavorite: false,
      canBind: false,
      canExportSource: true,
    },
    editability: "native",
    editorCapability: "website-editor",
    sourceFormat: "website-source@1",
    title: "礼品定制资讯内容站",
    renditions: {
      thumbnail: rendition(
        "thumbnail",
        revisionId,
        `/v1/artifact-renditions/access/public?artifactId=${artifactId}&revisionId=${revisionId}&purpose=thumbnail`,
        "image/webp",
        "154ef9b7f0677ce90341dd1b0f28284705fea23c28bdafd6176e7f0840cf7977",
      ),
      preview: rendition(
        "preview",
        revisionId,
        `/v1/artifact-renditions/access/public?artifactId=${artifactId}&revisionId=${revisionId}&purpose=preview`,
        "image/webp",
        "88c5c9a76b13fb24a29d45d672ac2b65ada93b6ba923c5894f836d8fc07ca656",
      ),
      full: rendition(
        "full",
        revisionId,
        "/v1/artifact-renditions/access/eyJhcnRpZmFjdCI6IjVlOGI2ZjA2LXdlYiJ9",
        "text/html",
        "45bd80dd3bb91f0bc467c035ad873a02f51c88b0182712885e00d5399a6c086c",
      ),
      source: rendition(
        "source",
        revisionId,
        `/v1/artifacts/${artifactId}/revisions/${revisionId}/source-tree/`,
        "application/json",
        WEBSITE_SOURCE_DIGEST,
      ),
    },
  };
}

test("W3/1 PPT 模板详情取到的是 pptx 字节，不是封面位图", () => {
  const projection = normalizeArtifactProjection(deckProjectionPayload());
  assert.ok(projection, "投影必须能被规范化");
  const item = artifactProjectionToLibraryItem(projection);
  assert.equal(item.kind, "ppt");
  assert.equal(officePackageKindForItem(item), "pptx");
  const purposes = officeViewerRenditionPurposes(item);
  assert.ok(purposes && purposes.length > 0, "office 查看器必须给出明确的取用顺序");
  const selected = selectArtifactRendition(projection, purposes);
  assert.ok(selected, "必须选出一个可用 rendition");
  assert.equal(selected.mediaType, PPTX_MEDIA_TYPE);
  // 位图会让 pptx 解析器当场 magic-mismatch，这条是「点开还是一张图」的死法。
  assert.equal(/^image\//.test(selected.mediaType), false);
  assert.ok(item.url && !item.url.includes("/source-tree/"), item.url);
});

test("W3/2 网站默认查看顺序会给出封面图，所以承载必须自己先要 full", () => {
  const projection = normalizeArtifactProjection(websiteProjectionPayload());
  assert.ok(projection);
  // 这条顺序是**卡片**的需求（卡片必须是位图，产品既定决定），不动它。
  assert.deepEqual(viewerRenditionOrder("website", true), ["preview", "full"]);
  const byDefault = selectArtifactRendition(projection);
  assert.equal(byDefault?.mediaType, "image/webp");
  assert.equal(isWebsitePageMediaType(byDefault?.mediaType), false);
  // 详情要页面本身：WebsiteArtifactViewer 用的就是这个顺序。
  const page = selectArtifactRendition(projection, ["full", "preview"]);
  assert.equal(page?.mediaType, "text/html");
  assert.equal(isWebsitePageMediaType(page?.mediaType), true);
  assert.equal(page.url.includes("/source-tree/"), false);
});

test("W3/3 判读脚本引导型网站：空容器 + 内联脚本", () => {
  // 货架 163 件网站素材的 full 都是这个形状：body 只有两个空容器 + 两段内联脚本。
  assert.equal(
    websitePaintMode({ elementCount: 2, textLength: 0, scriptCount: 2 }),
    "script-bootstrapped",
  );
  // 自绘型：DOM 里就有内容，直接 iframe 能看到页面。
  assert.equal(
    websitePaintMode({ elementCount: 240, textLength: 3800, scriptCount: 0 }),
    "self-painting",
  );
  // 没有脚本却也没有内容，说明是空文档而不是引导页，不该按引导页解释。
  assert.equal(
    websitePaintMode({ elementCount: 1, textLength: 0, scriptCount: 0 }),
    "self-painting",
  );
});

test("W3/4 从整站内联 HTML 读出页面清单", () => {
  const site = {
    siteName: "礼品定制传媒",
    pages: [
      { path: "/", title: "首页", sections: [{}, {}, {}] },
      { path: "/about", title: "关于我们", sections: [{}] },
    ],
  };
  const html = `<!doctype html><html><body><header id="site-nav"></header><main id="site-main"></main>
<script>(function () { var FILES = ${JSON.stringify({
    "site.json": JSON.stringify(site),
    "README.md": "# demo",
  })}; window.__FILES = FILES; })();</script></body></html>`;
  const outline = websiteInlineOutline(html);
  assert.deepEqual(outline, {
    siteName: "礼品定制传媒",
    pages: [
      { path: "/", title: "首页", sectionCount: 3 },
      { path: "/about", title: "关于我们", sectionCount: 1 },
    ],
  });
  // 读不出来就必须是 null，不许编一份清单出来。
  assert.equal(websiteInlineOutline("<!doctype html><body></body>"), null);
  assert.equal(
    websiteInlineOutline('<script>var FILES = {"site.json":"not json"};</script>'),
    null,
  );
});
