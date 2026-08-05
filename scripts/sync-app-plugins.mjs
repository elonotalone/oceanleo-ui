#!/usr/bin/env node
// ============================================================================
// sync-app-plugins.mjs — 把 W10 的「哪个 app 配哪些工具」清册同步进共享包
// ----------------------------------------------------------------------------
// 单一事实源在 oceandino 仓：手写的 `scripts/data/oceanleo-plugin-registry.json`
// （一个工具问一次「哪些 app 需要它」，每条都要有理由），由
// `scripts/oceanleo-plugin-registry.mjs` 算出按 app 索引的派生视图
// `scripts/data/oceanleo-app-plugins.json`。本脚本读的是派生视图。
//
// 前一版读的是 `oceanleo-app-capability-map.json`：那份数据是
// 「L4 装配单点了这个族 × 该族有编辑器实现 ⇒ 发按钮」算出来的，两个条件都与
// 「这个 app 的用户需不需要这个工具」无关，结果是 2177 枚按钮铺在 532 个 app 上。
// 操作员 2026-08-05 裁定：授权粒度是 app，决定的单位是工具，没有理由就不发按键。
// 所以数据源整条换掉，旧生成物一并删除，避免两份数据并存。
//
// 共享包不能在运行时读另一个仓库的文件，36 个消费站也不该各自抄一份（抄一遍就等于
// 把站点清单硬编码回前端）。所以这里把它转成一个随包发布的 TS 数据模块。
//
//   清册改了 → 跑本脚本 → 提交生成文件 → bump 共享包 → 36 站零代码改动跟着变。
//
// 为什么是 .ts 而不是直接 import .json：本仓 focused test 走
// `node --experimental-strip-types`，ESM 下 import JSON 必须带 import attributes，
// 而 tsc 的 resolveJsonModule 不认那种写法。生成 .ts 两边都能直接 import。
//
// 用法：
//   node scripts/sync-app-plugins.mjs            # 同步并写盘
//   node scripts/sync-app-plugins.mjs --check    # 只校验是否已同步（CI 用）
//   node scripts/sync-app-plugins.mjs --from <path>
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "oceanleo.app-plugins.v1";
const DEFAULT_SOURCE =
  process.env.OCEANLEO_APP_PLUGINS ||
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-app-plugins.json";
// 文件名里刻意**不用** `.generated.ts`：focused test 的扩展名 loader 会把
// `./x.generated` 当成「已经带扩展名」而不再补 `.ts`，import 直接 ERR_MODULE_NOT_FOUND。
const TARGET = resolve(REPO_ROOT, "src/shell/app-plugins-generated.ts");

// 三个非编辑类运行时内核（分类裁定 §4.3）。编辑类工具没有按键，它们的 id 只会以别的
// runtime 出现，所以这张三元表就是「编辑类混进清册」的兜底闸。
// 消费侧 `src/shell/app-capability-entry.ts` 有同一份表并在读取时再判一次：
// 生成器负责让错误数据进不来，消费侧负责让错误数据即使进来了也长不出按钮。
const RUNTIMES = new Set(["geo-map", "grid", "interactive-doc"]);
const FIELDS = ["id", "label", "runtime", "doc"];

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const fromIndex = argv.indexOf("--from");
const sourcePath = fromIndex >= 0 ? argv[fromIndex + 1] : DEFAULT_SOURCE;

function fail(message) {
  process.stderr.write(`sync-app-plugins: ${message}\n`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(sourcePath, "utf8"));
} catch (error) {
  fail(
    `无法读取清册派生视图 ${sourcePath} — ${error.message}\n` +
      "  它由 oceandino 仓的 `node scripts/oceanleo-plugin-registry.mjs` 生成。",
  );
}

if (raw?.schema !== SCHEMA) {
  fail(`schema 不是 ${SCHEMA}（读到 ${JSON.stringify(raw?.schema)}）`);
}

/**
 * 派生视图的层级是 `site → app → 行数组`。容器键名允许 `sites` 或 `apps`，
 * 且允许把两段拍平成 `"<site>/<app>"` 一个键 —— 三种写法在生成侧都出现过，
 * 这里统一收敛成共享包里唯一的那种（拍平键），让运行时只认一种形状。
 */
function flatten(container) {
  const flat = new Map();
  for (const [key, value] of Object.entries(container)) {
    if (Array.isArray(value)) {
      if (!/^[^/]+\/[^/]+$/.test(key)) {
        fail(`键 ${key} 既不是 <siteKey>/<appId>，值又是数组，形状认不出来`);
      }
      flat.set(key, value);
      continue;
    }
    if (value == null || typeof value !== "object") {
      fail(`站 ${key} 的值既不是 app 表也不是行数组`);
    }
    if (key.includes("/")) fail(`站键 ${key} 不该含斜杠`);
    for (const [appId, rows] of Object.entries(value)) {
      if (!Array.isArray(rows)) fail(`${key}/${appId} 的值不是数组`);
      if (appId.includes("/")) fail(`app 键 ${appId} 不该含斜杠`);
      flat.set(`${key}/${appId}`, rows);
    }
  }
  return flat;
}

const container = raw.sites ?? raw.apps;
if (!container || typeof container !== "object") {
  fail("派生视图缺少 sites / apps 容器");
}
const flat = flatten(container);

const problems = [];
let rowCount = 0;

for (const [key, rows] of flat) {
  if (rows.length === 0) {
    // 「这个 app 一个工具都不需要」是正常且常见的结论，但那种 app 不该在表里占一行：
    // 空数组与「不在表里」在消费侧完全等价，留着只会让清册看起来比实际大。
    problems.push(`${key} 是空数组 —— 不需要工具的 app 不要写进派生视图`);
    continue;
  }
  const seen = new Set();
  for (const row of rows) {
    rowCount += 1;
    for (const field of FIELDS) {
      if (typeof row?.[field] !== "string" || row[field].trim() === "") {
        problems.push(`${key} 有一行缺 ${field}`);
      }
    }
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (id && seen.has(id)) problems.push(`${key} 里 ${id} 出现了两次`);
    if (id) seen.add(id);
    // 红线 8：面向用户的文案里不许出现「插件」（该词已被 35 个站的 /plugins
    // MCP 连接器目录占用）。按钮文案一律用工具自己的中文名。
    if (typeof row?.label === "string" && row.label.includes("插件")) {
      problems.push(`${key} 的按钮文案含「插件」：${row.label}`);
    }
    if (typeof row?.runtime === "string" && !RUNTIMES.has(row.runtime.trim())) {
      problems.push(
        `${key} 的 ${id || "(无 id)"} runtime=${row.runtime} 不是三个非编辑类内核之一 ——` +
          "编辑类工具没有按键，不许进清册",
      );
    }
  }
}

if (problems.length) {
  fail(
    `派生视图有 ${problems.length} 处问题，前 5 条：\n  ${problems.slice(0, 5).join("\n  ")}`,
  );
}

const appKeys = [...flat.keys()].sort();
const lines = [];
lines.push("// ============================================================================");
lines.push("// GENERATED FILE — 不要手改。");
lines.push("// 由 `node scripts/sync-app-plugins.mjs` 从 W10 的清册派生视图生成：");
lines.push(`//   ${sourcePath}`);
lines.push("// 清册与生成器都在 oceandino 仓；本文件只是它在共享包里的发布副本。");
lines.push("// ============================================================================");
lines.push("");
lines.push('import type { AppCapabilityMap } from "./app-capability-entry";');
lines.push("");
lines.push("export const GENERATED_APP_PLUGIN_MAP: AppCapabilityMap = {");
lines.push(`  schema: ${JSON.stringify(raw.schema)},`);
if (raw.generatedAt) lines.push(`  generatedAt: ${JSON.stringify(raw.generatedAt)},`);
if (raw.source) lines.push(`  source: ${JSON.stringify(raw.source)},`);
lines.push("  apps: {");
for (const key of appKeys) {
  lines.push(`    ${JSON.stringify(key)}: [`);
  for (const row of flat.get(key)) {
    const parts = FIELDS.map(
      (field) => `${field}: ${JSON.stringify(row[field].trim())}`,
    );
    lines.push(`      { ${parts.join(", ")} },`);
  }
  lines.push("    ],");
}
lines.push("  },");
lines.push("};");
lines.push("");

const output = lines.join("\n");

if (checkOnly) {
  let current = "";
  try {
    current = readFileSync(TARGET, "utf8");
  } catch {
    fail(`${TARGET} 不存在，请先跑一次同步`);
  }
  if (current !== output) {
    fail("生成文件与清册不一致，请重跑 `node scripts/sync-app-plugins.mjs`");
  }
  process.stdout.write(
    `sync-app-plugins: 已同步（${appKeys.length} 个 app / ${rowCount} 枚按钮）\n`,
  );
  process.exit(0);
}

writeFileSync(TARGET, output, "utf8");
process.stdout.write(
  `sync-app-plugins: 写入 ${TARGET}（${appKeys.length} 个 app / ${rowCount} 枚按钮）\n`,
);
