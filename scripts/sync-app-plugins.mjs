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
// 生成物里有**两张表**，来自派生视图的两个段：
//
//   `GENERATED_APP_PLUGIN_MAP`        `sites` 段 → 哪个 app 上发哪几枚按键。
//   `GENERATED_PLUGIN_EXPORT_CATALOG` `plugins` 段 → 每件工具能导出成哪几种形态。
//
// 第二张是 W24 P2 加的。在那之前它是共享包里一份手抄的发布副本
// （`src/shell/plugin-export/export-catalog.ts`），清册改了它不会跟着改；
// 现在那份副本已删除，导出链的判据直接读本生成物。
//
// **`family` 那一列刻意不同步**：R-1 归一之后键就是 L3 族 id，再存一个同值的字段
// 就是两个真相，改一处漏一处必然漂移（`signals/W21-request.md` 第 3 条）。
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
/** 导出形态那张表要同步的字段。`family` 与 `doc` 不进：一个是同值重复，一个导出链用不上。 */
const PLUGIN_EXPORT_FIELDS = ["label", "runtime", "exportKinds"];

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

/**
 * 「登记为留空（hold）」的工具 —— 清册里认了它、但它今天没有可用的第一屏。
 *
 * 这类工具**不许随包发按键**：按键点开却没有初始态,就是一枚死按钮
 * （V4 实测：278 枚按键里只有 42 枚点得开）。fail-closed 的口径是
 * 「没有可用初始态就不发按键」,W10 自己在 A-7 的 hold 理由里也是这么写的。
 *
 * 三种登记写法都认（W10 侧怎么记都行,但必须记）:
 *   · 顶层 `pluginsWithoutApps: [{id, reason|ruling}]`（今天在用的那种）;
 *   · `plugins[<id>].hold = {reason}` 或 `= true`（有 app 名单但第一屏没做的那种）;
 *   · 顶层 `hold` 数组或 `{id: reason}` 对象。
 * 「查不到初始态又没登记」由 `tests/app-capability-entry.test.mjs` 判红 —— 那道闸
 * 在本脚本里判不了：初始态表是 TS 模块,本脚本是纯 node 脚本,读不到它。
 */
function collectHeld() {
  const held = new Map();
  const note = (id, reason) => {
    const key = String(id || "").trim();
    if (!key) return;
    held.set(key, String(reason || "").trim());
  };
  if (Array.isArray(raw.pluginsWithoutApps)) {
    for (const item of raw.pluginsWithoutApps) {
      note(item?.id, item?.reason || item?.ruling);
    }
  }
  if (raw.plugins && typeof raw.plugins === "object") {
    for (const [id, meta] of Object.entries(raw.plugins)) {
      if (!meta?.hold) continue;
      note(id, meta.hold?.reason || meta.hold?.ruling || meta.hold);
    }
  }
  if (Array.isArray(raw.hold)) for (const id of raw.hold) note(id, "");
  else if (raw.hold && typeof raw.hold === "object") {
    for (const [id, reason] of Object.entries(raw.hold)) note(id, reason);
  }
  return held;
}

const held = collectHeld();

const problems = [];
let rowCount = 0;
let heldRowCount = 0;
const heldSeen = new Set();

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
    if (id && held.has(id)) {
      heldRowCount += 1;
      heldSeen.add(id);
    }
  }
}

/**
 * 导出形态那张表（派生视图的 `plugins` 段）。
 *
 * 与按键那张表的取舍不同：**登记为留空的工具照样进这张表**。留空说的是
 * 「今天不发按键」，不是「这件工具不存在」；它的第一屏一旦补上，导出形态
 * 立刻要查得到。反过来把它漏掉，导出链的对账闸会判「有第一屏却查不到形态」。
 */
function collectExportCatalog() {
  const catalog = new Map();
  const source = raw.plugins;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    fail("派生视图缺少 plugins 段，导出形态清单无从同步");
  }
  for (const [id, meta] of Object.entries(source)) {
    const where = `plugins/${id}`;
    if (!meta || typeof meta !== "object") {
      problems.push(`${where} 不是一个对象`);
      continue;
    }
    for (const field of ["label", "runtime"]) {
      if (typeof meta[field] !== "string" || meta[field].trim() === "") {
        problems.push(`${where} 缺 ${field}`);
      }
    }
    if (typeof meta.label === "string" && meta.label.includes("插件")) {
      problems.push(`${where} 的中文名含「插件」：${meta.label}`);
    }
    if (typeof meta.runtime === "string" && !RUNTIMES.has(meta.runtime.trim())) {
      problems.push(
        `${where} 的 runtime=${meta.runtime} 不是三个非编辑类内核之一`,
      );
    }
    const kinds = meta.exportKinds;
    if (!Array.isArray(kinds) || kinds.length === 0) {
      // 一种形态都不声明的工具，导出入口没有落点。清册那一侧已有同名的闸
      //（ERR_UNKNOWN_EXPORT_KIND），这里再判一次是因为发布副本一旦漏掉，
      // 红会落在共享包里而不是清册里，排查方向整个偏掉。
      problems.push(`${where} 没有 exportKinds，导出入口没有可渲染的落点`);
    } else if (
      kinds.some((kind) => typeof kind !== "string" || kind.trim() === "")
    ) {
      problems.push(`${where} 的 exportKinds 里有空值`);
    } else if (new Set(kinds).size !== kinds.length) {
      problems.push(`${where} 的 exportKinds 有重复项：${kinds.join(" ")}`);
    }
    catalog.set(id, {
      label: String(meta.label || "").trim(),
      runtime: String(meta.runtime || "").trim(),
      exportKinds: Array.isArray(kinds) ? kinds.map((k) => String(k).trim()) : [],
    });
  }
  return catalog;
}

const exportCatalog = collectExportCatalog();

/** 发布副本 = 派生视图减去登记为留空的那些行；减完变空的 app 整个不写进去。 */
const published = new Map();
for (const [key, rows] of flat) {
  const keep = rows.filter((row) => !held.has(String(row?.id || "").trim()));
  if (keep.length) published.set(key, keep);
}

if (problems.length) {
  fail(
    `派生视图有 ${problems.length} 处问题，前 5 条：\n  ${problems.slice(0, 5).join("\n  ")}`,
  );
}

const appKeys = [...published.keys()].sort();
const publishedRowCount = appKeys.reduce(
  (sum, key) => sum + published.get(key).length,
  0,
);
const lines = [];
lines.push("// ============================================================================");
lines.push("// GENERATED FILE — 不要手改。");
lines.push("// 由 `node scripts/sync-app-plugins.mjs` 从 W10 的清册派生视图生成：");
lines.push(`//   ${sourcePath}`);
lines.push("// 清册与生成器都在 oceandino 仓；本文件只是它在共享包里的发布副本。");
if (heldSeen.size) {
  lines.push("//");
  lines.push(
    `// 登记为留空（hold）而**未发按键**的工具 ${heldSeen.size} 件、共 ${heldRowCount} 枚：`,
  );
  for (const id of [...heldSeen].sort()) lines.push(`//   · ${id}`);
  lines.push("// 它们今天没有可用的第一屏，发出去就是点开没反应的死按键。");
}
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
  for (const row of published.get(key)) {
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
lines.push("/**");
lines.push(" * 逐工具的导出形态清单（派生视图的 `plugins` 段）。");
lines.push(" *");
lines.push(" * **键就是 L3 族 id**，与按键表、第一屏、导出链逐字同一套。族 id 不再单列一个");
lines.push(" * 字段：键与字段各存一份就是两个真相，改一处漏一处必然漂移。");
lines.push(" *");
lines.push(" * `exportKinds` 是字符串数组而不是形态闭集：闭集在共享包的");
lines.push(" * `plugin-export/plugin-export-contract.ts` 里，本文件是数据不是判据。");
lines.push(" * 清册声明了一个导出链没实现的形态，由那边的对账闸判红。");
lines.push(" */");
lines.push("export interface GeneratedPluginExportEntry {");
lines.push("  /** 面向用户的中文名。 */");
lines.push("  label: string;");
lines.push('  runtime: "geo-map" | "grid" | "interactive-doc";');
lines.push("  exportKinds: readonly string[];");
lines.push("}");
lines.push("");
lines.push("export interface GeneratedPluginExportCatalog {");
lines.push("  schema: string;");
lines.push("  generatedAt: string;");
lines.push("  source: string;");
lines.push("  plugins: Readonly<Record<string, GeneratedPluginExportEntry>>;");
lines.push("}");
lines.push("");
lines.push(
  "export const GENERATED_PLUGIN_EXPORT_CATALOG: GeneratedPluginExportCatalog = {",
);
lines.push(`  schema: ${JSON.stringify(raw.schema)},`);
lines.push(`  generatedAt: ${JSON.stringify(raw.generatedAt || "")},`);
lines.push(`  source: ${JSON.stringify(raw.source || "")},`);
lines.push("  plugins: {");
for (const id of [...exportCatalog.keys()].sort()) {
  const entry = exportCatalog.get(id);
  lines.push(`    ${JSON.stringify(id)}: {`);
  lines.push(`      label: ${JSON.stringify(entry.label)},`);
  lines.push(`      runtime: ${JSON.stringify(entry.runtime)},`);
  lines.push(
    `      exportKinds: [${entry.exportKinds
      .map((kind) => JSON.stringify(kind))
      .join(", ")}],`,
  );
  lines.push("    },");
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
    fail(
      "生成文件与清册不一致，请重跑 `node scripts/sync-app-plugins.mjs`。\n" +
        `  清册 ${rowCount} 枚 / 发布副本应为 ${publishedRowCount} 枚（${appKeys.length} 个 app）。`,
    );
  }
  process.stdout.write(`sync-app-plugins: 已同步（${summary()}）\n`);
  process.exit(0);
}

writeFileSync(TARGET, output, "utf8");
process.stdout.write(`sync-app-plugins: 写入 ${TARGET}（${summary()}）\n`);

function summary() {
  const base =
    `${appKeys.length} 个 app / ${publishedRowCount} 枚按钮 / ` +
    `${exportCatalog.size} 件工具的导出形态`;
  if (!heldRowCount) return base;
  return `${base}；另有 ${heldRowCount} 枚属 ${heldSeen.size} 件登记留空的工具，未发布`;
}
