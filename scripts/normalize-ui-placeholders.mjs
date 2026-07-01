#!/usr/bin/env node
// 把 UI 词典里所有带 JS 模板 `${...}` 的片段（key 与 value 内均可能出现，含各语言
// 译文里保留的占位符）规范化成 `{var}` 占位，与组件里 tt("…{var}…", { var }) 的
// 调用约定一致。用正则整体替换，覆盖裸变量 / 带属性访问 / 带 || 默认值 等所有形态。
//
// 用法：node scripts/normalize-ui-placeholders.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "src/i18n/ui/messages",
);

// 把一个 `${...}` 内部表达式映射到稳定的占位名。
// 规则：删除确认里的 pending(.Delete).title 统一 → title；否则取表达式里第一个标识
// 段的「最后一节」（f.name→name, f.label→label, schema.title→title, kindLabel→kind,
// capabilities→capabilities, name→name）。kindLabel 特判成 kind（与组件调用一致）。
function placeholderName(expr) {
  const e = expr.trim();
  if (/title/.test(e)) return "title"; // pending.title / pendingDelete.title / schema.title
  if (/kindLabel/.test(e)) return "kind";
  // 取 `a.b.c` 的最后一节，去掉 ` || ...` 等尾巴
  const head = e.split(/[|?&\s]/)[0];
  const last = head.split(".").pop() || head;
  return last.replace(/[^A-Za-z0-9_]/g, "") || "x";
}

// 匹配 `${ ... }`，内部允许出现被转义的双引号 \" 与普通字符（非贪婪到第一个 }）。
// 词典里 ${...} 最复杂的是 `${pending.title || \"未命名任务\"}`，其中的 } 不会提前出现。
const RE = /\$\{([^}]*)\}/g;

let touched = 0;
for (const file of fs.readdirSync(DIR)) {
  if (!file.endsWith(".ts") || file === "index.ts") continue;
  const fp = path.join(DIR, file);
  const orig = fs.readFileSync(fp, "utf8");
  const next = orig.replace(RE, (_m, expr) => `{${placeholderName(expr)}}`);
  if (next !== orig) {
    fs.writeFileSync(fp, next);
    touched++;
    console.log("normalized", file);
  }
}
console.log("done, files touched:", touched);
