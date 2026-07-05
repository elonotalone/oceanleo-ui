// Headless 验证「文本流内原地替换」填空槽的分段 + 序列化 + 规整逻辑（真实光标/删除拦截需
// 浏览器，见 scratch/inflow-fill-smoke.html；这里只验纯逻辑）。
// 模型（v15d 定版）：单个 contentEditable。字面段 = 文本节点；占位段 = 空 <span.oc-ph>，
// 内放一个 ZWSP 让空槽能落光标，data-hint 经 CSS ::before 显示蓝色 [标签]。用户光标进槽后
// 【直接在文本流里打字】，字符原地替换标签 → 槽内是真实内容（去掉 ZWSP）、加粗蓝、后文顺移。
// 清空 → 槽回到「只含 ZWSP」→ ::before 标签回显。value 序列化：槽取真实内容(去 ZWSP)，空槽→""。
// 跑：node scratch/ghost-serialize-smoke.mjs

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

// 假 DOM：lit=文本节点；ph=槽，text 是槽的 textContent（初始 = ZWSP，即空）。
function buildNodes(t) {
  return templateSegments(t).map((s) =>
    s.kind === "placeholder"
      ? { type: "ph", hint: s.text, text: ZWSP, empty: true }
      : { type: "text", text: s.text },
  );
}

// 规整（模拟组件每次 input 后做的）：槽有真实内容→去 ZWSP、empty=false；空→恰一个 ZWSP、empty=true。
function normalize(nodes) {
  for (const n of nodes) {
    if (n.type !== "ph") continue;
    const real = stripZ(n.text);
    if (real === "") { n.text = ZWSP; n.empty = true; }
    else { n.text = real; n.empty = false; }
  }
}

// 序列化：文本节点 & 槽都取真实内容(去 ZWSP)；空槽→""。关键不变量：绝不吐 [字段] 字面。
function readValue(nodes) {
  let out = "";
  for (const n of nodes) out += stripZ(n.text);
  return out;
}

// 模拟用户在槽里打字（把字符接在 ZWSP 后，真实浏览器里字符插在光标处）/ 清空。
function typeInto(ph, s) { ph.text = ZWSP + s; }
function clearSlot(ph) { ph.text = ""; }

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => { if (!eq(got, want)) { console.log(`✗ ${name}\n   got : ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); fail++; } else console.log(`✓ ${name}`); };

const tmpl = "帮我写一篇关于 [主题] 的文章，面向 [受众]，约 [字数] 字。";
let nodes = buildNodes(tmpl); normalize(nodes);
const phs = () => nodes.filter((n) => n.type === "ph");

// (1) 初始：不含 [字段] 字面；空槽处贡献空串。
check("initial value has NO literal [占位]", /\[[^\]]+\]/.test(readValue(nodes)), false);
check("initial value = literal only (blanks empty)", readValue(nodes), "帮我写一篇关于  的文章，面向 ，约  字。");
check("all placeholders start empty (show ::before hint)", phs().map((p) => p.empty), [true, true, true]);
check("hints are the [字段] tokens", phs().map((p) => p.hint), ["[主题]", "[受众]", "[字数]"]);

// (2) 往 [主题] 槽里【在框中打字】"新能源汽车" → 原地替换标签、去 ZWSP、value 出真实内容。
typeInto(phs()[0], "新能源汽车"); normalize(nodes);
check("after typing: slot0 not empty (hint hidden)", phs()[0].empty, false);
check("after typing: slot0 has clean real text (no ZWSP)", phs()[0].text, "新能源汽车");
check("after typing: value shows 真实内容 not [主题]", readValue(nodes), "帮我写一篇关于 新能源汽车 的文章，面向 ，约  字。");

// (3) 只填部分：其余槽仍空，不吐 [字段]。
typeInto(phs()[2], "800"); normalize(nodes);
check("partial fill value", readValue(nodes), "帮我写一篇关于 新能源汽车 的文章，面向 ，约 800 字。");
check("value never contains [ ] literal", /\[[^\]]+\]/.test(readValue(nodes)), false);

// (4) 清空 [主题] → 标签回显（回到只含 ZWSP、empty=true），value 该段回空。
clearSlot(phs()[0]); normalize(nodes);
check("clear refills hint: slot0 empty again", phs()[0].empty, true);
check("clear refills hint: slot0 back to single ZWSP", phs()[0].text, ZWSP);
check("clear refills hint: value blank again at slot0", readValue(nodes), "帮我写一篇关于  的文章，面向 ，约 800 字。");

// (5) 字面文字可编辑。
nodes[0].text = "请帮我写一篇关于 ";
check("literal editable reflected in value", readValue(nodes).startsWith("请帮我写一篇关于 "), true);

// (6) 纯占位模板也不吐 [字段]。
let n2 = buildNodes("[主题]"); normalize(n2);
check("all-placeholder template initial value empty", readValue(n2), "");
typeInto(n2.filter((n) => n.type === "ph")[0], "夏日促销"); normalize(n2);
check("all-placeholder template after fill", readValue(n2), "夏日促销");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
