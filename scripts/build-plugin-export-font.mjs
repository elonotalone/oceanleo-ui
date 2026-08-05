#!/usr/bin/env node
// ============================================================================
// build-plugin-export-font.mjs — 切出随包发布的字形子集（W24 P3）
// ----------------------------------------------------------------------------
// 导出 PDF 要在文件里嵌字形，否则中文一律渲成空白方块（手写 PDF 只能用 WinAnsi
// 的十四款标准字体）。整包塞一份全字库不行：思源黑体 19 MB、Droid Sans Fallback
// 3.4 MB，进不了 npm 包。所以字形走两级子集，本脚本是第一级：
//
//   构建期（本脚本）：从系统字体切出一份**有界字集**，压进随包发布的数据模块。
//   导出期（`pdf-render.ts`）：从那份字集**再按本份文档实际用到的字符切一次**，
//                              嵌进 PDF。一份三十行的台账因此只带几十个字形。
//
// 两级用的是同一个 `src/shell/plugin-export/truetype-subset.ts`。
//
// ── 选了哪两份字体，为什么 ────────────────────────────────────────────────
//
//   中日韩  Droid Sans Fallback（Apache License 2.0，允许嵌入与再分发）
//           `glyf` 轮廓、unitsPerEm 256，是同类里最省字节的一份：GB2312 全字
//           切出来才八百多 KB，思源黑体同样字数要几兆，而且是 CFF 轮廓，
//           子集化要重写 CharStrings，代价是本链的好几倍。
//   拉丁    Liberation Sans（SIL OFL 1.1，允许嵌入与再分发）
//           Droid Sans Fallback **不含任何拉丁字形**（实测 cmap 里没有 0x41），
//           日期与金额全是拉丁数字，缺了它 PDF 里就是一排空白。
//
// 两份都随包带走，所以两份的许可都必须允许再分发与嵌入——上面各自注明。
//
// ── 字集边界 ──────────────────────────────────────────────────────────────
//
// 中日韩这一侧取 **GB2312 全字集**（一级 3755 + 二级 3008 + 符号区 682）。
// 只取一级会漏掉二级里的姓氏与地名用字，导出一份账本恰好碰上一个就得替换成
// 缺字记号——那正是「不许交看不见中文的 PDF」要防的事。取全集之后，
// 简体中文正文实际用到而落在集外的字已经罕见到可以逐个记账。
//
// 集外字符不会被静默丢掉：`pdf-render.ts` 用 □ 顶上并在页脚写明有几个字
// 没有字形，用户当场看得见。
//
// 用法：
//   node scripts/build-plugin-export-font.mjs           # 切子集并写盘
//   node scripts/build-plugin-export-font.mjs --check   # 只校验是否已同步
// ============================================================================

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = resolve(REPO_ROOT, "src/shell/plugin-export/pdf-font-data-generated.ts");

const { parseTrueType, subsetTrueType } = await import(
  resolve(REPO_ROOT, "src/shell/plugin-export/truetype-subset.ts")
);

const SOURCES = {
  cjk: {
    name: "DroidSansFallback",
    license: "Apache-2.0",
    licenseNote: "Copyright © 2006-2010 Google Corp.，Apache License 2.0 允许嵌入与再分发",
    paths: [
      "/usr/share/fonts-droid-fallback/truetype/DroidSansFallback.ttf",
      "/host/usr/share/fonts-droid-fallback/truetype/DroidSansFallback.ttf",
      "/usr/share/fonts/truetype/droid/DroidSansFallback.ttf",
    ],
  },
  latin: {
    name: "LiberationSans",
    license: "OFL-1.1",
    licenseNote: "Copyright © 2012 Red Hat, Inc.，SIL Open Font License 1.1 允许嵌入与再分发",
    paths: [
      "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
      "/host/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ],
  },
};

function fail(message) {
  process.stderr.write(`build-plugin-export-font: ${message}\n`);
  process.exit(1);
}

function loadSource(key) {
  const source = SOURCES[key];
  const path = source.paths.find((candidate) => existsSync(candidate));
  if (!path) {
    fail(
      `找不到 ${source.name}，试过：\n  ${source.paths.join("\n  ")}\n` +
        "  这是构建期依赖，不影响已经生成好的数据模块。",
    );
  }
  return { ...source, path, bytes: new Uint8Array(readFileSync(path)) };
}

/** GB2312 全字集：符号区 + 一级 3755 + 二级 3008。用 python3 的 gb2312 编解码枚举。 */
function gb2312CodePoints() {
  const text = execFileSync(
    "python3",
    [
      "-c",
      [
        "import sys",
        "out=[]",
        "for hi in range(0xA1,0xFF):",
        "    for lo in range(0xA1,0xFF):",
        "        try: out.append(bytes([hi,lo]).decode('gb2312'))",
        "        except Exception: pass",
        "sys.stdout.write(''.join(out))",
      ].join("\n"),
    ],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  return [...text].map((ch) => ch.codePointAt(0));
}

function range(start, end) {
  const out = [];
  for (let cp = start; cp <= end; cp += 1) out.push(cp);
  return out;
}

const LATIN_WANTED = [
  ...range(0x20, 0x7e), // ASCII 可打印
  ...range(0xa0, 0xff), // Latin-1：¥ ° × ÷ § ± © ® 与带音符的拉丁字母
  0x2013, 0x2014, // – —
  0x2018, 0x2019, 0x201c, 0x201d, // ‘ ’ “ ”
  0x2022, 0x2026, // • …
  0x20ac, // €
];

const CJK_EXTRA = [
  0x3000, // 表意空格
  0x25a1, // □ 缺字记号：集外字符用它顶上，用户当场看得见
  ...range(0x2190, 0x2193), // ← ↑ → ↓
  ...range(0xff01, 0xff5e), // 全角形式
  0xffe5, // ￥
];

function chunk(text, width) {
  const lines = [];
  for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
  return lines;
}

function build() {
  const cjkSource = loadSource("cjk");
  const latinSource = loadSource("latin");
  const cjkFont = parseTrueType(cjkSource.bytes);
  const latinFont = parseTrueType(latinSource.bytes);

  // 分派规则与渲染时的查字顺序**必须是同一条**：先问拉丁那一份，再问中日韩那一份。
  // 两边都带同一个字形就是同一份数据存两次；顺序不一致则会出现「打包时归了 A、
  // 渲染时去问 B」的漏字。
  const wanted = [
    ...new Set([...LATIN_WANTED, ...gb2312CodePoints(), ...CJK_EXTRA]),
  ].sort((a, b) => a - b);
  const latinWanted = [];
  const cjkWanted = [];
  const unavailable = [];
  for (const cp of wanted) {
    if (latinFont.glyphId(cp)) latinWanted.push(cp);
    else if (cjkFont.glyphId(cp)) cjkWanted.push(cp);
    else unavailable.push(cp);
  }
  if (unavailable.length) {
    process.stdout.write(
      `build-plugin-export-font: 两份源字体都没有的码位 ${unavailable.length} 个（已跳过）：` +
        `${unavailable
          .slice(0, 12)
          .map((cp) => `U+${cp.toString(16).toUpperCase()}`)
          .join(" ")}${unavailable.length > 12 ? " …" : ""}\n`,
    );
  }
  for (const cp of [0x25a1, 0x2026]) {
    if (!latinWanted.includes(cp) && !cjkWanted.includes(cp)) {
      fail(
        `记号字符 U+${cp.toString(16).toUpperCase()} 两份源字体都没有 —— ` +
          "缺字记号与截断记号自己都渲不出来，这份子集不能发。",
      );
    }
  }

  const latinSubset = subsetTrueType(latinFont, latinWanted);
  const cjkSubset = subsetTrueType(cjkFont, cjkWanted);

  const assets = [
    {
      key: "latin",
      source: latinSource,
      subset: latinSubset,
      font: latinFont,
      covered: latinWanted,
    },
    {
      key: "cjk",
      source: cjkSource,
      subset: cjkSubset,
      font: cjkFont,
      covered: cjkWanted,
    },
  ];

  const lines = [];
  lines.push("// ============================================================================");
  lines.push("// GENERATED FILE — 不要手改。");
  lines.push("// 由 `node scripts/build-plugin-export-font.mjs` 从系统字体切出的有界字集。");
  lines.push("//");
  lines.push("// 这是导出 PDF 用的字形。**本模块只许动态 import**：它是随包最大的一块数据，");
  lines.push("// 静态引用会让 36 个站的主包都背上它，而绝大多数用户从不导出 PDF。");
  lines.push("// 载入点在 `pdf-cjk-font.ts`，那里也是唯一一处 `await import()`。");
  lines.push("//");
  lines.push("// 字节是 zlib 压缩后的 base64；解压在 `pdf-cjk-font.ts`，用的是本仓已有的 fflate。");
  for (const asset of assets) {
    lines.push("//");
    lines.push(`//   ${asset.key}: ${asset.source.name} —— ${asset.source.licenseNote}`);
    lines.push(
      `//        字形 ${asset.subset.glyphOrder.length} 个 / 码位 ${asset.covered.length} 个 / ` +
        `子集 ${(asset.subset.bytes.length / 1024).toFixed(0)} KB`,
    );
  }
  lines.push("// ============================================================================");
  lines.push("");
  lines.push("export interface PdfFontAsset {");
  lines.push("  /** 字体名，写进 PDF 的 FontName（前面还会补一个六字母子集前缀）。 */");
  lines.push("  name: string;");
  lines.push("  /** 许可标识。随包再分发的前提，改字体必须同时改这一行。 */");
  lines.push("  license: string;");
  lines.push("  licenseNote: string;");
  lines.push("  /** 码位数，给机检当口径用。 */");
  lines.push("  codePoints: number;");
  lines.push("  /** zlib 压缩后的 base64，空白字符在解码时忽略。 */");
  lines.push("  deflated: string;");
  lines.push("}");
  lines.push("");
  lines.push("export const PDF_FONT_ASSETS: Readonly<Record<\"latin\" | \"cjk\", PdfFontAsset>> = {");
  for (const asset of assets) {
    const packed = deflateSync(Buffer.from(asset.subset.bytes), { level: 9 });
    lines.push(`  ${asset.key}: {`);
    lines.push(`    name: ${JSON.stringify(asset.source.name)},`);
    lines.push(`    license: ${JSON.stringify(asset.source.license)},`);
    lines.push(`    licenseNote: ${JSON.stringify(asset.source.licenseNote)},`);
    lines.push(`    codePoints: ${asset.covered.length},`);
    lines.push("    deflated: `");
    for (const line of chunk(packed.toString("base64"), 118)) lines.push(line);
    lines.push("`,");
    lines.push("  },");
    process.stdout.write(
      `build-plugin-export-font: ${asset.key} ${asset.source.name} ` +
        `字形 ${asset.subset.glyphOrder.length} / 码位 ${asset.covered.length} / ` +
        `子集 ${(asset.subset.bytes.length / 1024).toFixed(0)} KB → ` +
        `压缩 ${(packed.length / 1024).toFixed(0)} KB → ` +
        `base64 ${((packed.length * 4) / 3 / 1024).toFixed(0)} KB\n`,
    );
  }
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}

const output = build();

if (process.argv.includes("--check")) {
  const current = existsSync(TARGET) ? readFileSync(TARGET, "utf8") : "";
  if (current !== output) fail(`${TARGET} 与源字体不一致，请重跑本脚本。`);
  process.stdout.write("build-plugin-export-font: 已同步\n");
} else {
  writeFileSync(TARGET, output, "utf8");
  process.stdout.write(`build-plugin-export-font: 写入 ${TARGET}\n`);
}
