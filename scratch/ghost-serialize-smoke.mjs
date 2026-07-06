// Headless 验证 v15g「透明 textarea + 镜像高亮层」模型的分段 + value 契约（真实光标/IME/
// 全选删除需浏览器，见 scratch/inflow-fill-smoke.html；这里只验纯逻辑）。
// 新契约（推翻此前 contentEditable 系列）：
//   · value = textarea.value = 模板原文**逐字符**（含 [占位] 的方括号）——[占位] 是普通
//     可编辑文本，不做任何剥离/替换；
//   · templateSegments(value) 把文本切成 lit / placeholder 段，镜像层据此给 placeholder
//     段套 .oc-ph 高亮（纯视觉），拼回来必须 === 原文（无损）。
// 跑：node scratch/ghost-serialize-smoke.mjs

const TOKEN_RE = /\[[^\[\]\n]+\]/g;

function templateSegments(t) {
  const out = []; let last = 0, m; TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(t))) {
    if (m.index > last) out.push({ kind: "lit", text: t.slice(last, m.index) });
    out.push({ kind: "placeholder", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ kind: "lit", text: t.slice(last) });
  return out;
}
// 镜像层把分段拼回的文本（高亮不改变字符，占位段原样含方括号）。
const renderText = (segs) => segs.map((s) => s.text).join("");

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (!eq(got, want)) { console.log(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fail++; } else console.log(`✓ ${name}`); };

const tmpl = "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。";

// (1) value 契约：模板原文逐字符进 value（含方括号），无损。
check("value = 模板原文逐字符（含 [占位]）", tmpl, "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。");

// (2) 分段：交替 lit / placeholder，占位段 = 完整 [..]（含方括号）。
const segs = templateSegments(tmpl);
check("占位段是完整 [..]（含方括号）", segs.filter((s) => s.kind === "placeholder").map((s) => s.text), ["[主题]", "[受众]", "[字数]"]);
check("分段拼回 === 原文（无损，高亮不改字符）", renderText(segs), tmpl);

// (3) 用户把 [主题] 改成真实内容 → 就是普通文本编辑，value 随之变，该处不再是占位段。
const edited = tmpl.replace("[主题]", "新能源汽车");
const segs2 = templateSegments(edited);
check("改后 value 出真实内容", edited, "帮我写一篇关于 新能源汽车 的文章，面向 [受众]，约 [字数] 字。");
check("改后该处不再高亮（占位段少一个）", segs2.filter((s) => s.kind === "placeholder").map((s) => s.text), ["[受众]", "[字数]"]);
check("改后分段拼回仍 === 当前 value", renderText(segs2), edited);

// (4) 全选删除 → value = ""（普通文本行为，无守卫拦截）。
check("全选删除后 value 为空", "", "");
check("空 value 无占位段", templateSegments("").filter((s) => s.kind === "placeholder").length, 0);

// (5) 用户删了 [主题] 的右括号 `]` → `[主题` 不再是完整 token，不高亮（就是普通文本）。
const broken = "帮我写一篇关于 [主题 的文章";
check("残缺 [主题（无右括号）不成占位段", templateSegments(broken).filter((s) => s.kind === "placeholder").length, 0);
check("残缺场景分段拼回仍无损", renderText(templateSegments(broken)), broken);

// (6) 光标进方括号内部（逻辑侧只验位置计算：第一个 [ 之后）。
const idx = tmpl.search(TOKEN_RE);
check("首个占位定位到 '[' 之后（光标进括号内部）", tmpl.slice(idx, idx + 2), "[主");

// (7) 纯占位模板 & 多行。
check("纯占位模板 value 就是 [主题]", templateSegments("[主题]").map((s) => s.text).join(""), "[主题]");
const multi = "第一行 [A]\n第二行 [B]";
check("多行含占位分段无损", renderText(templateSegments(multi)), multi);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
