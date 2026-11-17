// 生成 `vendor/pptx-preview/pptx-preview.es.js`。
//
// 为什么要生成而不是直接依赖 `pptx-preview`：
// 上游的 ESM 产物第一行 `import*as h from"echarts"` 把整个 echarts@5 焊进了 PPT 预览的
// 依赖闭包（实测 23 chunk / 5,565,729 B 未压缩，占闭包的 91.8%），而首帧一次都用不上。
// 这一行只能在**产物**上改，改不了源码；而 `pnpm.patchedDependencies` 只有工作区根认，
// `@oceanleo/ui` 是被依赖的包，36 个消费站一个都吃不到（各站 node_modules 里有自己的
// `pptx-preview@1.0.7` + `echarts@5.6.0`）。所以只能把改过的产物随本包一起发出去。
//
// 此脚本替换图表引擎导入，并修复缺省文字样式与母版异步加载。每个补丁都校验唯一接缝。
//
//   node scripts/vendor-pptx-preview.mjs           # 生成
//   node scripts/vendor-pptx-preview.mjs --check   # 校验已提交的产物与上游一致
//
// 升级 `pptx-preview` 之后必须重跑；`tests/library-ppt-preview-adapter.test.mjs` 里的
// 「vendored bundle matches upstream」用例会在装了上游包时自动校验这一点。

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outputDir = join(packageRoot, "vendor", "pptx-preview");
const outputPath = join(outputDir, "pptx-preview.es.js");
const metaPath = join(outputDir, "upstream.json");

const UPSTREAM_IMPORT = 'import*as h from"echarts";';
const PATCHED_IMPORT = 'import*as h from"./chart-engine.js";';

// 说明里刻意不写出上游那条 import 的原文：`tests/library-ppt-preview-adapter.test.mjs`
// 用「产物里不许再出现对图表引擎的静态导入」当判据，注释里出现同一串会把它误判成红。
// 精确原文落在同目录的 upstream.json 里。
const BANNER = `// 由 scripts/vendor-pptx-preview.mjs 生成，不要手改。
// 上游 = pptx-preview@<version> 的 dist/pptx-preview.es.js，逐字节复制，
// 补丁：延迟图表引擎；默认文字样式可缺省；等待母版加载并传播错误。
// 精确的改动原文见 ./upstream.json，理由与读数见 ./chart-engine.js 顶部。
// 重新生成：node scripts/vendor-pptx-preview.mjs
`;

export function buildVendoredBundle() {
  const require = createRequire(import.meta.url);
  const upstreamPackagePath = require.resolve("pptx-preview/package.json");
  const upstreamPackage = JSON.parse(readFileSync(upstreamPackagePath, "utf8"));
  const upstreamPath = join(
    dirname(upstreamPackagePath),
    "dist",
    "pptx-preview.es.js",
  );
  const upstream = readFileSync(upstreamPath, "utf8");

  const occurrences = upstream.split(UPSTREAM_IMPORT).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `expected exactly 1 \`${UPSTREAM_IMPORT}\` in pptx-preview@${upstreamPackage.version}, found ${occurrences}. ` +
        "Upstream changed shape — re-read dist/pptx-preview.es.js before regenerating.",
    );
  }
  if (/\bfrom\s*["']echarts["']/.test(upstream.replace(UPSTREAM_IMPORT, ""))) {
    throw new Error(
      "pptx-preview references echarts from more than one place; the single-seam assumption no longer holds.",
    );
  }

  let patched = upstream.replace(UPSTREAM_IMPORT, PATCHED_IMPORT);
  const fixes = [
    ['this.defaultTextStyleSource=c(e,["p:presentation","p:defaultTextStyle"])', 'this.defaultTextStyleSource=c(e,["p:presentation","p:defaultTextStyle"])||{}'],
    ['this.name=t,this.source=e,this.pptx=a,this.load()', 'this.name=t,this.source=e,this.pptx=a'],
    ['case 9:g=u.apply(void 0,[r.sent()]),this.slideMaster.push(new W(m,g,this)),r.label=10;case 10:return b++,[3,8]', 'case 9:return g=u.apply(void 0,[r.sent()]),this.slideMaster.push(new W(m,g,this)),[4,this.slideMaster[this.slideMaster.length-1].load()];case 10:return r.sent(),b++,[3,8]'],
    ['case 22:return r.sent(),[3,23];case 23:return[2]', 'case 22:throw r.sent();case 23:return[2]'],
    ['this._parseDefaultTextStyle(),this._loadNodes(),[2]', 'this._parseDefaultTextStyle(),[4,this._loadNodes()];case 2:return t.sent(),[2]'],
  ];
  for (const [from, to] of fixes) {
    if (patched.split(from).length !== 2) throw new Error(`PPT loading patch seam changed: ${from}`);
    patched = patched.replace(from, to);
  }
  const contents =
    BANNER.replace("<version>", upstreamPackage.version) + patched;
  return {
    contents,
    version: upstreamPackage.version,
    upstreamSha256: createHash("sha256").update(upstream).digest("hex"),
  };
}

function main() {
  const check = process.argv.includes("--check");
  const built = buildVendoredBundle();
  const meta = {
    package: "pptx-preview",
    version: built.version,
    upstreamFile: "dist/pptx-preview.es.js",
    upstreamSha256: built.upstreamSha256,
    patch: { from: UPSTREAM_IMPORT, to: PATCHED_IMPORT },
    loadingFixes: ["defaultTextStyleSource defaults to {}", "await slide master and its nodes", "propagate master load failure"],
  };
  if (check) {
    const current = readFileSync(outputPath, "utf8");
    if (current !== built.contents) {
      console.error(
        "vendor/pptx-preview/pptx-preview.es.js is stale — run `node scripts/vendor-pptx-preview.mjs`.",
      );
      process.exit(1);
    }
    console.log(`vendored pptx-preview@${built.version} is up to date`);
    return;
  }
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, built.contents);
  writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(
    `wrote ${outputPath} from pptx-preview@${built.version} (${built.contents.length} B)`,
  );
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
