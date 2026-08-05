// 素材卡「下载」按钮（合同 §0.6 的下载入口迁移 + §8.9 的 shelf-quiet 收窄裁定）。
// 这份用例替 W4 守住放宽 shelf-quiet 断言之后的边界：
//   ① 卡片上只多出「下载」一个动作，另外四个动作一个字都不许出现；
//   ② 只有素材货架的条目才带下载，我的库 / Navigator 的卡片必须是 null；
//   ③ 不可下载的 revision 不渲染按钮；
//   ④ 点下载不劫持卡片点击；
//   ⑤ 四档拒绝文案全部来自 artifactDownloadEvidence，没有另造「下载失败」。
// 组件源码经 typescript.transpileModule 编译成 data: 模块后导入，
// 所以可以直接 `node --test tests/material-library-download.test.mjs`。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

// 下载闸门与下载动作都来自 artifact-client（W4 的文件，本用例只打桩不改动）。
let downloadEvidence = {
  visible: true,
  available: true,
  reason: "",
  purpose: "source",
  mode: "attachment",
};
globalThis.__downloadEvidence = () => downloadEvidence;

const OVERRIDES = {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
  "./artifact-client": dataModule(`
    export function artifactDownloadEvidence(){ return globalThis.__downloadEvidence(); }
    export async function getArtifactDownload(){
      return { ok: true, data: {} };
    }
  `),
};

const {
  MaterialEntryDownload,
  isMaterialDownloadEntry,
  materialEntryDownloadAction,
} = await import(
  await compileModule("src/shell/material-library-download.tsx", OVERRIDES)
);

const DOWNLOAD_SOURCE = readFileSync(
  new URL("../src/shell/material-library-download.tsx", import.meta.url),
  "utf8",
);

function materialItem(overrides = {}) {
  return {
    key: "artifact:tpl-1:r1",
    source: "artifact",
    id: "tpl-1",
    artifactId: "tpl-1",
    revisionId: "r1",
    artifactType: "single_file_image",
    title: "本站模板 1",
    kind: "image",
    siteId: "image",
    favorite: false,
    meta: { workspace_library_surface: "materials" },
    artifact: {
      artifactId: "tpl-1",
      revisionId: "r1",
      artifactType: "single_file_image",
      owner: { originSiteKey: "image", visibility: "public" },
      bindings: [],
    },
    ...overrides,
  };
}

function entry(item) {
  return { id: `entry:${item.id}`, title: item.title, libraryItem: item };
}

test("素材货架的卡片带下载，其它库的卡片保持安静", () => {
  assert.equal(isMaterialDownloadEntry(entry(materialItem())), true);

  // 我的库 / Navigator：没有 materials surface 标记。
  const mine = materialItem({ meta: { workspace_library_surface: "mine" } });
  assert.equal(isMaterialDownloadEntry(entry(mine)), false);
  assert.equal(materialEntryDownloadAction(entry(mine)), null);

  // 非 durable（没有 artifactId/revisionId）的条目也不给下载。
  const transient = materialItem({ artifactId: undefined, artifact: undefined });
  assert.equal(isMaterialDownloadEntry(entry(transient)), false);
  assert.equal(materialEntryDownloadAction({ id: "x", title: "x" }), null);
});

test("下载闸门说不可见时，卡片上一个按钮都不渲染", () => {
  downloadEvidence = {
    visible: false,
    available: false,
    reason: "下载需要 durable artifact identity。",
    purpose: null,
    mode: null,
  };
  try {
    assert.equal(isMaterialDownloadEntry(entry(materialItem())), false);
    assert.equal(
      renderToStaticMarkup(
        createElement(MaterialEntryDownload, { item: materialItem() }),
      ),
      "",
    );
  } finally {
    downloadEvidence = {
      visible: true,
      available: true,
      reason: "",
      purpose: "source",
      mode: "attachment",
    };
  }
});

test("可下载时渲染唯一一个下载按钮，并钉住 revision", () => {
  const markup = renderToStaticMarkup(
    createElement(MaterialEntryDownload, { item: materialItem() }),
  );
  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.match(markup, /data-material-card-download="tpl-1"/);
  assert.match(markup, /aria-label="下载「本站模板 1」revision r1"/);
  assert.match(markup, /title="下载"/);
  assert.match(markup, /aria-disabled="false"/);
  assert.doesNotMatch(markup, /\sdisabled=""/);
});

test("不可用时按钮禁用，并原样显示闸门给的那一档原因", () => {
  downloadEvidence = {
    visible: true,
    available: false,
    reason: "当前 revision 缺少符合能力合同的真实交付 rendition。",
    purpose: null,
    mode: null,
  };
  try {
    const markup = renderToStaticMarkup(
      createElement(MaterialEntryDownload, { item: materialItem() }),
    );
    assert.match(markup, /disabled=""/);
    assert.match(markup, /aria-disabled="true"/);
    assert.match(
      markup,
      /title="当前 revision 缺少符合能力合同的真实交付 rendition。"/,
    );
  } finally {
    downloadEvidence = {
      visible: true,
      available: true,
      reason: "",
      purpose: "source",
      mode: "attachment",
    };
  }
});

test("卡片上只多出「下载」，另外四个动作一个字都没有", () => {
  // W4 放宽 shelf-quiet 断言时可以直接引用这一条。
  for (const forbidden of ["编辑", "收藏", "全屏", "链接"]) {
    assert.doesNotMatch(
      DOWNLOAD_SOURCE,
      new RegExp(forbidden),
      `素材卡下载组件里不该出现「${forbidden}」`,
    );
  }
  assert.doesNotMatch(DOWNLOAD_SOURCE, /actionButtonsFor/);
  assert.doesNotMatch(DOWNLOAD_SOURCE, /ArtifactActionButtons/);
});

test("点下载不劫持卡片点击，也不自造下载文案", () => {
  assert.match(DOWNLOAD_SOURCE, /event\.preventDefault\(\)/);
  assert.match(DOWNLOAD_SOURCE, /event\.stopPropagation\(\)/);
  // 四档拒绝原因只能来自闸门，不许在本文件里另起一套。
  assert.match(DOWNLOAD_SOURCE, /artifactDownloadEvidence\(item\)/);
  assert.match(DOWNLOAD_SOURCE, /setStatus\(evidence\.reason\)/);
  // 与 ArtifactActions.runDownload 同源的三句，逐字复用，没有新增第四句。
  assert.match(DOWNLOAD_SOURCE, /"正在准备固定 revision 的下载…"/);
  assert.match(DOWNLOAD_SOURCE, /"下载 identity 校验失败。"/);
  assert.match(DOWNLOAD_SOURCE, /"下载已开始。"/);
});

test("下载结果必须钉回请求的 artifact + revision", () => {
  assert.match(
    DOWNLOAD_SOURCE,
    /result\.data\.artifactId !== durable\.artifactId/,
  );
  assert.match(
    DOWNLOAD_SOURCE,
    /result\.data\.revisionId !== durable\.revisionId/,
  );
  assert.ok(
    DOWNLOAD_SOURCE.split("\n").length <= 800,
    "material-library-download.tsx 超过 800 行硬顶",
  );
});
