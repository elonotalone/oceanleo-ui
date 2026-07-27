// ============================================================================
// W4 —— 「预览&编辑」的只读落点（合同 §0.4 / §3.1 / W4 Done-when 1、2、6）
// ----------------------------------------------------------------------------
// 大卡片上「预览&编辑」的落点是**库里的只读预览页**，不是重型编辑器：操作员的原话是
// 「防止用户在探索时误入重型功能」。预览页里再点「编辑」才走 fork。
// 本文件锁死三件事：深链形状、预览路径是纯读、首屏不拉重型 payload。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  LIBRARY_PREVIEW_QUERY_MODE,
  libraryEditIntentArtifactId,
  libraryPreviewIntentAction,
  libraryPreviewIntentArtifactId,
  libraryPreviewIntentFromSearch,
} from "../src/shell/library-edit-intent.ts";
import { normalizeWorkspaceAction } from "../src/shell/workspace-actions.ts";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * 「代码里没有这个符号」这类断言必须先把注释剥掉，否则解释性文字会自己撞上去。
 *
 * 行注释必须先剥：本仓的中文注释里出现过 `all/*` 这样的字面量，先剥块注释会让它
 * 当成块注释开头，把后面一大段真代码一起吞掉。
 */
const codeOnly = (text) =>
  text.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const editIntentSource = source("../src/shell/library-edit-intent.ts");
const myLibrarySource = source("../src/shell/MyLibrary.tsx");
const workspaceLibrarySource = source("../src/shell/WorkspaceLibrary.tsx");
const viewersSource = source("../src/shell/library-viewers.tsx");
const firstPaintSource = source("../src/shell/library-viewer-first-paint.tsx");
const artifactClientSource = source("../src/shell/artifact-client.ts");

// ── 深链形状（合同 §3.1，W3 的 workspaceTemplatePreviewHref 产出）─────────────

test("?tab=library&item=<id>&mode=preview&app=<appId> 解析成 LibraryPreviewIntent", () => {
  assert.equal(LIBRARY_PREVIEW_QUERY_MODE, "preview");
  assert.deepEqual(
    libraryPreviewIntentFromSearch(
      "?tab=library&item=artifact-9&mode=preview&app=poster",
    ),
    { artifactId: "artifact-9", mode: "preview" },
  );
  // URLSearchParams 与去掉问号的字符串都要认。
  assert.deepEqual(
    libraryPreviewIntentFromSearch(
      new URLSearchParams("tab=library&item=artifact-9&mode=preview"),
    ),
    { artifactId: "artifact-9", mode: "preview" },
  );
  // `library` 只是 slot 别名，canonical 的 `mine` 同样是库。
  assert.deepEqual(
    libraryPreviewIntentFromSearch("?tab=mine&item=a&mode=preview"),
    { artifactId: "a", mode: "preview" },
  );
});

test("少一个条件就不是库预览落点，绝不产出半截意图", () => {
  for (const search of [
    "",
    "?tab=library&item=artifact-9",
    "?tab=library&mode=preview",
    "?item=artifact-9&mode=preview",
    "?tab=browser&item=artifact-9&mode=preview",
    "?tab=library&item=artifact-9&mode=edit",
    "?tab=library&item=%20%20&mode=preview",
  ]) {
    assert.equal(
      libraryPreviewIntentFromSearch(search),
      null,
      `不该产出意图：${search || "(空)"}`,
    );
  }
});

test("预览意图变成 envelope 时用 intent=open，不需要新的 intent 取值", () => {
  const action = libraryPreviewIntentAction({
    artifactId: "artifact-9",
    mode: "preview",
  });
  assert.deepEqual(action, {
    version: 1,
    tab: "mine",
    itemId: "artifact-9",
    intent: "open",
  });
  // 过一遍 normalize 必须逐字存活，否则右栏收到的就不是这条意图了。
  const normalized = normalizeWorkspaceAction(action);
  assert.equal(normalized.tab, "mine");
  assert.equal(normalized.itemId, "artifact-9");
  assert.equal(normalized.intent, "open");
  assert.equal(libraryPreviewIntentAction({ artifactId: "", mode: "preview" }), null);
});

test("只有显式 intent=open 才是预览意图；老 receipt 语义原样不变", () => {
  assert.equal(
    libraryPreviewIntentArtifactId({
      nonce: "n1",
      action: { version: 1, tab: "mine", itemId: "art_1", intent: "open" },
    }),
    "art_1",
  );
  // 完全没有 intent 的历史 receipt 不归本模块管：不按 id 取数、也不冒失败态。
  for (const action of [
    { version: 1, tab: "mine", itemId: "art_1" },
    { version: 1, tab: "mine", itemId: "art_1", intent: "edit" },
    { version: 1, tab: "mine", intent: "open" },
  ]) {
    assert.equal(libraryPreviewIntentArtifactId({ nonce: "n1", action }), "");
  }
  assert.equal(libraryPreviewIntentArtifactId(null), "");
  assert.equal(
    libraryPreviewIntentArtifactId({
      nonce: "",
      action: { version: 1, tab: "mine", itemId: "art_1", intent: "open" },
    }),
    "",
  );
});

test("两种意图互不串味：edit 只认 edit，preview 只认 open", () => {
  const editAction = {
    nonce: "n1",
    action: { version: 1, tab: "mine", itemId: "art_1", intent: "edit" },
  };
  const previewAction = {
    nonce: "n2",
    action: { version: 1, tab: "mine", itemId: "art_1", intent: "open" },
  };
  assert.equal(libraryEditIntentArtifactId(editAction), "art_1");
  assert.equal(libraryPreviewIntentArtifactId(editAction), "");
  assert.equal(libraryEditIntentArtifactId(previewAction), "");
  assert.equal(libraryPreviewIntentArtifactId(previewAction), "art_1");
});

// ── 接线：V5 BLOCKER-3「helper 都在、零调用者」不许再发生 ────────────────────

test("helper 产出的 envelope 足以让右栏切到「我的库」并被消费端认出", () => {
  // BLOCKER-3 的形状是：两个 helper 各自都对，中间没人把 URL 变成事件，于是
  // 「预览&编辑」一路落到 app 操作台，3D 拖不动、website 点不了。接线归 W3
  // （`site-catalog-deeplink.tsx`），这里锁死**接线所依赖的那份契约**——只要它成立，
  // 路由侧照着派发就一定能落到只读预览上。
  const intent = libraryPreviewIntentFromSearch(
    "?tab=library&item=artifact-9&mode=preview&app=poster",
  );
  assert.deepEqual(intent, { artifactId: "artifact-9", mode: "preview" });
  const action = libraryPreviewIntentAction(intent);

  // `ResultCanvas` 收到事件后直接 `select(action.tab)`。这里必须是 mine，否则右栏
  // 还停在 app 操作台——V5 看到的正是这个。
  assert.equal(action.tab, "mine");
  // 过一遍 normalize（右栏收到时一定会做）后 intent 必须还活着，否则消费端认不出。
  const normalized = normalizeWorkspaceAction(action);
  assert.equal(normalized.intent, "open");
  assert.equal(normalized.itemId, "artifact-9");
  assert.equal(
    libraryPreviewIntentArtifactId({ nonce: "n1", action: normalized }),
    "artifact-9",
  );
  assert.equal(
    libraryEditIntentArtifactId({ nonce: "n1", action: normalized }),
    "",
    "预览深链绝不能被当成 edit 意图直接推进重型编辑器",
  );
});

test("没有 app 段的预览深链同样要能解析（W3 的 href helper 会产出这种）", () => {
  // `workspaceTemplatePreviewHref("", "art-a")` → `?tab=library&item=art-a&mode=preview`，
  // 不带 `app=`。解析这一侧必须认，否则这类链接会静默什么都不发生。
  const intent = libraryPreviewIntentFromSearch(
    "?tab=library&item=art-a&mode=preview",
  );
  assert.deepEqual(intent, { artifactId: "art-a", mode: "preview" });
  assert.equal(libraryPreviewIntentAction(intent).tab, "mine");
});

// ── 预览是纯读：挂载预览页不得发生任何写操作 ─────────────────────────────────

test("预览落点只走 GET，绝不在挂载时 fork", () => {
  // 本模块唯一的取数是 `/v1/library/items/<id>` 的 GET。
  assert.match(editIntentSource, /getCurrentArtifactItem\(/);
  assert.doesNotMatch(
    codeOnly(editIntentSource),
    /getArtifactEditDecision|forkArtifact|prepareArtifactForAction/,
  );
  // 预览命中后交给只读落点，不是交给 typed 编辑器。
  assert.match(editIntentSource, /latest\.current\.onPreviewItem\?\.\(item\)/);
  // 宿主把它挂进 entries（安静预览详情），而不是挂进 AdvancedContentWorkbench。
  assert.match(myLibrarySource, /onPreviewItem: setPreviewIntentItem/);
  assert.match(myLibrarySource, /previewIntentItem \? \[toEntry\(previewIntentItem\)\] : \[\]/);
});

test("深链指名的是 artifact id，右栏必须按 artifactId 匹配才能选中", () => {
  // durable 条目的 entry.id 是 `artifact:<artifactId>:<revisionId>`，直接比 id 永远匹配不上。
  assert.match(
    workspaceLibrarySource,
    /entry\.libraryItem\.artifactId === next\.itemId/,
  );
  // intent=edit 已经由宿主送进编辑器，右栏不再抢着开一层安静详情。
  assert.match(workspaceLibrarySource, /if \(next\.intent === "edit"\) return;/);
});

test("预览详情页保留「编辑」入口，点它才走 fork 决策", () => {
  // 详情头部的动作按钮里带 onEdit；ArtifactActionButtons 会经 prepareArtifactForAction
  //（→ getArtifactEditDecision → owner 判定 → fork）再交给宿主。
  assert.match(workspaceLibrarySource, /onEdit=\{editItem\}/);
  assert.match(workspaceLibrarySource, /actionButtonsFor\(/);
});

// ── 首屏要快（Done-when 6）──────────────────────────────────────────────────

test("重型 viewer 等容器可见才挂载，首屏只画一张 thumb 海报", () => {
  assert.match(firstPaintSource, /const HEAVY_LIBRARY_VIEWER_KINDS/);
  for (const kind of [
    "website",
    "canvas",
    "ppt",
    "sheet",
    "document",
    "video_canvas",
    "threed",
  ]) {
    assert.ok(
      new RegExp(
        `HEAVY_LIBRARY_VIEWER_KINDS[\\s\\S]*?"${kind}"[\\s\\S]*?\\];`,
      ).test(firstPaintSource),
      `${kind} 应当被算作重型 viewer`,
    );
  }
  assert.match(
    viewersSource,
    /useVisibleViewerGate\(!libraryViewerIsHeavy\(item\)\)/,
  );
  assert.match(firstPaintSource, /IntersectionObserver/);
  assert.match(viewersSource, /<ViewerThumbPoster item=\{item\} containerRef=\{gate\.ref\}/);
  // 闸门缺席时不许把预览卡死。
  assert.match(firstPaintSource, /typeof IntersectionObserver !== "function"/);
  // 重型分支的 hook（office 取包 / rendition 刷新）在 body 里，闸门没放行就不会跑。
  assert.match(
    viewersSource,
    /function LibraryItemViewerBody\([\s\S]{0,140}usePreparedOfficeLibraryItem\(item\)/,
  );
});

test("图片预览先出 .thumb.webp，全尺寸后台预载完成再换", () => {
  assert.match(firstPaintSource, /export function ProgressiveArtifactImage/);
  assert.match(
    viewersSource,
    /thumbUrl=\{resolvedItem\.thumbUrl \|\| ""\}[\s\S]{0,80}fullUrl=\{url\}/,
  );
  assert.match(firstPaintSource, /preload\.onload = \(\) => \{/);
  assert.match(firstPaintSource, /decoding="async"/);
  assert.match(firstPaintSource, /loading="lazy"/);
});

test("预览页没有动 iframe sandbox / postMessage 目标源", () => {
  // 沙箱属性仍由 editor-sandbox-origin 单点决定，本轮一个字都没加。
  assert.match(
    viewersSource,
    /sandbox=\{webViewerFrameSandbox\(trustedInteractive\)\}/,
  );
  assert.doesNotMatch(viewersSource, /allow-same-origin allow-scripts/);
});

// ── fork 判据（与 library-edit-independence.test.mjs 的行为断言互为表里）──────

test("fork 判据在源码里也必须看不到 canEdit", () => {
  const code = codeOnly(artifactClientSource);
  const decision =
    /export async function getArtifactEditDecision[\s\S]*?\nexport /.exec(
      code,
    )?.[0];
  assert.ok(decision, "没找到 getArtifactEditDecision");
  assert.doesNotMatch(decision, /access\.canEdit/);
  assert.match(decision, /resolveArtifactEditOwnership\(canonical\)/);
  assert.match(decision, /ownership\.kind === "unknown"/);
  assert.match(decision, /ownership\.kind === "fork"/);
  // 身份未知时中止，绝不有「默认当自己是 owner」的分支。
  const ownership =
    /export async function resolveArtifactEditOwnership[\s\S]*?\nexport /.exec(
      code,
    )?.[0];
  assert.ok(ownership);
  assert.doesNotMatch(ownership, /access\.canEdit/);
  assert.match(ownership, /if \(!ownerPrincipalId\) return \{ kind: "fork" \};/);
});
