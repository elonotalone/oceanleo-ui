// 真实库里 6 条案件 → 真后端 public_view → 共享 UI 的 normalizeCases / 规则 / 名字。只读，不写任何东西。
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("file:///root/projects/oceanleo-ui/tests/ts-extension-loader.mjs", import.meta.url);
const model = await import("file:///root/projects/oceanleo-ui/src/lib/moderation/case-model.ts");
const labels = await import("file:///root/projects/oceanleo-ui/src/shell/messages/cases/case-labels.ts");
const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);
const body = JSON.parse(readFileSync("" + (process.env.OUT || "/tmp/w09") + "/real-views.json", "utf8"));
const cases = model.normalizeCases(body);
console.log(`服务端 ${body.cases.length} 条，解析出 ${cases.length} 条`);
for (const row of cases) {
  const meta = [labels.kindLabel(tt, row.target_kind), labels.sourceLabel(tt, row.source), model.formatCaseTime(row.created_at, "zh")].filter(Boolean).join(" · ");
  console.log(`- ${meta} | ${row.title || "未命名内容"} | ${labels.statusLabel(tt, row)} | 原因=${JSON.stringify(labels.reasonLabel(tt, row.reason))} | 反通知=${model.canCounterNotice(row)} 申诉=${model.canAppeal(row)} | ${labels.statusNote(tt, row, "zh")}`);
}
