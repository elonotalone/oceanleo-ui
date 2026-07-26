// W12 — 素材 key 的**形状**只许有一种：裸 key（合同 §9.35 / §9.37）。
//
// `TemplateMaterial.previewUrl` 与 `GoalApp.capabilityImage` 都是 `string`，所以
// typecheck 与既有用例对「写的是哪一种形状」完全没有意见。历史上出现过三种：
//
//   裸 key（唯一正确）  `tpl-material/image-poster-1`
//   带扩展名            `tpl-material/image-poster-1.webp`
//   带前缀带扩展名      `assets/image/tpl-material/image-poster-1.webp`
//
// 三者都能通过编译、都能塞进 `<img src>`，但经同一个拼链函数
// （`src/lib/app-capability-image.ts`，全仓唯一实现）之后：第一种 200，后两种分别拼出
// `.webp.thumb.webp` 与 `assets/image/assets/image/….webp.thumb.webp`，都是 404。
// W11 修的是后端那一侧（`b1022a1`），本文件守的是**这个包里写下的每一处取值**。
//
// 判据只比对**值**：把取值真的喂进拼链函数，数产出 URL 里 `assets/image/` 前缀与
// `.webp` 扩展名各出现几次。比对类型是抓不到的，这正是它当初漏掉的原因。
import assert from "node:assert/strict";
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
const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image";

// ── 判据：把取值喂进拼链函数，看产出的**值** ────────────────────────────────

/**
 * 一条取值经拼链后的毛病清单；空数组 = 形状正确。
 * 只看拼出来的 URL 长什么样，不看取值本身像不像 key——因为「像不像」正是人眼漏掉的那步。
 */
function chainedLinkProblems(rawKey) {
  const problems = [];
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

test("裸 key 是唯一能拼出可用直链的形状——三种取值按值钉死", () => {
  const key = "tpl-material/image-poster-1";
  assert.equal(capabilityImageThumbSrc(key), `${OSS}/${key}.thumb.webp`);
  assert.equal(capabilityImagePreviewSrc(key), `${OSS}/${key}.webp`);
  assert.deepEqual(chainedLinkProblems(key), []);

  // 坏形状①：裸目录 + 带扩展名（W11 在 workspace-template-deeplink 的 fixture 里留下的那条）。
  assert.equal(
    capabilityImageThumbSrc("tpl-material/image-poster-1.webp"),
    `${OSS}/tpl-material/image-poster-1.webp.thumb.webp`,
  );
  // 坏形状②：带前缀 + 带扩展名（后端 list/detail 曾经的返回值）。
  assert.equal(
    capabilityImageThumbSrc("assets/image/tpl-material/image-poster-1.webp"),
    `${OSS}/assets/image/tpl-material/image-poster-1.webp.thumb.webp`,
  );
});

test("判据本身认得出这两种坏形状（不然全仓扫描只是空转）", () => {
  const withExtension = chainedLinkProblems("tpl-material/image-poster-1.webp");
  assert.ok(withExtension.length > 0, "带扩展名的取值必须被判为坏形状");
  assert.ok(withExtension.some((line) => line.includes("2 次 .webp")));

  const withPrefix = chainedLinkProblems("assets/image/tpl-material/image-poster-1.webp");
  assert.ok(withPrefix.some((line) => line.includes("2 次 assets/image/")));
  assert.ok(withPrefix.some((line) => line.includes("2 次 .webp")));

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
    ],
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
  for (const match of source.matchAll(KEY_LITERAL)) remember(match[1], match.index);
  for (const match of source.matchAll(FIELD_LITERAL)) {
    const value = match[2].trim();
    // 空取值（无图）与完整 http(s) 直链都是合法的第二种写法。
    if (!value || /^https?:\/\//i.test(value)) continue;
    remember(value, match.index);
  }
  return [...found].map(([value, line]) => ({ value, line }));
}

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
