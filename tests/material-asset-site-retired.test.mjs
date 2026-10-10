// U4：共享包不再生成 asset 主机链接；旧地址仍被识别为同一件素材。
//
// 跑法：
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/helpers/assert-dom-guard.mjs \
//     --experimental-strip-types \
//     --experimental-loader ./tests/ts-extension-loader.mjs \
//     --test tests/material-asset-site-retired.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { platformToEntry } from "../src/shell/material-library-controller.ts";
import {
  MATERIAL_LIBRARY_BASE,
  materialAssetIdFromHref,
  materialHrefsReferToSameAsset,
  materialLibraryHref,
  safeCompleteLibraryHref,
} from "../src/shell/material-library-presentation.ts";

const OLD_ASSET = "https://asset.oceanleo.com/materials?asset=X";
const NEW_BAY = "/bay?kind=asset&asset=X";

function libraryItem(id) {
  return {
    key: `asset:${id}`,
    source: "artifact",
    id,
    title: id,
    kind: "image",
    siteId: "image",
    favorite: false,
    meta: { asset_id: id },
  };
}

test("generated material links stay on /bay?kind=asset, never asset host", () => {
  assert.equal(MATERIAL_LIBRARY_BASE, "/bay?kind=asset");
  assert.equal(materialLibraryHref({}), "/bay?kind=asset");
  assert.equal(
    materialLibraryHref({ taxonomy: "single_file_image" }),
    "/bay?kind=asset&taxonomy=single_file_image",
  );
  assert.equal(
    materialLibraryHref({ item: libraryItem("pic/1") }),
    "/bay?kind=asset&asset=pic%2F1",
  );

  const entry = platformToEntry({
    id: "library:forest-01",
    type: "image",
    title: "林间",
  });
  assert.equal(entry.linkUrl, "/bay?kind=asset&asset=forest-01");
  assert.equal(
    entry.libraryItem?.meta.asset_page_url,
    "/bay?kind=asset&asset=forest-01",
  );
  assert.doesNotMatch(entry.linkUrl || "", /asset\.oceanleo/);
});

test("old asset.oceanleo.com/materials?asset=X and new /bay href are the same material", () => {
  assert.equal(materialAssetIdFromHref(OLD_ASSET), "X");
  assert.equal(materialAssetIdFromHref(NEW_BAY), "X");
  assert.equal(materialAssetIdFromHref("https://asset.oceanleo.cn/materials?asset=X"), "X");
  assert.equal(
    materialAssetIdFromHref("https://design.oceanleo.com/bay?kind=asset&asset=X"),
    "X",
  );
  assert.equal(materialHrefsReferToSameAsset(OLD_ASSET, NEW_BAY), true);
  assert.equal(
    materialHrefsReferToSameAsset(OLD_ASSET, "/bay?kind=asset&asset=Y"),
    false,
  );
  // 旧主机地址认得出来，但交出去的是当前站素材栏：asset 站弃用后旧地址本身是死链。
  assert.equal(safeCompleteLibraryHref(OLD_ASSET), NEW_BAY);
  assert.equal(safeCompleteLibraryHref(NEW_BAY), NEW_BAY);
  assert.equal(safeCompleteLibraryHref("https://evil.test/materials?asset=X"), "");
});

test("owned sources no longer build asset-host clickable links", () => {
  const client = readFileSync(
    new URL("../src/shell/artifact-client.ts", import.meta.url),
    "utf8",
  );
  const controller = readFileSync(
    new URL("../src/shell/material-library-controller.ts", import.meta.url),
    "utf8",
  );
  const session = readFileSync(
    new URL("../src/shell/advanced-session.ts", import.meta.url),
    "utf8",
  );
  // 成品链接：当前站 /bay，带成品号与版本号（成品没有素材 id）。
  assert.match(client, /artifactId: projection\.artifactId/);
  assert.match(client, /revisionId: projection\.revisionId/);
  assert.match(client, /`\/bay\?\$\{hrefParams\.toString\(\)\}`/);
  assert.doesNotMatch(client, /assetOrigin/);
  assert.match(
    controller,
    /asset_page_url: `\/bay\?kind=asset&asset=\$\{encodeURIComponent\(rawId\)\}`/,
  );
  assert.doesNotMatch(controller, /assetOrigin\}\/materials/);
  assert.doesNotMatch(session, /assetOrigin/);
  assert.doesNotMatch(session, /design-templates\/doc/);
});
