// ============================================================================
// 模型组合弹层不许飞出页面（操作员 2026-09-07 图 b32891f2）
// ----------------------------------------------------------------------------
// 主站首页的输入框在页面上部，紧凑模式写死「向上弹」→ 弹层顶端被视口切掉，Lite/Pro/Max
// 只剩半截、看不清。钉：
//   1. `resolvePopoverLayout`：首选侧空间不够就翻到另一侧；两侧都不够取大的一侧，
//      并把高度钉在那侧空间内（不低于可用下限）；
//   2. 弹层 DOM：`flex-col` + `style.maxHeight`，条目区 `overflow-y-auto`（滚动条），
//      紧凑模式尺寸比顶栏版小。
// ============================================================================

import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const mod = await import(
  await compileModule(
    "src/shell/ModelPicker.tsx",
    {
      "../i18n/ui/useUI": dataModule("export function useUI(){ return (s) => String(s); }"),
      "../lib/auth/account": dataModule(
        "export const MODEL_GROUP_CHANGED_EVENT = 'x';\nexport async function getModelGroups(){ return { ok: false, status: 401 }; }\nexport async function setActiveModelGroup(){ return { ok: false }; }",
      ),
      "./workbench-open-store": dataModule("export function useWorkbenchOpen(){ return false; }"),
      "./icons": dataModule("export function IconCheck(){ return null; }\nexport function IconChevronDown(){ return null; }"),
    },
    { missingPackageStub: lazyStub },
  )
);

const {
  resolvePopoverLayout,
  POPOVER_MAX_HEIGHT,
  POPOVER_MIN_HEIGHT,
  POPOVER_VIEWPORT_GUTTER,
} = mod;

test("首选向上、上方空间充足：向上弹，高度取上限", () => {
  const r = resolvePopoverLayout({ preferred: "top", spaceAbove: 600, spaceBelow: 100 });
  assert.equal(r.side, "top");
  assert.equal(r.maxHeight, POPOVER_MAX_HEIGHT);
});

test("首选向上、但输入框贴着页顶（图 b32891f2）：翻到下方，不再飞出页面", () => {
  const r = resolvePopoverLayout({ preferred: "top", spaceAbove: 120, spaceBelow: 500 });
  assert.equal(r.side, "bottom");
  assert.equal(r.maxHeight, POPOVER_MAX_HEIGHT);
});

test("上方空间刚够下限：仍向上弹，高度按空间钉住（减去边距）", () => {
  const space = POPOVER_MIN_HEIGHT + POPOVER_VIEWPORT_GUTTER + 40;
  const r = resolvePopoverLayout({ preferred: "top", spaceAbove: space, spaceBelow: 50 });
  assert.equal(r.side, "top");
  assert.equal(r.maxHeight, space - POPOVER_VIEWPORT_GUTTER);
  assert.ok(r.maxHeight < POPOVER_MAX_HEIGHT);
});

test("两侧都不够：取空间大的一侧，高度不低于可用下限", () => {
  const r = resolvePopoverLayout({ preferred: "top", spaceAbove: 90, spaceBelow: 150 });
  assert.equal(r.side, "bottom");
  assert.equal(r.maxHeight, 142);
  const tiny = resolvePopoverLayout({ preferred: "bottom", spaceAbove: 30, spaceBelow: 20 });
  assert.equal(tiny.side, "top");
  assert.equal(tiny.maxHeight, 120, "再小也留一个能滚的最小高度");
});

test("首选向下、下方够：不翻转", () => {
  const r = resolvePopoverLayout({ preferred: "bottom", spaceAbove: 900, spaceBelow: 400 });
  assert.equal(r.side, "bottom");
});

test("源码契约：弹层 flex-col + maxHeight 内联、条目区可滚、紧凑模式更窄更小", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/shell/ModelPicker.tsx", import.meta.url), "utf8");
  assert.match(src, /data-model-picker-popover/);
  assert.match(src, /style=\{\{ maxHeight: layout\.maxHeight \}\}/);
  assert.match(src, /flex flex-col overflow-hidden/);
  assert.match(src, /data-model-picker-list[\s\S]{0,200}min-h-0 flex-1 overflow-y-auto/);
  assert.match(src, /compact \? "w-\[min\(15rem,88vw\)\]" : "w-\[min\(22rem,88vw\)\]"/);
  assert.match(src, /compact \? "gap-2 px-3 py-1\.5" : "gap-3 px-3\.5 py-2\.5"/);
  assert.doesNotMatch(
    src,
    /placement === "top" \? "bottom-full mb-2"/,
    "不许再按 prop 写死方向，必须用量出来的 layout.side",
  );
});
