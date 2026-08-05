// 导出链的公共面（W24 P1）。
//
// 挡的是一种已经真的发生过一次的静默失效：**包里把整条链做完了、测试全绿，
// 但一个符号都没从共享包的 barrel 出去，36 个消费站 import 不到任何东西。**
// 那一次没有任何测试变红，因为包内的测试只 import 内部路径
// （`signals/W21-request.md` 第 1 条）。所以这道闸只认 barrel 上的字。
//
// 三层都要成立：
//   ① `src/shell/plugin-export/index.ts` 这份挑过的公共面上，站点侧画按钮与
//      执行导出所需的符号一个都不许少；
//   ② `src/shell/index.ts` 把它整份 re-export 出去，接线层 `exportToMyLibrary()`
//      也在（它连带拉起网关客户端，所以在链的 barrel 之外单独一行）；
//   ③ 包根 barrel 再把 shell 整份 re-export，`@oceanleo/ui` 与
//      `@oceanleo/ui/shell` 两条 import 路径都拿得到。

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import * as exportChain from "../src/shell/plugin-export/index.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

/**
 * 活跃源码行：去掉整行 `//` 注释与行尾 `//` 注释。
 * VF2 攻击：把 `export * from "./plugin-export";` 改成注释后子串仍在、旧闸仍绿。
 * 匹配必须只认还在跑的那一行，不许认注释里的尸骸。
 */
function activeSourceLines(text) {
  return text.split("\n").flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("//")) return [];
    // 行尾注释：只剥 ` // ...`，不动字符串里偶然出现的 `https://`（本闸匹配的都是 export 行）。
    const withoutTrailing = trimmed.replace(/\s+\/\/.*$/, "");
    return withoutTrailing ? [withoutTrailing] : [];
  });
}

function activeSource(text) {
  return activeSourceLines(text).join("\n");
}

const shellBarrel = source("../src/shell/index.ts");
const packageBarrel = source("../src/index.ts");
const chainBarrel = source("../src/shell/plugin-export/index.ts");
const wiring = source("../src/shell/plugin-export/plugin-export-wiring.ts");
const shellBarrelActive = activeSource(shellBarrel);
const packageBarrelActive = activeSource(packageBarrel);

/**
 * 站点侧真正要用到的那一组。分三类，每一类少一个都会让站点侧做不成一件事：
 * 画按钮（形态清单 + 形态中文名 + 工具中文名）、执行导出、以及库那一侧的准入判据。
 */
const REQUIRED_VALUES = [
  // 画「导出成 …」那排按钮
  "PLUGIN_EXPORT_CATALOG",
  "PLUGIN_EXPORT_FORMS",
  "exportKindsForPlugin",
  "renderableExportKindsForPlugin",
  "pluginExportForm",
  "pluginSupportsForm",
  // 执行导出（渲染 → 落库 → 可下载）
  "renderPluginExport",
  "exportToLibrary",
  "normalizePluginExportRequest",
  "pluginExportFilename",
  "pluginExportTitle",
  "pluginExportProvenance",
  // 「我的库」的准入：功能件本身永不进库
  "MATERIAL_ARTIFACT_TYPES",
  "RUNTIME_STATE_ARTIFACT_TYPES",
  "isMaterialArtifactType",
  "libraryEntryIsDownloadableMaterial",
  "libraryEntryIsRuntimeSurface",
  // 对账闸（清册声明的形态必须有确定结果）
  "auditPluginExportCatalog",
  "formatPluginExportAudit",
  // 台账这条已经通到底的链
  "LEDGER_EXPORT_FORMS",
  "LEDGER_RENDERABLE_EXPORT_FORMS",
  "LEDGER_SOURCE_ID",
  "LEDGER_SOURCE_LABEL",
  "ledgerExportData",
  "ledgerExportRequest",
];

test("导出链自己的公共面：站点侧画按钮与执行导出所需的符号一个都不少", () => {
  for (const name of REQUIRED_VALUES) {
    assert.ok(
      name in exportChain,
      `plugin-export/index.ts 没有导出 ${name}，站点侧就少了一件做不成的事`,
    );
  }
  // 类型只在源码里看得见，运行时查不到，所以逐个在 barrel 源码上核。
  for (const name of [
    "PluginExportCatalogEntry",
    "PluginExportData",
    "PluginExportForm",
    "PluginExportFormId",
    "PluginExportRequest",
    "PluginExportRejection",
    "NormalizedPluginExportRequest",
    "PluginExportResult",
    "RenderedPluginExport",
    "LedgerEntry",
    "LedgerSnapshot",
  ]) {
    assert.match(
      chainBarrel,
      new RegExp(`\\btype ${name}\\b`),
      `plugin-export/index.ts 没有导出类型 ${name}`,
    );
  }
});

test("目录里的每一个模块都被那份公共面收进去，新加的渲染器漏不掉", () => {
  const directory = new URL("../src/shell/plugin-export/", import.meta.url);
  // 逐个文件列名单会漏掉新加的文件，所以扫目录。接线层是唯一的例外，
  // 它由 `src/shell/index.ts` 单独一行导出（见下一条用例）。
  const modules = readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => name.replace(/\.ts$/, ""))
    .filter(
      (name) =>
        name !== "index" &&
        // 接线层由 `src/shell/index.ts` 单独一行导出（见下一条用例）。
        name !== "plugin-export-wiring" &&
        // 字形数据**故意**不进 barrel，见下一条用例。
        name !== "pdf-font-data-generated",
    );
  assert.ok(modules.length >= 6, "导出链的模块一个都不许漏扫");
  for (const name of modules) {
    assert.ok(
      chainBarrel.includes(`from "./${name}"`),
      `${name}.ts 没有从 plugin-export/index.ts 出去，站点侧够不着它`,
    );
  }
});

test("字形数据只许动态 import：静态引用会让 36 个站的主包都背上它", () => {
  const directory = new URL("../src/shell/plugin-export/", import.meta.url);
  const asset = readFileSync(
    new URL("pdf-font-data-generated.ts", directory),
    "utf8",
  );
  // 这份数据本身就是本包最大的一块，判据先确认它确实大到值得单独切分块，
  // 否则下面那条限制只是一句空话。
  assert.ok(asset.length > 300_000, "字形数据小得反常，先确认它是不是切坏了");
  assert.equal(
    chainBarrel.includes("pdf-font-data-generated"),
    false,
    "字形数据被 barrel 静态带出去了，代码分割白做",
  );
  const importers = readdirSync(directory)
    .filter((name) => name.endsWith(".ts") && name !== "pdf-font-data-generated.ts")
    .filter((name) =>
      readFileSync(new URL(name, directory), "utf8").includes(
        'from "./pdf-font-data-generated"',
      ),
    );
  assert.deepEqual(importers, [], "只许 `await import()`，不许静态 import");
  const loader = readFileSync(new URL("pdf-cjk-font.ts", directory), "utf8");
  assert.match(loader, /import\("\.\/pdf-font-data-generated"\)/);
});

test("共享包 barrel 把整条链带出去，36 个消费站 import 得到", () => {
  // 用 `export *` 而不是抄一份名单：名单会漏，`export *` 不会。
  // 只在活跃源码上匹配：注释掉这一行必须红（VF2 P1）。
  assert.match(
    shellBarrelActive,
    /export \* from "\.\/plugin-export";/,
    "src/shell/index.ts 没有 re-export 导出链——包里做好了、站点拿不到",
  );
  // 接线层是站点侧唯一需要调的那个函数，它不在链的 barrel 里，必须单独出去。
  assert.match(
    shellBarrelActive,
    /export \{[\s\S]*?\bexportToMyLibrary\b[\s\S]*?\} from "\.\/plugin-export\/plugin-export-wiring";/,
    "src/shell/index.ts 没有 re-export exportToMyLibrary()，站点侧无从发起导出",
  );
  assert.match(wiring, /export function exportToMyLibrary\(/);
  assert.match(wiring, /export const liveExportDependencies/);
  // 包根 barrel：`@oceanleo/ui` 与 `@oceanleo/ui/shell` 两条路径都要拿得到。
  assert.match(packageBarrelActive, /export \* from "\.\/shell";/);
});

test("反面：注释掉 barrel 的 export * 必须红（子串留在注释里不算数）", () => {
  // 复现 VF2 那一刀：整行改成 `// export * from "./plugin-export";` 之后，
  // 活跃源码里不许再认到这条 re-export。
  const commented = shellBarrel.replace(
    /^(\s*)export \* from "\.\/plugin-export";/m,
    '$1// export * from "./plugin-export";',
  );
  assert.match(
    commented,
    /\/\/ export \* from "\.\/plugin-export";/,
    "夹具自己没造出「注释掉」这一刀，下面的断言会空转",
  );
  assert.equal(
    /export \* from "\.\/plugin-export";/.test(activeSource(commented)),
    false,
    "注释里的 export * 尸骸被当成活跃 re-export 了",
  );
});

test("导出的形态清单在包外可用：一枚按键点下去，形态与中文名都查得到", () => {
  // 这是站点侧那段代码的最小复现：拿工具 id → 形态清单 → 每种形态的中文名。
  const kinds = exportChain.renderableExportKindsForPlugin("ledger-register");
  assert.ok(kinds.length > 0, "台账查不到任何可渲染的导出形态");
  for (const id of kinds) {
    const form = exportChain.pluginExportForm(id);
    assert.ok(form, `${id} 在形态表里查不到`);
    assert.ok(form.label && !form.label.includes("插件"));
    assert.equal(exportChain.isMaterialArtifactType(form.artifactType), true);
  }
  assert.equal(exportChain.PLUGIN_EXPORT_CATALOG["ledger-register"].label, "台账");
});
