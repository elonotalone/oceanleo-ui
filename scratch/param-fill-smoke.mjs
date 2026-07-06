// Smoke: 宗旨 v15 修复验证 —— 「点导航卡 → 左侧操作台所有参数都对应」的核心合并逻辑。
// 纯 JS 建模，不依赖 React/DOM。跑：node scratch/param-fill-smoke.mjs
// -----------------------------------------------------------------------------
// 被验证的两条不变量：
//  (1) 每张导航卡（含未显式写 set 的）点击后，都会把【该成品的全套默认参数】灌进操作台
//      —— 即 example.set 缺省时继承 app.preset.set；example 显式给的 key 覆盖 app 默认。
//  (2) 主字段 primaryField 永远随卡片文案更新；参数键随合并后的 set 更新。
// 这对应 SiteCatalogConsole 里将新增的 mergeExampleSet + FunctionAgentChat.fillFromGuide。

// ---- 被测纯函数（与将要写进 @oceanleo/ui 的实现保持一致）----

/** 把 app 的默认 preset.set 补进一个导航示例：example 未指定的 key 用 app 默认填上。 */
function mergeExampleSet(example, appPresetSet) {
  const base = appPresetSet || {};
  const own = example.set || {};
  const merged = { ...base, ...own };
  return Object.keys(merged).length ? { ...example, set: merged } : example;
}

/** 模拟 fillFromGuide 的 patch 构造：主字段填文案 + 合并后的 set 一起 patch。 */
function buildPatch(primaryField, example) {
  return { set: { [primaryField]: example.prompt, ...(example.set || {}) } };
}

/** 模拟站点 onApplyPatch 把 patch.set 映射进操作台 state（word: topic/style/words）。 */
function applyPatchToOps(prevOps, patch) {
  const s = patch.set || {};
  const next = { ...prevOps };
  if (typeof s.topic === "string") { next.topic = ""; next.topicTemplate = s.topic; }
  if (typeof s.style === "string") next.style = s.style;
  if (typeof s.words === "number") next.words = s.words;
  return next;
}

// ---- 测试夹具：word「文献综述」成品 ----
const litReviewApp = {
  id: "lit-review",
  preset: { prompt: "帮我写一篇关于「[研究领域]」的文献综述。", set: { style: "议论文", words: 4000 } },
};

// 三张导航卡：两张只有文案（老写法，无 set），一张显式覆盖 style/words（新写法）。
const examples = [
  { label: "主题式综述", prompt: "写一篇 [领域] 文献综述，按研究主题分类梳理各派观点与进展" },
  { label: "时间线综述", prompt: "写一篇 [领域] 文献综述，按时间脉络梳理研究方法的演进" },
  { label: "批判性综述", prompt: "写一篇批判性 [领域] 文献综述，对各观点作评述并指出不足", set: { style: "评论", words: 5000 } },
];

let fail = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(name, got, want) {
  if (!eq(got, want)) { console.log(`✗ ${name}\n    got : ${JSON.stringify(got)}\n    want: ${JSON.stringify(want)}`); fail++; }
  else console.log(`✓ ${name}`);
}

// 不变量 (1)：未写 set 的卡片继承 app 默认 → 点它也会灌 style/words。
const m0 = mergeExampleSet(examples[0], litReviewApp.preset.set);
check("card0 inherits app default set", m0.set, { style: "议论文", words: 4000 });

// 不变量 (2)：显式 set 覆盖 app 默认（style/words 都被卡片改写）。
const m2 = mergeExampleSet(examples[2], litReviewApp.preset.set);
check("card2 override wins over app default", m2.set, { style: "评论", words: 5000 });

// 端到端：从「进入即空」的操作台，点每张卡，验证 topic + style + words 全部对应变化。
const emptyOps = { topic: "", topicTemplate: null, style: "议论文", words: 4000 };

// 先把操作台改成一个与卡片不同的脏状态，确认点卡片会把参数「拉回/改到」卡片对应值。
let ops = { topic: "旧主题", topicTemplate: null, style: "演讲稿", words: 800 };

// 点 card0（无 set，继承 app 默认 议论文/4000）
ops = applyPatchToOps(ops, buildPatch("topic", mergeExampleSet(examples[0], litReviewApp.preset.set)));
check("click card0 → style back to 议论文", ops.style, "议论文");
check("click card0 → words back to 4000", ops.words, 4000);
check("click card0 → topicTemplate set to card0 prompt", ops.topicTemplate, examples[0].prompt);
check("click card0 → topic value cleared (template-fill re-seeds)", ops.topic, "");

// 点 card2（覆盖 评论/5000）—— 参数必须跟着卡片变（这正是用户说“没变”的地方）
ops = applyPatchToOps(ops, buildPatch("topic", mergeExampleSet(examples[2], litReviewApp.preset.set)));
check("click card2 → style changes to 评论", ops.style, "评论");
check("click card2 → words changes to 5000", ops.words, 5000);
check("click card2 → topicTemplate updates to card2 prompt", ops.topicTemplate, examples[2].prompt);

// 回点 card1（无 set，继承 议论文/4000）—— 从 card2 的 评论/5000 必须变回
ops = applyPatchToOps(ops, buildPatch("topic", mergeExampleSet(examples[1], litReviewApp.preset.set)));
check("click card1 → style back to 议论文 (differs from card2)", ops.style, "议论文");
check("click card1 → words back to 4000 (differs from card2)", ops.words, 4000);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
