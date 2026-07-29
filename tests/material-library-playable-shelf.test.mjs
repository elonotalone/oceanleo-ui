// W8：货架放行可玩条目（派活合同 §4 W8、附录 2 §6 第一道过滤）。
//
// 判据：
//   ① `materialShelfEntries()` 放行 `artifactType === "game"` 的 `view_only` 条目；
//   ② 放行**不是**靠把它们标成可编辑：同一条目在
//      `isAdvancedEditableShelfItem` 下必须仍为假（否则编辑器派发会在真实数据上抛）；
//   ③ 素材侧的既有放行与拦截一个字没松：不可编辑的**非游戏**条目照旧挡下；
//   ④ 控制器那道过滤（`omitUneditableMaterials`，本轮定位到的第四道）按请求作用域
//      放行：只有明确按 game 检索时才收下 view_only 游戏，素材货架结果集不变。
//
// ④ 走**真实取数链**：桩掉 `fetch`，从 `queryMaterialLibrary` 一路跑到 items，
// 不是对着源码 grep。

import assert from "node:assert/strict";
import test from "node:test";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { isAdvancedEditableShelfItem } from "../src/shell/advanced-features.ts";
import { isPlayableGameLibraryItem } from "../src/shell/explore-artifact-class.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  artifactEntry,
  invalidateMaterialLibraryCache,
  queryMaterialLibrary,
} from "../src/shell/material-library-controller.ts";
import { materialShelfEntries } from "../src/shell/material-library-presentation.ts";

// ── 夹具 ────────────────────────────────────────────────────────────────────

/** 生产库里那 100 款 artifact 游戏的形状：view_only、无 source、roles=generated_output。 */
function viewOnlyGameRow(id = "game-1") {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: "r1",
    artifact_type: "game",
    roles: ["generated_output"],
    title: `游戏 ${id}`,
    favorite: false,
    owner: {
      principal_id: "user-1",
      visibility: "public",
      origin_site_key: "game",
      origin_app_id: "leoplay",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: false,
      can_fork: false,
      can_insert: false,
      can_replace: false,
      can_favorite: true,
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
        url: `https://signed.test/${id}.png`,
        format: "png",
        media_type: "image/png",
      },
    },
    provenance: { id: `prov-${id}`, source_kind: "owned", license_code: "owned" },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
    created_at: "2026-07-01T00:00:00Z",
  };
}

/** 一份**可编辑**的普通素材（png → image_editing），代表素材侧的既有放行。 */
function editableImageRow(id = "img-1") {
  return {
    ...viewOnlyGameRow(id),
    artifact_type: "single_file_image",
    roles: ["template"],
    editability: "bounded",
    editor_capability: "image-editor",
    source_format: "png",
    access: {
      can_read: true,
      can_preview: true,
      can_edit: true,
      can_fork: true,
      can_insert: true,
      can_replace: true,
      can_favorite: true,
      can_bind: true,
      can_export_source: true,
    },
    renditions: {
      preview: {
        purpose: "preview",
        revision_id: "r1",
        url: `https://signed.test/${id}.png`,
        format: "png",
        media_type: "image/png",
      },
      source: {
        purpose: "source",
        revision_id: "r1",
        url: `https://signed.test/${id}-source.png`,
        format: "png",
        media_type: "image/png",
        digest: `sha256:${id}`,
      },
    },
  };
}

/** 一份**不可编辑的非游戏**条目：view_only 的图片 rehost，必须照旧被挡下。 */
function viewOnlyImageRow(id = "rehost-1") {
  return {
    ...viewOnlyGameRow(id),
    artifact_type: "single_file_image",
    roles: ["template"],
  };
}

/**
 * 素材检索用的游戏行。
 *
 * roles 换成 `template` 是**必须的**：`searchArtifactLibrary` 会把整页里
 * 任何一条不含所请求 role 的 projection 判为非法响应，那样请求在碰到本轮这道
 * 过滤之前就已经失败了，测的就不是「货架收不收它」。这一行代表最坏情况：
 * 一条连传输层检查都过了的游戏，素材货架仍然必须把它剔掉。
 */
function templateRoleGameRow(id = "game-1") {
  return { ...viewOnlyGameRow(id), roles: ["template"] };
}

function itemFromRow(row) {
  const projection = normalizeArtifactProjection(row);
  assert.ok(projection, `${row.artifact_id} 没通过投影归一化`);
  return artifactProjectionToLibraryItem(projection);
}

function entryFromRow(row) {
  return artifactEntry(itemFromRow(row));
}

function shelf(entries) {
  return materialShelfEntries({
    level: "site",
    siteKey: "game",
    deepLinked: [],
    officialTemplates: [],
    remote: entries,
    exactLocal: [],
  });
}

// ── ①②③ 货架放行 ───────────────────────────────────────────────────────────

test("货架放行 view_only 的 artifact 游戏", () => {
  const game = entryFromRow(viewOnlyGameRow("game-1"));
  const ids = shelf([game]).map((entry) => entry.libraryItem.artifactId);
  assert.deepEqual(ids, ["game-1"], "view_only 游戏仍然进不了货架");
});

test("放行不是靠伪装成可编辑：同一条目的编辑器判据必须仍为假", () => {
  const item = itemFromRow(viewOnlyGameRow("game-1"));
  assert.equal(item.artifact.editability, "view_only");
  assert.equal(isPlayableGameLibraryItem(item), true);
  assert.equal(
    isAdvancedEditableShelfItem(item),
    false,
    "游戏被标成可编辑了——编辑器派发会在真实数据上抛「缺少可验证的编辑器 source」",
  );
});

test("素材侧一个字没松：可编辑素材照旧放行，不可编辑的非游戏照旧挡下", () => {
  const editable = entryFromRow(editableImageRow("img-1"));
  const rehost = entryFromRow(viewOnlyImageRow("rehost-1"));
  const game = entryFromRow(viewOnlyGameRow("game-1"));

  assert.deepEqual(
    shelf([editable]).map((entry) => entry.libraryItem.artifactId),
    ["img-1"],
  );
  // view_only 的**非游戏** rehost 没有播放通路，放它进来只会得到一张点不开的卡。
  assert.deepEqual(shelf([rehost]), []);
  // 三条混在一起时，恰好放行可编辑素材与游戏两条。
  assert.deepEqual(
    shelf([editable, rehost, game]).map((entry) => entry.libraryItem.artifactId),
    ["img-1", "game-1"],
  );
});

// ── ④ 控制器那道过滤：按作用域放行 ──────────────────────────────────────────

function libraryResponse(rows) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({
      schema: "oceanleo.library.v1",
      scope: "public",
      items: rows,
      total: rows.length,
    }),
    text: async () => "",
  };
}

async function searchWith(rows, input) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return libraryResponse(rows);
  };
  try {
    invalidateMaterialLibraryCache();
    const result = await queryMaterialLibrary(input);
    return { result, calls };
  } finally {
    globalThis.fetch = realFetch;
    invalidateMaterialLibraryCache();
  }
}

const siteContext = { contextId: "", siteKey: "game", appId: "" };

test("按 game 检索时控制器收下 view_only 游戏（第四道过滤已放行）", async () => {
  const { result, calls } = await searchWith(
    [viewOnlyGameRow("game-1"), viewOnlyGameRow("game-2")],
    {
      level: "site",
      context: siteContext,
      query: "",
      taxonomy: "game",
      types: ["game"],
      role: "generated_output",
      limit: 100,
      forceRefresh: true,
    },
  );
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.data.items.map((item) => item.artifactId),
    ["game-1", "game-2"],
  );
  // 页宽真的发上了网关（60 那一页装不下 100 款）。
  assert.match(calls[0], /limit=100/);
  assert.match(calls[0], /artifactType=game/);
  assert.match(calls[0], /role=generated_output/);
});

test("素材检索的结果集不变：没按 game 检索时 view_only 游戏照旧被剔掉", async () => {
  const { result, calls } = await searchWith(
    [editableImageRow("img-1"), templateRoleGameRow("game-1")],
    {
      level: "site",
      context: siteContext,
      query: "",
      taxonomy: "",
      forceRefresh: true,
    },
  );
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(
    result.data.items.map((item) => item.artifactId),
    ["img-1"],
    "素材货架的结果集被放宽了——36 个消费者的抽屉会多出点不开的游戏卡",
  );
  assert.equal(result.data.diagnostics.omittedCount, 1);
  // 素材货架的默认页宽一个字没动。
  assert.match(calls[0], /limit=60/);
});

test("view_only 的非游戏条目在任何作用域下都被剔掉", async () => {
  const { result } = await searchWith([viewOnlyImageRow("rehost-1")], {
    level: "site",
    context: siteContext,
    query: "",
    taxonomy: "single_file_image",
    types: ["single_file_image"],
    forceRefresh: true,
  });
  assert.equal(result.ok, true, result.error);
  assert.deepEqual(result.data.items, []);
});
