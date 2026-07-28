// 跨站高级能力一致性 —— 共享包这一侧的门禁（W6，01-decisions.md D6）。
//
// 分工：站仓那一侧由 `oceandino/scripts/oceanleo-capability-parity-gate.sh` 看着
// （36 个 consumer 的接线形状、pin、标准五页、SSR HTML 标记）。本文件看的是**共享包
// 自己**——因为「所有网站的高级功能本质上完完全全一套」有两种破法：
//
//   ① 站点侧手写接线各不相同（站仓门禁负责）；
//   ② 共享包自己按 site key 分叉，于是同一份代码在不同站表现不同（本文件负责）。
//
// ② 比 ① 隐蔽得多：36 站 pin 在同一个 tag、代码物理同一份，看起来毫无漂移，但包里
// 一句 `siteId === "design"` 就足以让 design 站多一条别站没有的路。所以这里用
// **棘轮式白名单**：现存的分叉逐条登记（带 owner 与理由），**再多一条就红**。
//
// 全部检查都是静态的：读源码、读常量表，不渲染、不联网、不开浏览器
// （AGENTS.md policy:verification.browser-consent，本轮未获浏览器批准）。

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ARTIFACT_TYPES, ADVANCED_CAPABILITY_MATRIX } from "../src/shell/artifact-contract.ts";
import { MATERIAL_TAXONOMY_LABEL } from "../src/shell/material-library-controller.ts";

const SRC = new URL("../src/", import.meta.url).pathname;

function sourceFiles(dir = SRC, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

/** 去掉注释，免得注释里举的反例把门禁骗红。 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ---------------------------------------------------------------------------
// 1. 共享包不得按 site key 分叉（棘轮白名单）
// ---------------------------------------------------------------------------

/**
 * 已登记的 site key 分叉。key = `<相对 src 的路径>::<site key>`。
 * 加新条目**必须**同时写清楚它是「安全收紧」还是「能力漂移」，漂移项要有 owner。
 */
const KNOWN_SITE_BRANCHES = new Map([
  [
    "shell/library-viewers.tsx::asset",
    "安全收紧，不是能力漂移：只有 asset 站的 video_workflow 素材才可能拿到 trusted " +
      "interactive viewer，其余一律沙箱。放松它要过 oceanleo-security-gate.sh。",
  ],
  [
    "shell/website-embed-params.ts::asset",
    "产品定义，不是能力漂移：asset 是免费开源素材库，它的素材对所有用户只读。",
  ],
  [
    "shell/advanced-session.ts::design",
    "**能力漂移候选**：design 站独有的 legacy template_doc_url 回填（site:tpl-* → " +
      "asset.oceanleo.com/design-templates）。别站没有这条路。属 W2 的边界，W6 只登记不改，" +
      "见 W6-marker.md 的 handoff。",
  ],
  [
    "shell/InlineEditorMaterialPanel.tsx::design",
    "**能力漂移候选**：只有 design 站会拿到 curatedSeriesId=\"design-materials\"，" +
      "别站传空串。属 W2/W3 的边界，W6 只登记不改，见 W6-marker.md 的 handoff。",
  ],
]);

test("共享包不得新增按 site key 的分叉（一站有、另一站没有）", () => {
  // `siteId === "default"` 之类的哨兵值不是站点 key，用清册里真实存在过的 key 才算数。
  const SENTINELS = new Set(["default", "", "unknown"]);
  const found = new Map();

  for (const path of sourceFiles()) {
    const rel = path.slice(SRC.length);
    const src = stripComments(readFileSync(path, "utf8"));
    for (const m of src.matchAll(/\bsite(?:Id|Key)\s*===\s*["']([a-z0-9-]+)["']/g)) {
      if (SENTINELS.has(m[1])) continue;
      found.set(`${rel}::${m[1]}`, (found.get(`${rel}::${m[1]}`) || 0) + 1);
    }
  }

  const added = [...found.keys()].filter((k) => !KNOWN_SITE_BRANCHES.has(k));
  assert.deepEqual(
    added,
    [],
    "共享包里出现了未登记的 site key 分叉。「所有站一套」意味着共享包不认识具体是哪个站：\n" +
      added.map((k) => `  · ${k}`).join("\n") +
      "\n如果确有不得已的理由，把它连同理由与 owner 登记进 KNOWN_SITE_BRANCHES，" +
      "这样它至少是**可数的**，而不是悄悄长出来的。",
  );

  const stale = [...KNOWN_SITE_BRANCHES.keys()].filter((k) => !found.has(k));
  assert.deepEqual(
    stale,
    [],
    `白名单里这些分叉已经不存在了，删掉对应条目（白名单只许缩小）：\n${stale.map((k) => `  · ${k}`).join("\n")}`,
  );
});

// ---------------------------------------------------------------------------
// 2. 没有二等 artifact 类型
// ---------------------------------------------------------------------------

test("每个 artifact 类型都有素材货架标签（少一个 = 产这类素材的站少一颗 chip）", () => {
  const missing = ARTIFACT_TYPES.filter((t) => !MATERIAL_TAXONOMY_LABEL[t]);
  assert.deepEqual(
    missing,
    [],
    `这些类型进了 ARTIFACT_TYPES 却没有 MATERIAL_TAXONOMY_LABEL：${missing.join(", ")}。` +
      "产这类素材的站，它的素材在货架上会没有类型名。",
  );

  const extra = Object.keys(MATERIAL_TAXONOMY_LABEL).filter((t) => !ARTIFACT_TYPES.includes(t));
  assert.deepEqual(extra, [], `MATERIAL_TAXONOMY_LABEL 里有不存在的类型：${extra.join(", ")}`);
});

test("每个 artifact 类型都有编辑能力（少一个 = 那类素材在所有站都只能看不能改）", () => {
  // 一个类型可以不是某条能力的「主类型」而只出现在 artifactBindings 里
  // （`vector_image` 就是挂在 design-canvas 那条上的），两处都要算。
  const withEditor = new Set();
  for (const row of ADVANCED_CAPABILITY_MATRIX) {
    withEditor.add(row.artifactType);
    for (const binding of row.artifactBindings) withEditor.add(binding.artifactType);
  }
  const missing = ARTIFACT_TYPES.filter((t) => !withEditor.has(t));
  assert.deepEqual(
    missing,
    [],
    `这些类型没有任何 ADVANCED_CAPABILITY_MATRIX 条目：${missing.join(", ")}。` +
      "探索页能列出它、我的库能存它，点「编辑」却无处可去。",
  );
});

test("同一个 artifact 类型的编辑能力在包里只有一份定义（不许按站另开一套）", () => {
  const seen = new Map();
  for (const row of ADVANCED_CAPABILITY_MATRIX) {
    const key = `${row.artifactType}/${row.editorCapability}`;
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  assert.deepEqual(dupes, [], `重复的 artifactType/editorCapability 绑定：${dupes.join(", ")}`);
});

// ---------------------------------------------------------------------------
// 3. ExplorePage 的对外面必须是零配置形状
//    这一条钉死 W3-interface-explore-props.md §3：站点侧只能提供 site key 与外观，
//    任何人想再加一个「让站点自己配」的必填 knob，都会先撞在这里。
// ---------------------------------------------------------------------------

const EXPLORE_SRC = readFileSync(new URL("../src/shell/ExplorePage.tsx", import.meta.url), "utf8");

function explorePropsBlock() {
  const start = EXPLORE_SRC.indexOf("export interface ExplorePageProps");
  assert.notEqual(start, -1, "ExplorePage.tsx 里找不到 ExplorePageProps 接口");
  const open = EXPLORE_SRC.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < EXPLORE_SRC.length; i += 1) {
    if (EXPLORE_SRC[i] === "{") depth += 1;
    else if (EXPLORE_SRC[i] === "}") {
      depth -= 1;
      if (depth === 0) return EXPLORE_SRC.slice(open + 1, i);
    }
  }
  throw new Error("ExplorePageProps 的花括号没有配平");
}

/** 只取顶层成员（嵌套函数签名里的参数不算 prop）。 */
function declaredProps(block) {
  const props = new Map();
  let depth = 0;
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim();
    if (depth === 0) {
      const m = /^([A-Za-z_$][\w$]*)(\?)?\s*:/.exec(line);
      if (m) props.set(m[1], { optional: Boolean(m[2]) });
    }
    depth += (rawLine.match(/[{(]/g) || []).length - (rawLine.match(/[})]/g) || []).length;
  }
  return props;
}

test("ExplorePage 不得要求站点提供 site key 以外的任何东西", () => {
  const props = declaredProps(explorePropsBlock());
  assert.ok(props.has("siteKey"), "ExplorePageProps 必须有 siteKey");
  // 断言的是「必填集合 ⊆ {siteKey}」而不是「== {siteKey}」：`siteKey` 本身在实现里
  // 仍是可选的（旧拼写 `siteId` 还要能编译过，缺 key 由运行时守卫 + SSR 标记兜底），
  // 那是 W3 的取舍。W6 要钉死的是**别的**——站点侧不许被要求配置任何能力。
  const required = [...props.entries()].filter(([, v]) => !v.optional).map(([k]) => k);
  const offenders = required.filter((name) => name !== "siteKey");
  assert.deepEqual(
    offenders,
    [],
    "站点侧只该被要求提供 site key。任何新的必填 prop 都意味着「每个站自己配一遍」，" +
      `而那正是 D6 要根治的东西。多出来的必填项：${offenders.join(", ")}`,
  );
});

test("能力配置类 prop 只许以 deprecated 形式存在，且不得必填", () => {
  const block = explorePropsBlock();
  const props = declaredProps(block);
  for (const name of ["config", "siteId"]) {
    if (!props.has(name)) continue;
    assert.equal(props.get(name).optional, true, `${name} 必须是可选的（它是兼容期遗留）`);
    const idx = block.indexOf(`${name}?`);
    const preceding = block.slice(Math.max(0, idx - 400), idx);
    assert.match(
      preceding,
      /@deprecated/,
      `${name} 必须标 @deprecated —— 没标的话下一个人会以为它还是正经用法，` +
        "而站仓门禁 [C4] 是把它当漂移判红的。",
    );
  }
});

test("ExploreConfig 的能力配置字段不得被共享包采纳（只保留形状做兼容）", () => {
  // W3 定的口径：传了 `type`/`types`/`title`/`subtitle`/`emptyHint`/`categories`
  // 是**被忽略**（并报为漂移），不是被采纳。真采纳了，站点就又能各配各的了。
  const legacyKeys = ["type", "types", "title", "subtitle", "emptyHint", "categories"];
  const src = stripComments(EXPLORE_SRC);
  const offenders = legacyKeys.filter((key) =>
    new RegExp(`config\\??\\.${key}\\b`).test(src) ||
    new RegExp(`\\bconfig\\s*\\.\\s*${key}\\b`).test(src),
  );
  assert.deepEqual(
    offenders,
    [],
    `ExplorePage 还在读 config 的这些字段：${offenders.join(", ")}。` +
      "零配置意味着它们只剩形状、不再生效（W3-interface-explore-props.md §3）。",
  );
});
