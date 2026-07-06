// Headless 验证 v15i「Tiptap/ProseMirror 高亮 Mark」的 template⇄内容⇄plain 契约。
// 荧光块的**交互**（点选整段/输入替换/删块/全选删/undo/中文 IME/未填→已填翻色）是 ProseMirror
// 库层行为，必须在**真实浏览器**（word.oceanleo.com 或 scratch/inflow-fill-smoke.html）验；
// 这里只验组件里两个纯函数的**序列化契约**（= 提交拿到的字符串对不对）：
//   · templatePieces(tmpl)：字面→text；`[占位]`→slot(hint)（提示文字=hint，不含方括号）。
//   · docToPlain(doc)     ：文本节点吐字符；带 promptSlot mark 且 empty 的 run 吐 `[hint]`；
//                           已填(empty=false)的 slot run 吐真实文本；段落间 \n。
// 跑：node scratch/ghost-serialize-smoke.mjs

const TOKEN_RE = /\[[^\[\]\n]+\]/g;
const SLOT = "promptSlot";

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
// 模板 → 内容片段（text / slot），slot 提示文字 = hint（不含方括号）。
function templatePieces(tmpl) {
  const pieces = [];
  for (const s of templateSegments(tmpl)) {
    if (s.kind === "placeholder") pieces.push({ kind: "slot", hint: s.text.slice(1, -1) });
    else { const txt = s.text.replace(/\n/g, " "); if (txt) pieces.push({ kind: "text", text: txt }); }
  }
  return pieces;
}
// 把片段转成「doc JSON」：slot → 带 promptSlot mark 的 text（empty 由是否==hint 定；这里灌模板时 empty=true）。
function piecesToDoc(pieces) {
  const inline = pieces.map((p) =>
    p.kind === "slot"
      ? { type: "text", text: p.hint, marks: [{ type: SLOT, attrs: { hint: p.hint, empty: true } }] }
      : { type: "text", text: p.text });
  return { type: "doc", content: [{ type: "paragraph", content: inline }] };
}
// docToPlain 的纯数据版（模拟组件里遍历 block/child + pendingEmptyHint 逻辑）。
function docToPlain(doc) {
  return (doc.content || []).map((block) => {
    let out = ""; let pend = null;
    for (const child of block.content || []) {
      if (child.type !== "text") { if (pend != null) { out += `[${pend}]`; pend = null; } continue; }
      const slot = (child.marks || []).find((mk) => mk.type === SLOT);
      if (slot && slot.attrs.empty) {
        const hint = slot.attrs.hint || "";
        if (pend != null && pend !== hint) out += `[${pend}]`;
        pend = hint;
      } else {
        if (pend != null) { out += `[${pend}]`; pend = null; }
        out += child.text || "";
      }
    }
    if (pend != null) out += `[${pend}]`;
    return out;
  }).join("\n");
}

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (!eq(got, want)) { console.log(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fail++; } else console.log(`✓ ${name}`); };

const tmpl = "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。";
const pieces = templatePieces(tmpl);
const doc = piecesToDoc(pieces);

// (1) 模板→片段：占位提示文字 = hint（不含方括号）。
check("占位片段的提示文字 = hint（无方括号）",
  pieces.filter((p) => p.kind === "slot").map((p) => p.hint), ["主题", "受众", "字数"]);

// (2) 未填（empty=true）→ docToPlain 吐 [占位] 字面（== 模板原文）。
check("未填：docToPlain === 模板原文（含 [占位]）", docToPlain(doc), tmpl);

// (3) 用户点第一个占位、打字替换 → 该 run 文本变、empty 翻 false（模拟 appendTransaction 结果）。
const doc2 = JSON.parse(JSON.stringify(doc));
const slot0 = doc2.content[0].content[1]; // [主题] 对应的 text 节点
slot0.text = "新能源汽车"; slot0.marks[0].attrs.empty = false; // 已填·深蓝荧光·带 mark
check("已填 slot（empty=false）吐真实文本、无方括号",
  docToPlain(doc2),
  "帮我写一篇关于 新能源汽车 的文章，面向 [受众]，约 [字数] 字。");

// (4) 全删 → 空 doc → 空串。
check("空 doc → 空串", docToPlain({ type: "doc", content: [{ type: "paragraph", content: [] }] }), "");

// (5) 纯占位模板。
check("纯占位模板 docToPlain === [主题]", docToPlain(piecesToDoc(templatePieces("[主题]"))), "[主题]");

// (6) 多行折成单段落（\n→空格）。
check("多行折成单段落（\\n→空格）",
  docToPlain(piecesToDoc(templatePieces("第一行 [A]\n第二行 [B]"))),
  "第一行 [A] 第二行 [B]");

// (7) 已填内容恰好被删空 → 该 text 节点消失（mark 无附着物）→ 就是普通空，不吐方括号。
const doc3 = { type: "doc", content: [{ type: "paragraph", content: [
  { type: "text", text: "写关于 " },
  // 用户把占位删空了：这段 run 不存在
  { type: "text", text: " 的文章" },
] }] };
check("占位被删空后不吐方括号", docToPlain(doc3), "写关于  的文章");

// (8) 混排：字面 + 已填 + 未填 交替。
const doc4 = { type: "doc", content: [{ type: "paragraph", content: [
  { type: "text", text: "把 " },
  { type: "text", text: "英文", marks: [{ type: SLOT, attrs: { hint: "目标语言", empty: false } }] },
  { type: "text", text: " 翻成 " },
  { type: "text", text: "原文", marks: [{ type: SLOT, attrs: { hint: "原文", empty: true } }] },
] }] };
check("混排：已填吐内容、未填吐 [hint]", docToPlain(doc4), "把 英文 翻成 [原文]");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
