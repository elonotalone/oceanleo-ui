// W09 证据脚本：源文件里 className 的 Tailwind 类名在编译产物 src/theme/ui.css 里有没有（缺的 = 站上不会生效，要父 agent 重编）。
// 用法：cd /root/projects/oceanleo-ui && node docs/work-logs/2026-10-23-leobay-projects/evidence/W09/classes.mjs src/shell/messages/cases/*.tsx src/shell/bay/seller/seller-ui.tsx
// 注意：CaseCard 里 DOT_CLASS 表的键（bad/warn/ok/neutral）会被误报成「没找到」，忽略。
// 列出源文件里 className 字符串字面量里的 Tailwind 类名，并查它们在编译产物 ui.css 里有没有。
import { readFileSync } from "node:fs";
const css = readFileSync("/root/projects/oceanleo-ui/src/theme/ui.css", "utf8");
const esc = (c) => c.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
const files = process.argv.slice(2);
const missing = new Map();
const present = new Set();
for (const file of files) {
  const src = readFileSync(file, "utf8");
  // className="..." 与 const X = "..." 里的长串（含模板字面量里的静态片段）
  const strings = [...src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})|(?:CLASS|_OK|_BAD)\s*=\s*\n?\s*"([^"]*)"|DOT_CLASS[^{]*\{([^}]*)\}/gs)];
  for (const m of strings) {
    const body = (m[1] || m[2] || m[3] || m[4] || "").replace(/\$\{[^}]*\}/g, " ").replace(/"[a-z]+:\s*"/g, " ");
    for (const tok of body.split(/\s+/)) {
      const t = tok.replace(/^"|"[,]?$/g, "").replace(/^[a-z]+:\s*"?/, (x) => x);
      if (!t || /[{}=<>(),;]/.test(t) && !t.startsWith("[") && !/^[a-z-]+:[a-z]/.test(t) && !/\[/.test(t)) continue;
      if (!/^[!a-z0-9\[\]:/_.\-%#]+$/i.test(t)) continue;
      const sel = "." + esc(t);
      if (css.includes(sel)) present.add(t);
      else { if (!missing.has(t)) missing.set(t, new Set()); missing.get(t).add(file.split("/").pop()); }
    }
  }
}
console.log(`已有 ${present.size} 个类；ui.css 里没找到 ${missing.size} 个：`);
for (const [t, f] of missing) console.log("  ", t, "←", [...f].join(","));
