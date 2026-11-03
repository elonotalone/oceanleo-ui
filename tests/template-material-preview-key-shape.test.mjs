// W12 — 素材 key 的**形状**只许有一种：裸 key（合同 §9.35 / §9.37）。
//
// `TemplateMaterial.previewUrl` 与 `GoalApp.capabilityImage` 都是 `string`，所以
// typecheck 与既有用例对「写的是哪一种形状」完全没有意见。历史上出现过三种：
//
//   裸 key（唯一正确）  `tpl-material/image-poster-1`
//   带扩展名            `tpl-material/image-poster-1.webp`
//   带前缀带扩展名      `assets/image/tpl-material/image-poster-1.webp`
//
// 三者都能通过编译、都能塞进 `<img src>`。旧拼链曾把后两种变成双扩展名或双前缀。
// W2-C2 的统一交付层保留完整对象路径，不再制造这些 404；目录仍统一用裸 key。
// W11 修的是后端那一侧（`b1022a1`），本文件守的是**这个包里写下的每一处取值**。
//
// 判据独立验证目录 key 的形状，再检查真实交付 URL，避免交付层兼容掩盖目录回归。
import assert from "node:assert/strict";
import { ASSET_CDN_ENABLED, PUBLIC_ASSET_ORIGIN } from "../src/lib/asset-delivery.ts";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { APP_COVER_CATEGORY } from "../src/lib/app-cover.ts";
import {
  APP_CAPABILITY_IMAGE_CATEGORY,
  capabilityImagePreviewSrc,
  capabilityImageThumbSrc,
} from "../src/lib/app-capability-image.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const OSS = `${ASSET_CDN_ENABLED ? "https://assets.oceanleo.com" : PUBLIC_ASSET_ORIGIN}/assets/image`;

// ── 判据：把取值喂进拼链函数，看产出的**值** ────────────────────────────────

/**
 * 一条取值经拼链后的毛病清单；空数组 = 形状正确。
 * 目录 key 形状和交付 URL 分开检查；兼容旧地址不放宽目录数据契约。
 */
function chainedLinkProblems(rawKey) {
  const problems = [];
  // The delivery resolver accepts object paths; catalogs still store short keys.
  if (!/^https?:\/\//i.test(rawKey)) {
    if (rawKey.startsWith("assets/image/")) problems.push("目录 key 带 assets/image/ 前缀");
    if (/\.webp$/i.test(rawKey)) problems.push("目录 key 带 .webp 扩展名");
  }
  for (const [label, url, tail] of [
    ["缩略图", capabilityImageThumbSrc(rawKey), ".thumb.webp"],
    ["大图", capabilityImagePreviewSrc(rawKey), ".webp"],
  ]) {
    // 用前瞻数，否则 `…/assets/image/assets/image/…` 里两段前缀共用一个 `/`，会只数到 1。
    const prefixes = (url.match(/\/(?=assets\/image\/)/g) || []).length;
    const extensions = (url.match(/\.webp/g) || []).length;
    if (prefixes !== 1) {
      problems.push(`${label}出现 ${prefixes} 次 assets/image/ 前缀：${url}`);
    }
    if (extensions !== 1) {
      problems.push(`${label}出现 ${extensions} 次 .webp 扩展名：${url}`);
    }
    if (!url.startsWith(`${OSS}/`) || !url.endsWith(tail)) {
      problems.push(`${label}不是一条 OSS ${tail} 直链：${url}`);
    }
  }
  return problems;
}

test("目录用裸 key；交付层也安全接受完整对象路径", () => {
  const key = "tpl-material/image-poster-1";
  assert.equal(capabilityImageThumbSrc(key), `${OSS}/${key}.thumb.webp`);
  assert.equal(capabilityImagePreviewSrc(key), `${OSS}/${key}.webp`);
  assert.deepEqual(chainedLinkProblems(key), []);

  // 坏形状①：裸目录 + 带扩展名（W11 在 workspace-template-deeplink 的 fixture 里留下的那条）。
  assert.equal(
    capabilityImageThumbSrc("tpl-material/image-poster-1.webp"),
    `${OSS}/tpl-material/image-poster-1.webp`,
  );
  // 坏形状②：带前缀 + 带扩展名（后端 list/detail 曾经的返回值）。
  assert.equal(
    capabilityImageThumbSrc("assets/image/tpl-material/image-poster-1.webp"),
    `${OSS}/tpl-material/image-poster-1.webp`,
  );
});

test("判据本身认得出这两种坏形状（不然全仓扫描只是空转）", () => {
  const withExtension = chainedLinkProblems("tpl-material/image-poster-1.webp");
  assert.ok(withExtension.length > 0, "带扩展名的取值必须被判为坏形状");
  assert.ok(withExtension.some((line) => line.includes("扩展名")));

  const withPrefix = chainedLinkProblems("assets/image/tpl-material/image-poster-1.webp");
  assert.ok(withPrefix.some((line) => line.includes("前缀")));
  assert.ok(withPrefix.some((line) => line.includes("扩展名")));

  // 完整 http(s) 直链是允许的第二种取值，拼链层原样透传，不得被扫描误判。
  assert.deepEqual(chainedLinkProblems(`${OSS}/tpl-material/image-poster-1.thumb.webp`), []);
});

// ── 全仓扫描：每一处写下的取值都过一遍判据 ──────────────────────────────────

/** OSS 分类前缀。两个有导出常量的就用常量，避免这里抄第二份。 */
const CATEGORIES = [
  "tpl-material",
  APP_CAPABILITY_IMAGE_CATEGORY,
  APP_COVER_CATEGORY,
  "design-scene",
  "design-deco",
];

/**
 * 形如 `<category>/<slug>` 的取值。前面紧挨着 `/` 或 `…` 的不算——那是**已经拼好的
 * URL**（`…/assets/image/cap-app/x.thumb.webp`），本来就该带前缀带扩展名。
 */
const KEY_LITERAL = new RegExp(
  String.raw`(?<![\w./\-…])((?:assets/image/)?(?:${CATEGORIES.join("|")})/[^\s"'\`)\]},]+)`,
  "g",
);

/** 直接写在 `previewUrl:` / `capabilityImage:` 上的取值（分类前缀之外的形状也要抓）。 */
const FIELD_LITERAL = /\b(previewUrl|capabilityImage)\s*[:=]\s*"([^"]*)"/g;

/**
 * 刻意写下坏形状的地方：讲这条缺陷本身的用例与注释。**按值逐条豁免，不豁免整个文件**，
 * 所以这两份文件里再混进第三条坏取值一样会被抓到。
 */
const DOCUMENTED_BAD_SHAPES = new Map([
  [
    "tests/template-material-preview-key-cross-source.test.mjs",
    ["assets/image/tpl-material/image-poster-1.webp"],
  ],
  [
    "tests/template-material-preview-key-shape.test.mjs",
    [
      "tpl-material/image-poster-1.webp",
      "assets/image/tpl-material/image-poster-1.webp",
      "tpl-material/../../secret",
    ],
  ],
  [
    "tests/material-library-template-materials.test.mjs",
    ["tpl-material/../../secret", "a:b/c", "../../etc/passwd", "javascript:alert(1)"],
  ],
]);

// `src/theme/ui.css` / `globals.css` 是 `build:css` 的生成产物，不在扫描面上（也没有 key）。
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".json", ".md"];
const SKIPPED_DIRS = new Set(["node_modules", ".git"]);

function scannedFiles(dir = "") {
  const out = [];
  for (const entry of readdirSync(`${REPO_ROOT}${dir}`, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const rel = `${dir}${entry.name}`;
    if (entry.isDirectory()) out.push(...scannedFiles(`${rel}/`));
    else if (SCANNED_EXTENSIONS.some((ext) => rel.endsWith(ext))) out.push(rel);
  }
  return out.sort();
}

/** 一个文件里写下的所有素材取值：`[{ value, line }]`。 */
function keyLiteralsIn(source) {
  const found = new Map();
  const remember = (value, index) => {
    if (!found.has(value)) {
      found.set(value, source.slice(0, index).split("\n").length);
    }
  };
  for (const match of source.matchAll(KEY_LITERAL)) {
    // Bay's cover field stores a complete object key, not a catalog preview key.
    if (match[1].startsWith("assets/") && /\bcover:\s*["']$/.test(source.slice(0, match.index))) continue;
    remember(match[1], match.index);
  }
  for (const match of source.matchAll(FIELD_LITERAL)) {
    const value = match[2].trim();
    // 空取值（无图）与完整 http(s) 直链都是合法的第二种写法。
    if (!value || /^https?:\/\//i.test(value)) continue;
    // Attachment previews also use this field; blob/data URLs are not catalog keys.
    if (match[1] === "previewUrl" && /^(?:blob|data):/i.test(value)) continue;
    remember(value, match.index);
  }
  return [...found].map(([value, line]) => ({ value, line }));
}

test("扫描区分目录 key、Bay 对象路径和附件预览，目录坏值仍被捕获", () => {
  const literals = keyLiteralsIn([
    'cover: "assets/image/tpl-material/image-poster-1.webp"',
    'previewUrl: "blob:https://example.test/a"',
    'previewUrl: "assets/image/tpl-material/image-poster-1.webp"',
    'capabilityImage: "tpl-material/image-poster-1.webp"',
  ].join("\n"));
  assert.deepEqual(literals.map(({ value }) => value).sort(), [
    "assets/image/tpl-material/image-poster-1.webp", "tpl-material/image-poster-1.webp",
  ]);
  assert.equal(literals.find(({ value }) => value.startsWith("assets/")).line, 3);
  for (const { value } of literals) assert.ok(chainedLinkProblems(value).length > 0);
});

const scanned = scannedFiles().map((file) => ({
  file,
  literals: keyLiteralsIn(readFileSync(`${REPO_ROOT}${file}`, "utf8")),
}));

test("全仓每一处素材取值都是裸 key（fixture / 示例 / 文档 / 默认值一视同仁）", () => {
  const offenders = [];
  for (const { file, literals } of scanned) {
    const allowed = DOCUMENTED_BAD_SHAPES.get(file) || [];
    for (const { value, line } of literals) {
      if (allowed.includes(value)) continue;
      const problems = chainedLinkProblems(value);
      if (problems.length > 0) {
        offenders.push(`${file}:${line} 取值 ${JSON.stringify(value)} → ${problems[0]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `非裸 key 取值：\n${offenders.join("\n")}`);
});

test("扫描确实读到了东西，且豁免条目没有过期", () => {
  const total = scanned.reduce((sum, { literals }) => sum + literals.length, 0);
  assert.ok(total >= 20, `只扫到 ${total} 条取值，扫描范围多半坏了`);
  assert.ok(
    scanned.some(({ file }) => file === "src/shell/app-catalog.ts"),
    "没扫到 app-catalog.ts —— 字段契约注释正是坏形状最容易复活的地方",
  );

  for (const [file, values] of DOCUMENTED_BAD_SHAPES) {
    const literals = scanned.find((entry) => entry.file === file)?.literals || [];
    for (const value of values) {
      assert.ok(
        literals.some((literal) => literal.value === value),
        `${file} 里已经没有 ${value} 了，请删掉这条豁免而不是留着`,
      );
      assert.ok(chainedLinkProblems(value).length > 0, `${value} 不是坏形状，不该被豁免`);
    }
  }
});

test("拼链只有一处实现：app-capability-image 转交 asset-thumb，不自己拼 OSS 前缀", () => {
  // 判据挂在 `capabilityImageThumbSrc` 上。若哪天它自己拼一遍 URL，上面几条断言就不再
  // 代表站点真实渲染出来的链接了。
  const source = readFileSync(`${REPO_ROOT}src/lib/app-capability-image.ts`, "utf8");
  assert.match(source, /import \{ assetPreviewUrl, assetThumbUrl \} from "\.\/asset-thumb";/);
  assert.match(source, /export function capabilityImageThumbSrc[\s\S]*?return assetThumbUrl\(/);
  assert.doesNotMatch(source, /oss-cn-guangzhou/);
  assert.doesNotMatch(source, /\$\{[^}]+\}\.(thumb\.)?webp/);
});
