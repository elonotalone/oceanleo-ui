#!/usr/bin/env node
// ============================================================================
// sync-app-capability-map.mjs — 把 W4 的 app→能力映射同步进共享包（H 波 W2）
// ----------------------------------------------------------------------------
// 单一事实源在 oceandino 仓：`scripts/data/oceanleo-app-capability-map.json`
// （由 `scripts/oceanleo-app-capability-map.mjs` 从 L4 装配单算出，W4 独占）。
//
// 共享包不能在运行时去读另一个仓库的文件，36 个消费站也不该各自把这份数据抄一遍
// （抄一遍就等于把站点清单硬编码回前端，判据 H1-a 直接判红）。所以这里把它**转成一个
// 随包发布的 TS 数据模块**：`src/shell/app-capability-map.generated.ts`。
//
//   映射改了 → 跑本脚本 → 提交生成文件 → bump 共享包 → 36 站零代码改动跟着变。
//
// 为什么是 .ts 而不是直接 import .json：本仓 focused test 走
// `node --experimental-strip-types`，ESM 下 import JSON 必须带 import attributes，
// 而 tsc 的 resolveJsonModule 不认那种写法。生成 .ts 两边都能直接 import。
//
// 用法：
//   node scripts/sync-app-capability-map.mjs            # 同步并写盘
//   node scripts/sync-app-capability-map.mjs --check    # 只校验是否已同步（CI 用）
//   node scripts/sync-app-capability-map.mjs --from <path>
// ============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = "oceanleo.app-capability-map.v1";
const DEFAULT_SOURCE =
  process.env.OCEANLEO_APP_CAPABILITY_MAP ||
  "/opt/cursor-workspaces/oceandino/scripts/data/oceanleo-app-capability-map.json";
// 文件名里刻意**不用** `.generated.ts`：focused test 的扩展名 loader 会把
// `./x.generated` 当成「已经带扩展名」而不再补 `.ts`，import 直接 ERR_MODULE_NOT_FOUND。
const TARGET = resolve(REPO_ROOT, "src/shell/app-capability-map-generated.ts");

const argv = process.argv.slice(2);
const checkOnly = argv.includes("--check");
const fromIndex = argv.indexOf("--from");
const sourcePath = fromIndex >= 0 ? argv[fromIndex + 1] : DEFAULT_SOURCE;

function fail(message) {
  process.stderr.write(`sync-app-capability-map: ${message}\n`);
  process.exit(1);
}

let raw;
try {
  raw = JSON.parse(readFileSync(sourcePath, "utf8"));
} catch (error) {
  fail(`无法读取映射源 ${sourcePath} — ${error.message}`);
}

if (raw?.schema !== SCHEMA) {
  fail(`schema 不是 ${SCHEMA}（读到 ${JSON.stringify(raw?.schema)}）`);
}
if (!raw.apps || typeof raw.apps !== "object") {
  fail("映射缺少 apps 对象");
}

const FIELDS = ["family", "label", "editorCapability", "artifactType"];
const problems = [];
const appKeys = Object.keys(raw.apps).sort();
let rowCount = 0;

for (const key of appKeys) {
  if (!/^[^/]+\/[^/]+$/.test(key)) {
    problems.push(`键 ${key} 不是 <siteKey>/<appId> 形状`);
    continue;
  }
  const rows = raw.apps[key];
  if (!Array.isArray(rows) || rows.length === 0) {
    problems.push(`${key} 的值不是非空数组`);
    continue;
  }
  for (const row of rows) {
    rowCount += 1;
    for (const field of FIELDS) {
      if (typeof row?.[field] !== "string" || row[field].trim() === "") {
        problems.push(`${key} 有一行缺 ${field}`);
      }
    }
    // 红线 9：面向用户的文案里不许出现「插件」（该词已被 /plugins MCP 目录占用）。
    if (typeof row?.label === "string" && row.label.includes("插件")) {
      problems.push(`${key} 的按钮文案含「插件」：${row.label}`);
    }
  }
}

if (problems.length) {
  fail(`映射有 ${problems.length} 处问题，前 5 条：\n  ${problems.slice(0, 5).join("\n  ")}`);
}

const lines = [];
lines.push("// ============================================================================");
lines.push("// GENERATED FILE — 不要手改。");
lines.push("// 由 `node scripts/sync-app-capability-map.mjs` 从 W4 的单一事实源生成：");
lines.push(`//   ${sourcePath}`);
lines.push("// 生成器与数据源都在 oceandino 仓；本文件只是它在共享包里的发布副本。");
lines.push("// ============================================================================");
lines.push("");
lines.push('import type { AppCapabilityMap } from "./app-capability-entry";');
lines.push("");
lines.push("export const GENERATED_APP_CAPABILITY_MAP: AppCapabilityMap = {");
lines.push(`  schema: ${JSON.stringify(raw.schema)},`);
if (raw.generatedAt) lines.push(`  generatedAt: ${JSON.stringify(raw.generatedAt)},`);
if (raw.source) lines.push(`  source: ${JSON.stringify(raw.source)},`);
lines.push("  apps: {");
for (const key of appKeys) {
  lines.push(`    ${JSON.stringify(key)}: [`);
  for (const row of raw.apps[key]) {
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
    fail("生成文件与映射源不一致，请重跑 `node scripts/sync-app-capability-map.mjs`");
  }
  process.stdout.write(
    `sync-app-capability-map: 已同步（${appKeys.length} 个 app / ${rowCount} 枚按钮）\n`,
  );
  process.exit(0);
}

writeFileSync(TARGET, output, "utf8");
process.stdout.write(
  `sync-app-capability-map: 写入 ${TARGET}（${appKeys.length} 个 app / ${rowCount} 枚按钮）\n`,
);
