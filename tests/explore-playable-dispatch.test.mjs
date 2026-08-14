// W8：探索区可玩分流与「开玩」独立派发（派活合同 §4 W8、附录 2 §6）。
//
// 判据：
//   ① 100 款 artifact 游戏是 `view_only`，**可玩 ≠ 可编辑**：放行它们的那条判据
//      必须在「不可编辑」成立的同时为真，绝不能靠把它们标成可编辑来绕过；
//   ② 「开玩」是**独立派发通路**：落点由 `artifactPlayHref()` 算出，不经过
//      `openPreparedItem` / `isAdvancedEditableShelfItem` 的编辑器检查；
//   ③ 落点是导航 sink，外来 `play_href` 必须 fail-closed 地校验；
//   ④ 「可玩游戏」筹码与默认分类在真的有可玩条目时生效；
//   ⑤ 分页上限对 100+ 款游戏够用：单页 60 不够，且 100 是客户端硬顶，所以必须翻页；
//   ⑥ feed 封面走 W1 的三态判据，`unknown-metadata` **不许**写「不可用」。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { normalizeArtifactProjection } from "../src/shell/artifact-contract.ts";
import { isAdvancedEditableShelfItem } from "../src/shell/advanced-features.ts";
import {
  ARTIFACT_PLAY_ORIGIN,
  ARTIFACT_PLAY_ROUTE_PREFIX,
  EXPLORE_PLAYABLE_MAX_PAGES,
  EXPLORE_PLAYABLE_PAGE_LIMIT,
  artifactPlayHref,
  defaultExploreClass,
  exploreClassChips,
  isPlayableGameLibraryItem,
  isPlayableGameShelfEntry,
  navigateToArtifactPlay,
  openArtifactPlay,
  safeArtifactPlayHref,
} from "../src/shell/explore-artifact-class.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import {
  MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT,
  materialLibraryPageLimit,
  materialLibraryRequestKey,
} from "../src/shell/material-library-cache.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ── 夹具：一行真实形状的 view_only artifact 游戏 ────────────────────────────

/**
 * 生产库里那 100 款游戏的形状：`editability: "view_only"`、`can_edit: false`、
 * roles 是 `generated_output`（promoted games 不是 template）。
 */
function gameWireRow({ id = "game-1", extra = {}, artifactType = "game" } = {}) {
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: id,
    revision_id: "r1",
    artifact_type: artifactType,
    roles: ["generated_output"],
    title: `作品 ${id}`,
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
    ...extra,
  };
}

function gameItem(options = {}) {
  const projection = normalizeArtifactProjection(gameWireRow(options));
  assert.ok(projection, "view_only 游戏没通过投影归一化，后面的判据都不成立");
  const item = artifactProjectionToLibraryItem(projection);
  // `artifactProjectionToLibraryItem` 的 meta 是**封闭白名单**（`library-data.ts`
  // L253 起），目录字段进不去。所以带 `play_href` 的条目在这里显式合成，
  // 对应的是目录形态的来源，而不是 `/v1/library/search` 的投影。
  return options.meta ? { ...item, meta: { ...item.meta, ...options.meta } } : item;
}

// ── ① 可玩 ≠ 可编辑 ─────────────────────────────────────────────────────────

test("放行判据成立的同时「不可编辑」也成立：没有伪装成可编辑", () => {
  const item = gameItem();
  // 这两条必须**同时**为真，否则就是靠伪装绕过去的：
  assert.equal(item.artifact.editability, "view_only");
  assert.equal(
    isAdvancedEditableShelfItem(item),
    false,
    "view_only 游戏被判成可编辑了——编辑器派发会在真实数据上抛错",
  );
  assert.equal(isPlayableGameLibraryItem(item), true);
  assert.equal(isPlayableGameShelfEntry({ id: "e1", title: "甲", libraryItem: item }), true);
});

test("可玩判据只认 game，且要求 durable + 可见", () => {
  assert.equal(
    isPlayableGameLibraryItem(gameItem({ artifactType: "single_file_image" })),
    false,
  );
  assert.equal(isPlayableGameLibraryItem(null), false);
  assert.equal(isPlayableGameLibraryItem(undefined), false);
  // 没有 artifact 坐标 = 算不出播放落点，不算可玩。
  assert.equal(
    isPlayableGameLibraryItem({
      key: "k",
      source: "artifact",
      id: "x",
      title: "裸条目",
      kind: "image",
      siteId: "game",
      favorite: false,
      artifactType: "game",
      meta: {},
    }),
    false,
  );
  // 不可见（integrity 坏）的游戏不许进货架——这一条钉的是隔离面：谁能被送进沙箱播放。
  //
  // 判据的意思一字不改，改的是夹具造得不对：原来写 `code: "bad"`，而 `bad` 不是
  // `ArtifactIntegrity["code"]` 的成员。`normalizeArtifactProjection` 只在服务端声明的
  // code 落在它那张传输失败名单里时才采信 `ok: false`，于是那份夹具产出的其实是一份
  // **integrity 正常**的投影，这条判据实际在断「可见的游戏不可玩」，必红。
  // 实现（`isPlayableGameLibraryItem` → `artifactIsVisible`）本来就是紧的，
  // 所以按 `_COMMON10.md` §红线 1(a) 改判据，且只许改严不许改松：
  //   ① 服务端声明的失败：换成真实的 code（`missing-provenance`）；
  //   ② 客户端自己算出的失败：抽掉 renditions，integrity 落到 `missing-preview`。
  // 两条都先断言「这行投影真的不可见」，再断言它不可玩——原来的 `if (invisible)`
  // 会在夹具造不出投影时把整条判据悄悄跳过，那是假绿的形状。
  for (const [label, extra] of [
    [
      "服务端声明 integrity 失败",
      { integrity: { ok: false, code: "missing-provenance", reason: "缺 provenance 证据" } },
    ],
    ["投影自己算出 integrity 失败", { renditions: {} }],
  ]) {
    const invisible = normalizeArtifactProjection(gameWireRow({ extra }));
    assert.ok(invisible, `${label}：夹具连投影都没造出来`);
    assert.equal(
      invisible.integrity.ok,
      false,
      `${label}：夹具造出来的这行其实是可见的，判据等于没验`,
    );
    assert.equal(
      isPlayableGameLibraryItem(artifactProjectionToLibraryItem(invisible)),
      false,
      `${label}：不可见的游戏被判成可玩，会被送进沙箱播放`,
    );
  }
});

// ── ② 「开玩」落点 ──────────────────────────────────────────────────────────

test("没有 play_href 时按 artifact 坐标推导 W7 的播放路由", () => {
  assert.equal(
    artifactPlayHref(gameItem({ id: "game-1" })),
    `${ARTIFACT_PLAY_ROUTE_PREFIX}game-1?revision=r1`,
  );
  assert.equal(ARTIFACT_PLAY_ROUTE_PREFIX, "/play/artifact/");
  // 素材没有播放落点。
  assert.equal(artifactPlayHref(gameItem({ artifactType: "single_file_image" })), "");
  assert.equal(artifactPlayHref(null), "");
  // artifact id 进路径必须转义。
  assert.match(
    artifactPlayHref(gameItem({ id: "a/b?c" })),
    /^\/play\/artifact\/a%2Fb%3Fc\?revision=r1$/,
  );
});

test("W9 落库的 play_href 优先，但先过 fail-closed 校验", () => {
  // 根相对：直接用。
  assert.equal(
    artifactPlayHref(gameItem({ meta: { play_href: "/play/artifact/xyz" } })),
    "/play/artifact/xyz",
  );
  // 驼峰键也认。
  assert.equal(
    artifactPlayHref(gameItem({ meta: { playHref: "/play/artifact/abc" } })),
    "/play/artifact/abc",
  );
  // 放行名单上的绝对 URL：跨站开玩要用它（探索页也跑在 website 等站上，
  // 根相对路径在那些站会 404）。
  assert.equal(
    artifactPlayHref(
      gameItem({ meta: { play_href: `${ARTIFACT_PLAY_ORIGIN}/play/artifact/xyz` } }),
    ),
    `${ARTIFACT_PLAY_ORIGIN}/play/artifact/xyz`,
  );
  assert.equal(ARTIFACT_PLAY_ORIGIN, "https://game.oceanleo.com");
});

test("外来 play_href 是导航 sink：越权形状一律丢弃并回落到推导路由", () => {
  const derived = `${ARTIFACT_PLAY_ROUTE_PREFIX}game-1?revision=r1`;
  for (const hostile of [
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "//evil.example.com/play",
    "https://evil.example.com/play/artifact/xyz",
    "http://game.oceanleo.com/play/artifact/xyz",
    // 用户产物住在 oceanleo.app 的沙箱里，必须由播放页 iframe 装载；
    // 顶层导航直奔沙箱 host 会绕过播放页那一层。
    "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/embed",
    "https://game.oceanleo.com.evil.example/play",
    "/play\\..\\evil",
  ]) {
    assert.equal(
      safeArtifactPlayHref(hostile),
      "",
      `${hostile} 不该通过播放落点校验`,
    );
    assert.equal(
      artifactPlayHref(gameItem({ id: "game-1", meta: { play_href: hostile } })),
      derived,
      `${hostile} 应当被丢弃并回落到推导路由`,
    );
  }
  assert.equal(safeArtifactPlayHref(""), "");
  assert.equal(safeArtifactPlayHref(undefined), "");
});

test("导航前再校一次；SSR 下不跳且不抛", () => {
  const seen = [];
  assert.equal(
    navigateToArtifactPlay("/play/artifact/xyz", (target) => seen.push(target)),
    true,
  );
  assert.deepEqual(seen, ["/play/artifact/xyz"]);
  // 校验不通过就不跳。
  assert.equal(
    navigateToArtifactPlay("https://evil.example.com/x", (target) => seen.push(target)),
    false,
  );
  assert.deepEqual(seen, ["/play/artifact/xyz"]);
});

// `openArtifactPlay` 是货架/网格那条通路上唯一把可玩条目引开编辑器的东西。
// 它返回 `false` 就等于「按老路继续」，而老路对 view_only 游戏必抛
// 「当前 revision 缺少可验证的编辑器 source。」——所以「真的接管了」这件事
// 必须**按行为**断言：只断言调用点的源码位置，函数被掏空也照样全绿。
test("openArtifactPlay 真的接管可玩条目，并且只接管可玩条目", () => {
  const seen = [];
  const navigate = (target) => seen.push(target);

  // 可玩：接管（返回 true）且落到推导出的播放路由。
  assert.equal(openArtifactPlay(gameItem({ id: "game-1" }), navigate), true);
  assert.deepEqual(seen, [`${ARTIFACT_PLAY_ROUTE_PREFIX}game-1?revision=r1`]);

  // W9 落库的绝对落点同样由它接管。
  assert.equal(
    openArtifactPlay(
      gameItem({ id: "game-2", meta: { play_href: `${ARTIFACT_PLAY_ORIGIN}/play/artifact/g2` } }),
      navigate,
    ),
    true,
  );
  assert.equal(seen.at(-1), `${ARTIFACT_PLAY_ORIGIN}/play/artifact/g2`);

  // 素材**不**接管：返回 false，调用方照旧走编辑器派发，一步都没跳。
  const before = seen.length;
  assert.equal(
    openArtifactPlay(gameItem({ artifactType: "single_file_image" }), navigate),
    false,
  );
  assert.equal(openArtifactPlay(null, navigate), false);
  assert.equal(seen.length, before, "非可玩条目不该产生任何导航");

  // 落点算不出来时不许假装接管：接管了又不跳 = 用户点了没反应。
  const rootless = gameItem({ id: "game-3" });
  assert.equal(openArtifactPlay({ ...rootless, artifactId: "" }, navigate), false);
  assert.equal(seen.length, before);
});

// ── ③ 筹码与默认分类 ────────────────────────────────────────────────────────

test("有可玩条目时「可玩游戏」筹码真实出现，默认分类随之落到可玩", () => {
  const playableCount = [gameItem({ id: "g1" }), gameItem({ id: "g2" })].filter(
    isPlayableGameLibraryItem,
  ).length;
  assert.equal(playableCount, 2);
  const chips = exploreClassChips({ playableCount, materialCount: 7 });
  assert.deepEqual(chips.map((chip) => chip.id), ["playable", "material"]);
  assert.equal(chips[0].label, "可玩游戏");
  assert.equal(chips[0].count, 2);
  assert.equal(defaultExploreClass({ playableCount }), "playable");
  // 一款可玩作品都没有的那 35 站形状不变。
  assert.deepEqual(
    exploreClassChips({ playableCount: 0, materialCount: 7 }).map((chip) => chip.id),
    ["material"],
  );
  assert.equal(defaultExploreClass({ playableCount: 0 }), "material");
});

// ── ④ 分页上限 ──────────────────────────────────────────────────────────────

test("60 条一页装不下 100 款游戏：探针用满 100 且真的翻页", () => {
  assert.equal(MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT, 60);
  assert.ok(
    EXPLORE_PLAYABLE_PAGE_LIMIT > MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT,
    "可玩探针还在用素材货架那 60 条的页宽",
  );
  // 100 是 `artifact-client.ts` 的 ARTIFACT_LIBRARY_MAX_LIMIT 硬顶，所以
  // **光把上限调大解决不了 100 款**——必须翻页，且翻页要有硬上限。
  assert.equal(EXPLORE_PLAYABLE_PAGE_LIMIT, 100);
  assert.ok(EXPLORE_PLAYABLE_MAX_PAGES >= 2);
  assert.ok(
    EXPLORE_PLAYABLE_PAGE_LIMIT * EXPLORE_PLAYABLE_MAX_PAGES >= 500,
    "翻页总量连 500 款都装不下",
  );

  const dispatchSource = readFileSync(
    new URL("../src/shell/explore-shelf-dispatch.tsx", import.meta.url),
    "utf8",
  );
  assert.match(dispatchSource, /limit:\s*EXPLORE_PLAYABLE_PAGE_LIMIT/);
  // 真的按游标翻页，而不是只取第一页。
  assert.match(dispatchSource, /nextCursor/);
  assert.match(dispatchSource, /EXPLORE_PLAYABLE_MAX_PAGES/);
  // 游标不前进就停：后端把同一个游标回给我们时不许原地打转。
  assert.match(dispatchSource, /seenCursors/);
});

test("页宽进缓存键，但默认页宽的键一个字节不变", () => {
  const base = {
    level: "site",
    context: { contextId: "", siteKey: "game", appId: "" },
    query: "",
    taxonomy: "game",
  };
  assert.equal(materialLibraryPageLimit(base), MATERIAL_LIBRARY_DEFAULT_PAGE_LIMIT);
  assert.equal(materialLibraryPageLimit({ ...base, limit: 100 }), 100);
  // 不合法的取值退回默认，不把 NaN 发上网关。
  assert.equal(materialLibraryPageLimit({ ...base, limit: 0 }), 60);
  assert.equal(materialLibraryPageLimit({ ...base, limit: -5 }), 60);
  assert.equal(materialLibraryPageLimit({ ...base, limit: "abc" }), 60);

  const defaultKey = materialLibraryRequestKey(base);
  assert.equal(materialLibraryRequestKey({ ...base, limit: 60 }), defaultKey);
  assert.equal(defaultKey.includes("limit"), false, "默认页宽不该进缓存键");
  // 60 条那一页不能当 100 条那一页的缓存命中。
  assert.notEqual(materialLibraryRequestKey({ ...base, limit: 100 }), defaultKey);
});

// ── ⑤ 派发通路：不再经过编辑器检查 ──────────────────────────────────────────

test("「开玩」不再接编辑器派发；游戏在网格里也被路由到播放通路", () => {
  const view = readFileSync(
    new URL("../src/shell/material-library-view.tsx", import.meta.url),
    "utf8",
  );
  // 这是本轮要根除的那一行。
  assert.doesNotMatch(
    view,
    /onPlay=\{openPreparedItem\}/,
    "「开玩」还接在编辑器派发上",
  );
  // 网格那条通路上，游戏在碰到 isAdvancedEditableShelfItem 之前就被引走了。
  // 按**代码**取位置，不按注释——注释里提到判据名会让这条断言假绿。
  const openPrepared = view.slice(view.indexOf("const openPreparedItem"));
  const playAt = openPrepared.indexOf("if (openArtifactPlay(item)) return;");
  const editableAt = openPrepared.indexOf("if (!isAdvancedEditableShelfItem(item)) {");
  assert.ok(playAt > -1, "openPreparedItem 里没有播放分流");
  assert.ok(editableAt > -1, "openPreparedItem 里找不到编辑器检查");
  assert.ok(
    playAt < editableAt,
    "播放分流排在编辑器检查之后，view_only 游戏仍会抛错",
  );
  // 素材那一类的编辑器落点没被动过。
  assert.match(view, /onOpenItem=\{openPreparedItem\}/);
  assert.match(view, /当前 revision 缺少可验证的编辑器 source。/);
});

// ── ⑥ feed 渲染：链接落点、缺地址、三态封面 ────────────────────────────────

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
/** 封面渲染器是 W1 那条链；这里只按它公布的三态接口给桩。 */
const coverStub = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function workspaceCoverPlan({ url, item }) {
    const evidence = String(item?.meta?.test_cover_evidence || "real");
    if (evidence === "proven-placeholder") {
      return { renderer: "unavailable", url, mediaType: "", format: "", fit: "contain",
        sourceAspectRatio: null, failureReason: "封面是纯色/shelf-fill 占位图，不是真实媒体。",
        coverEvidence: "proven-placeholder", evidenceReason: "封面是占位图。" };
    }
    return { renderer: "image", url, mediaType: "image/webp", format: "webp", fit: "cover",
      sourceAspectRatio: null, failureReason: "",
      coverEvidence: evidence, evidenceReason: evidence === "real" ? "" : "封面缺少尺寸元数据。" };
  }
  export function WorkspaceCoverResource({ plan, alt }) {
    return createElement("img", { "data-cover-renderer": plan.renderer, src: plan.url, alt });
  }
`);

const { ExplorePlayableFeed, EXPLORE_FEED_PLAY_LINK_ATTR } = await import(
  await compileModule("src/shell/ExplorePlayableFeed.tsx", {
    "../i18n/ui/useUI": dataModule("export function useUI(){ return (zh) => zh; }"),
    "./workspace-library-cover": coverStub,
  })
);

function feedEntry(item, extra = {}) {
  return {
    id: item.artifactId || item.id,
    title: item.title,
    thumbUrl: `https://asset.oceanleo.com/cover/${item.artifactId || item.id}.webp`,
    libraryItem: item,
    ...extra,
  };
}

function markup(props) {
  return renderToStaticMarkup(createElement(ExplorePlayableFeed, props));
}

test("「开玩」渲染成真实链接，落点就是 artifactPlayHref 的产出", () => {
  const item = gameItem({ id: "game-1" });
  const html = markup({ entries: [feedEntry(item)] });
  assert.equal(EXPLORE_FEED_PLAY_LINK_ATTR, "data-explore-feed-play");
  assert.match(html, /<a href="\/play\/artifact\/game-1\?revision=r1"/);
  assert.match(html, /data-explore-feed-play="game-1"/);
  assert.match(html, /开玩/);
  // 没传 onPlay 也照样能开玩：落点是链接，不是回调。
  assert.doesNotMatch(html, /data-explore-feed-play-unavailable/);
});

test("算不出落点时如实呈现，不给一个点了没反应的按钮", () => {
  const item = gameItem({ id: "game-2" });
  // 抹掉 artifact 坐标 = 推导不出路由。
  const orphan = { ...item, artifactId: "", artifact: undefined };
  const html = markup({ entries: [feedEntry({ ...orphan, id: "game-2" })] });
  assert.match(html, /data-explore-feed-play-unavailable="game-2"/);
  assert.match(html, /这一款还没有可玩地址。/);
  assert.doesNotMatch(html, /<a href="\/play\/artifact/);
});

test("封面走三态：unknown-metadata 照常显示且绝不写「不可用」", () => {
  const real = markup({ entries: [feedEntry(gameItem({ id: "g-real" }))] });
  assert.match(real, /data-explore-feed-cover="real"/);
  assert.match(real, /data-cover-renderer="image"/);
  assert.doesNotMatch(real, /data-explore-feed-cover-note/);

  const unknown = markup({
    entries: [
      feedEntry(
        gameItem({ id: "g-unknown", meta: { test_cover_evidence: "unknown-metadata" } }),
      ),
    ],
  });
  assert.match(unknown, /data-explore-feed-cover="unknown-metadata"/);
  // 元数据不全的图**照样画出来**，只在角上弱化标记。
  assert.match(unknown, /data-cover-renderer="image"/);
  assert.match(unknown, /data-explore-feed-cover-note="unknown-metadata"/);
  assert.doesNotMatch(unknown, /不可用/);

  const placeholder = markup({
    entries: [
      feedEntry(
        gameItem({
          id: "g-placeholder",
          meta: { test_cover_evidence: "proven-placeholder" },
        }),
      ),
    ],
  });
  assert.match(placeholder, /data-explore-feed-cover="proven-placeholder"/);
  assert.match(placeholder, /这张封面是占位图。/);
  assert.doesNotMatch(placeholder, /data-cover-renderer="image"/);
});

test("翻到页数上限时如实提示还有没载入的", () => {
  const entries = [feedEntry(gameItem({ id: "g1" }))];
  assert.doesNotMatch(markup({ entries }), /data-explore-feed-truncated/);
  const truncated = markup({ entries, truncated: true });
  assert.match(truncated, /data-explore-feed-truncated="true"/);
  assert.match(truncated, /还有更多可玩作品未载入。/);
});
