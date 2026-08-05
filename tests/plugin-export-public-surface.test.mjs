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

const shellBarrel = source("../src/shell/index.ts");
const packageBarrel = source("../src/index.ts");
const chainBarrel = source("../src/shell/plugin-export/index.ts");
const wiring = source("../src/shell/plugin-export/plugin-export-wiring.ts");

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
    .filter((name) => name !== "index" && name !== "plugin-export-wiring");
  assert.ok(modules.length >= 6, "导出链的模块一个都不许漏扫");
  for (const name of modules) {
    assert.ok(
      chainBarrel.includes(`from "./${name}"`),
      `${name}.ts 没有从 plugin-export/index.ts 出去，站点侧够不着它`,
    );
  }
});

test("共享包 barrel 把整条链带出去，36 个消费站 import 得到", () => {
  // 用 `export *` 而不是抄一份名单：名单会漏，`export *` 不会。
  assert.match(
    shellBarrel,
    /export \* from "\.\/plugin-export";/,
    "src/shell/index.ts 没有 re-export 导出链——包里做好了、站点拿不到",
  );
  // 接线层是站点侧唯一需要调的那个函数，它不在链的 barrel 里，必须单独出去。
  assert.match(
    shellBarrel,
    /export \{[\s\S]*?\bexportToMyLibrary\b[\s\S]*?\} from "\.\/plugin-export\/plugin-export-wiring";/,
    "src/shell/index.ts 没有 re-export exportToMyLibrary()，站点侧无从发起导出",
  );
  assert.match(wiring, /export function exportToMyLibrary\(/);
  assert.match(wiring, /export const liveExportDependencies/);
  // 包根 barrel：`@oceanleo/ui` 与 `@oceanleo/ui/shell` 两条路径都要拿得到。
  assert.match(packageBarrel, /export \* from "\.\/shell";/);
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
