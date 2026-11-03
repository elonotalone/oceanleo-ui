// 成品链接（/bay?kind=asset&artifactId=…&revisionId=…）在素材栏里直接点开那件成品。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  artifactLinkTargetFromSearch,
  searchWithoutArtifactLink,
} from "../src/shell/bay/asset/artifact-link.ts";
import { materialLibraryHref } from "../src/shell/material-library-presentation.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("地址上有成品号才算成品链接；版本号可缺", () => {
  assert.deepEqual(artifactLinkTargetFromSearch("?kind=asset&artifactId=a1&revisionId=r2"), {
    artifactId: "a1",
    revisionId: "r2",
  });
  assert.deepEqual(artifactLinkTargetFromSearch("kind=asset&artifactId=a1"), { artifactId: "a1", revisionId: "" });
  assert.equal(artifactLinkTargetFromSearch("?kind=asset&asset=x"), null);
  assert.equal(artifactLinkTargetFromSearch("?kind=asset&artifactId=%20"), null);
});

test("关掉后只拿掉成品链接的参数，别的参数留下", () => {
  assert.equal(
    searchWithoutArtifactLink("?kind=asset&type=ppt&artifactId=a1&revisionId=r2&taxonomy=deck"),
    "?kind=asset&type=ppt",
  );
  assert.equal(searchWithoutArtifactLink("?artifactId=a1"), "");
});

test("「在素材库中查看」生成的成品链接能被素材栏读回同一件成品", () => {
  const href = materialLibraryHref({
    item: {
      id: "artifact:a1:r2",
      artifactId: "a1",
      revisionId: "r2",
      artifactType: "deck",
      artifact: { artifactId: "a1", revisionId: "r2" },
    },
  });
  assert.match(href, /^\/bay\?kind=asset&/);
  const target = artifactLinkTargetFromSearch(new URL(href, "https://site.invalid").search);
  assert.deepEqual(target, { artifactId: "a1", revisionId: "r2" });
});

test("素材栏深链使用共享页内详情、服务端解析和购买动作；不再建弹窗", () => {
  const library = read("../src/shell/bay/asset/BayAssetLibrary.tsx");
  assert.match(library, /<BayArtifactDeepLink /);
  const source = read("../src/shell/bay/asset/BayArtifactDeepLink.tsx");
  assert.match(source, /<AssetDetail /);
  assert.match(source, /<BayAssetActions /);
  assert.match(source, /resolveAssetDetail/);
  assert.doesNotMatch(source, /createPortal|fixed inset|document.body.style.overflow/);
});
