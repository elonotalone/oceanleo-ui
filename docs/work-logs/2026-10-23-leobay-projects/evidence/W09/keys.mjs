// W09 证据脚本：列出源文件里所有 tt("字面量") 的中文原文，并查它们在 16 语里的译文状态。
// 用法：cd /root/projects/oceanleo-ui && node --experimental-strip-types docs/work-logs/2026-10-23-leobay-projects/evidence/W09/keys.mjs src/shell/messages/cases/*.ts src/shell/messages/cases/*.tsx src/shell/bay/seller/seller-ui.tsx
// 列出若干源文件里所有 tt("字面量") 的中文原文，并查它们在 16 语里的译文状态。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { register } from "node:module";
register("file:///root/projects/oceanleo-ui/tests/ts-extension-loader.mjs", import.meta.url);
const require = createRequire("file:///root/projects/oceanleo-ui/package.json");
const ts = require("typescript");
const { LOCALES } = await import("file:///root/projects/oceanleo-ui/src/i18n/config.ts");
const { UI_MESSAGES } = await import("file:///root/projects/oceanleo-ui/src/i18n/ui/messages/index.ts");
const files = process.argv.slice(2);
const keys = new Map();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "tt" && node.arguments.length) {
      const a = node.arguments[0];
      if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) {
        if (/[一-鿿]/.test(a.text)) { if (!keys.has(a.text)) keys.set(a.text, new Set()); keys.get(a.text).add(file.split("/").pop()); }
      } else console.log("DYNAMIC", file, node.getText(sf).slice(0, 80));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
const locales = LOCALES.filter((l) => l !== "zh");
let nNew = 0, nPart = 0, nOk = 0;
for (const [key, where] of keys) {
  const missing = locales.filter((l) => !UI_MESSAGES[l][key]);
  const tag = missing.length === 0 ? "OK  " : missing.length === locales.length ? "NEW " : "PART";
  if (tag === "OK  ") nOk++; else if (tag === "NEW ") nNew++; else nPart++;
  if (tag !== "OK  ") console.log(tag, JSON.stringify(key), missing.length === locales.length ? "" : `缺 ${missing.join(",")}`);
}
console.log(`-- 共 ${keys.size} 条：已有 ${nOk}，全新 ${nNew}，部分 ${nPart}`);
