// Headless 验证 v15f「单一编辑宿主」填空槽的分段 + 序列化 + 槽状态逻辑（真实光标/IME/
// 删除拦截需浏览器，见 scratch/inflow-fill-smoke.html；这里只验纯逻辑）。
// 模型：**唯一**外层 contentEditable。字面段 = 文本节点；占位段 = <span.oc-ph>（不设
// contenteditable，继承外层=true，不嵌套第二个 host），槽内 = ZWSP + 真实字符。打字/IME
// 都在这一个 host 内；标签显隐 = data-empty 属性切换（不动文本，ZWSP 常驻）。value 序列化：
// 槽取 textContent（剥 ZWSP），空槽→""。跑：node scratch/ghost-serialize-smoke.mjs

const ZWSP = "\u200b";
const stripZ = (s) => (s || "").split(ZWSP).join("");
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

// 假 DOM：lit=文本节点；ph=槽（inner = 槽内真实文本[ZWSP 已抽象掉]，empty = data-empty 有无）。
// 真实 DOM 里槽内是「ZWSP + 真实字符」的单一文本节点，这里用 inner 抽象「去 ZWSP 后的真实内容」。
function buildNodes(t) {
  return templateSegments(t).map((s) =>
    s.kind === "placeholder"
      ? { type: "ph", hint: s.text, inner: "", empty: true }
      : { type: "text", text: s.text },
  );
}

// 属性同步（模拟 syncSlotEmptiness）：只切 empty 标志，不动文本。
function syncEmpty(nodes) {
  for (const n of nodes) {
    if (n.type !== "ph") continue;
    n.empty = stripZ(n.inner) === "";
  }
}

// 序列化：文本节点原样；槽取内芯文本（去 ZWSP 防呆）；空槽→""。不变量：绝不吐 [字段] 字面。
function readValue(nodes) {
  let out = "";
  for (const n of nodes) out += n.type === "text" ? n.text : stripZ(n.inner);
  return out;
}

// 槽内输入 / 删空（模拟内芯编辑；宿主永在）。
function typeInto(ph, s) { ph.inner = s; }
function clearSlot(ph) { ph.inner = ""; }

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (!eq(got, want)) { console.log(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fail++; } else console.log(`✓ ${name}`); };

const tmpl = "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。";
let nodes = buildNodes(tmpl); syncEmpty(nodes);
const phs = () => nodes.filter((n) => n.type === "ph");

// (1) 初始：不含 [字段] 字面；空槽处贡献空串；全部空槽显示标签。
check("initial value has NO literal [占位]", /\[[^\]]+\]/.test(readValue(nodes)), false);
check("initial value = literal only (blanks empty)", readValue(nodes), "帮我写一篇关于  的文章，面向 ，约  字。");
check("all placeholders start empty (hint shown)", phs().map((p) => p.empty), [true, true, true]);
check("hints are the [字段] tokens", phs().map((p) => p.hint), ["[主题]", "[受众]", "[字数]"]);

// (2) 槽内输入（在框中输入）→ 标签消失、value 出真实内容。
typeInto(phs()[0], "新能源汽车"); syncEmpty(nodes);
check("after typing: slot0 not empty (hint hidden)", phs()[0].empty, false);
check("after typing: value shows 真实内容 not [主题]", readValue(nodes), "帮我写一篇关于 新能源汽车 的文章，面向 ，约  字。");

// (3) 部分填：其余槽仍空，不吐 [字段]。
typeInto(phs()[2], "800"); syncEmpty(nodes);
check("partial fill value", readValue(nodes), "帮我写一篇关于 新能源汽车 的文章，面向 ，约 800 字。");
check("value never contains [ ] literal", /\[[^\]]+\]/.test(readValue(nodes)), false);

// (4) 槽内删空（最后一个字也能删）→ 标签回显、槽仍在、value 该段回空。
clearSlot(phs()[0]); syncEmpty(nodes);
check("clear-to-empty allowed: slot0 empty again (hint back)", phs()[0].empty, true);
check("slot survives clearing (still 3 slots)", phs().length, 3);
check("value blank again at slot0", readValue(nodes), "帮我写一篇关于  的文章，面向 ，约 800 字。");

// (5) IME 防呆：内芯里若残留 ZWSP（历史/极端），序列化剥掉、判空正确。
typeInto(phs()[0], ZWSP + "混" + ZWSP + "入"); syncEmpty(nodes);
check("ZWSP stripped from value", readValue(nodes).includes("混入"), true);
check("ZWSP-only counts as empty", (() => { typeInto(phs()[0], ZWSP); syncEmpty(nodes); return phs()[0].empty; })(), true);

// (6) 字面可编辑。
typeInto(phs()[0], "新能源汽车"); syncEmpty(nodes);
nodes[0].text = "请帮我写一篇关于 ";
check("literal editable reflected in value", readValue(nodes).startsWith("请帮我写一篇关于 新能源汽车"), true);

// (7) 纯占位模板。
let n2 = buildNodes("[主题]"); syncEmpty(n2);
check("all-placeholder template initial value empty", readValue(n2), "");
typeInto(n2.filter((n) => n.type === "ph")[0], "夏日促销"); syncEmpty(n2);
check("all-placeholder template after fill", readValue(n2), "夏日促销");

// (8) 兜底重建回填（模拟槽被整删后 restore：按模板重建 + 按序回填非空内容）。
let n3 = buildNodes(tmpl); syncEmpty(n3);
const p3 = n3.filter((n) => n.type === "ph");
typeInto(p3[1], "大学生"); syncEmpty(n3);
const saved = p3.map((p) => stripZ(p.inner));
let rebuilt = buildNodes(tmpl);
rebuilt.filter((n) => n.type === "ph").forEach((p, i) => { if (saved[i]) p.inner = saved[i]; });
syncEmpty(rebuilt);
check("restore rebuilds slots and refills by index", readValue(rebuilt), "帮我写一篇关于  的文章，面向 大学生，约  字。");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
