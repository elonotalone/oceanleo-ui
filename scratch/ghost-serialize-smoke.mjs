// Headless 验证 v15h「Tiptap/ProseMirror 原子内联节点」的 template⇄doc⇄plain 契约。
// 原子节点的**交互**（点击整块选中/一打字整块替换/整体删/中文 IME/光标跳过）是 ProseMirror
// 库层原生行为，必须在**真实浏览器**（word.oceanleo.com 或 scratch/inflow-fill-smoke.html）
// 里验；这里只验组件里那两个纯函数的**序列化契约**（数据完整性 = 提交拿到的字符串对不对）：
//   · templateToDoc(tmpl)：字面→text 节点；`[占位]`→promptSlot 原子节点（attrs.hint 去方括号）。
//   · docToPlain(doc)   ：文本节点吐字符；**未替换**的 promptSlot 吐 `[hint]` 字面；段落间 \n。
// 关键性质：未替换占位在 value 里仍是 `[hint]`（AI 侧理解占位）；用户替换后就是普通文本。
// 跑：node scratch/ghost-serialize-smoke.mjs

const TOKEN_RE = /\[[^\[\]\n]+\]/g;

// —— 复刻组件里的 templateSegments / templateToDoc / docToPlain（保持逻辑同源）——
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
const SLOT = "promptSlot";
function templateToDoc(tmpl) {
  const inline = [];
  for (const s of templateSegments(tmpl)) {
    if (s.kind === "placeholder") inline.push({ type: SLOT, attrs: { hint: s.text.slice(1, -1) } });
    else { const txt = s.text.replace(/\n/g, " "); if (txt) inline.push({ type: "text", text: txt }); }
  }
  return { type: "doc", content: [{ type: "paragraph", content: inline }] };
}
// docToPlain 的纯数据版：吃 doc JSON（模拟 PM doc.forEach），吐提交字符串。
function docToPlain(doc) {
  const blocks = doc.content || [];
  return blocks.map((block) =>
    (block.content || []).map((child) =>
      child.type === SLOT ? `[${child.attrs.hint}]` : (child.type === "text" ? child.text : "")
    ).join("")
  ).join("\n");
}

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (!eq(got, want)) { console.log(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fail++; } else console.log(`✓ ${name}`); };

const tmpl = "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。";

// (1) 模板→doc：占位变原子 promptSlot 节点，hint 去掉方括号。
const doc = templateToDoc(tmpl);
const inline = doc.content[0].content;
check("字面段 = text 节点，占位段 = promptSlot 原子节点",
  inline.map((n) => n.type),
  ["text", SLOT, "text", SLOT, "text", SLOT, "text"]);
check("promptSlot.hint 去方括号（[主题]→主题）",
  inline.filter((n) => n.type === SLOT).map((n) => n.attrs.hint),
  ["主题", "受众", "字数"]);

// (2) 未替换 → docToPlain 仍吐 [占位] 字面（提交给 AI 时保留占位语义）。
check("未替换：docToPlain === 模板原文（含 [占位]）", docToPlain(doc), tmpl);

// (3) 用户点第一个占位、打字 → 该 promptSlot 整块被替换成普通 text 节点（去括号）。
const doc2 = JSON.parse(JSON.stringify(doc));
doc2.content[0].content[1] = { type: "text", text: "新能源汽车" }; // [主题] → 文本
// 相邻文本节点合并不影响 docToPlain（拼接结果一致）
check("替换首个占位后 docToPlain 出真实内容、无该占位方括号",
  docToPlain(doc2),
  "帮我写一篇关于 新能源汽车 的文章，面向 [受众]，约 [字数] 字。");

// (4) 全删 → 空 doc → 空串。
check("空 doc → 空串", docToPlain({ type: "doc", content: [{ type: "paragraph", content: [] }] }), "");

// (5) 纯占位模板。
check("纯占位模板：doc 只含 1 个 promptSlot",
  templateToDoc("[主题]").content[0].content.map((n) => n.type), [SLOT]);
check("纯占位模板 docToPlain === [主题]", docToPlain(templateToDoc("[主题]")), "[主题]");

// (6) 多行：换行折成空格（单段落引导语契约）。
check("多行模板折成单段落（\\n→空格）",
  docToPlain(templateToDoc("第一行 [A]\n第二行 [B]")),
  "第一行 [A] 第二行 [B]");

// (7) 残缺 `[主题`（无右括号）不成占位 → 整段并进字面文本，不产原子节点。
check("残缺 [主题（无右括号）无 promptSlot",
  templateToDoc("帮我写关于 [主题 的文章").content[0].content.filter((n) => n.type === SLOT).length, 0);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
