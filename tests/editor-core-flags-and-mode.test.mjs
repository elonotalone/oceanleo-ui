// ============================================================================
// L0 专业模式开关 + 双核 flag 的判据（W01 判据 3/4，editor-core-swap）
//
// 锁的是两条产品承诺，不是实现细节：
//   1. **默认普通模式**（R3）：没存过就是 normal；开关点一次记住，按用户 × 编辑器分开记。
//   2. **默认旧核**（§10 第 3 条）：13 件 flag 全部 legacy；本波不换核的那几件翻了也没用。
//
// 反面验证见 verdicts/W01-delivery.md：把默认档改成 pro / next，这里当场红。
// 注释里不举任何真实 CSS 类名（_COMMON §7b⑧：判据文件会被 Tailwind 扫进产物）。
// ============================================================================

import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import {
  DEFAULT_EDITOR_CORE,
  EDITOR_CORE_IDS,
  EDITOR_CORE_SPECS,
  editorSwapsCore,
  resolveEditorCore,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";

// localStorage 的最小替身：本文件只验读写与默认档，不需要真 DOM。
function installStorage() {
  const map = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    },
    addEventListener() {},
  };
  return map;
}

beforeEach(() => {
  delete globalThis.window;
});

// ─── 判据 4：双核 flag ──────────────────────────────────────────────────────

test("13 件编辑器每件一个 flag，默认全部 legacy", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(EDITOR_CORE_IDS.length, 13, "13 件，一件不少");
  for (const id of EDITOR_CORE_IDS) {
    assert.equal(resolveEditorCore(id), "legacy", id);
  }
});

test("台账每件都指得回一个 owner 与一个接法", () => {
  for (const id of EDITOR_CORE_IDS) {
    const spec = EDITOR_CORE_SPECS[id];
    assert.match(spec.owner, /^W\d\d$/, `${id} owner`);
    assert.ok(
      ["native", "hosted", "none"].includes(spec.hosting),
      `${id} hosting`,
    );
    // 不换核的件必须显式写 null + hosting none，不许留半截状态。
    if (spec.nextCore === null) {
      assert.equal(spec.hosting, "none", `${id} 不换核就不该有接法`);
    } else {
      assert.notEqual(spec.hosting, "none", `${id} 换核就必须有接法`);
    }
  }
});

test("本波不换核的件恒为 legacy —— 翻 flag 也没用", () => {
  const noSwap = EDITOR_CORE_IDS.filter((id) => !editorSwapsCore(id));
  assert.ok(noSwap.length > 0, "至少有一件本波不换核（否则这条判据在空转）");
  for (const id of noSwap) {
    // 显式入参是最高优先级，连它都压不动 —— 因为没有新核可去，
    // 翻了只会渲染一个不存在的组件。
    assert.equal(resolveEditorCore(id, "next"), "legacy", id);
    installStorage();
    setEditorCoreOverride(id, "next");
    assert.equal(resolveEditorCore(id), "legacy", `${id} 本地覆盖也压不动`);
  }
});

test("换核的件：显式入参 > 本地覆盖 > 默认", () => {
  const swap = EDITOR_CORE_IDS.filter((id) => editorSwapsCore(id));
  assert.ok(swap.length >= 12, "本波换核的件应有 12 件");
  const id = swap[0];

  assert.equal(resolveEditorCore(id), "legacy", "没存过就是默认档");
  assert.equal(resolveEditorCore(id, "next"), "next", "显式入参生效");

  installStorage();
  setEditorCoreOverride(id, "next");
  assert.equal(resolveEditorCore(id), "next", "本地覆盖生效");
  assert.equal(
    resolveEditorCore(id, "legacy"),
    "legacy",
    "显式入参压过本地覆盖",
  );
  setEditorCoreOverride(id, null);
  assert.equal(resolveEditorCore(id), "legacy", "清掉覆盖回默认档");
});

test("非法档位不生效，回默认档（不是抛错，也不是当成 next）", () => {
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  const map = installStorage();
  map.set(`oceanleo.editor-core.${id}`, "NEXT");
  assert.equal(resolveEditorCore(id), "legacy");
  map.set(`oceanleo.editor-core.${id}`, "");
  assert.equal(resolveEditorCore(id), "legacy");
});

test("localStorage 抛异常时不炸，按默认档走", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        throw new Error("私密模式");
      },
      setItem() {
        throw new Error("私密模式");
      },
      removeItem() {
        throw new Error("私密模式");
      },
    },
    addEventListener() {},
  };
  const id = EDITOR_CORE_IDS.find((each) => editorSwapsCore(each));
  assert.equal(resolveEditorCore(id), "legacy");
  assert.doesNotThrow(() => setEditorCoreOverride(id, "next"));
});

// ─── 判据 3：L0 专业模式开关的持久化 ────────────────────────────────────────

test("默认普通模式；按用户 × 编辑器分开记", async () => {
  installStorage();
  const {
    DEFAULT_PLUGIN_MODE,
    currentPluginMode,
    pluginModeStorageKey,
    setPluginMode,
    resetPluginModeCache,
  } = await import("../src/shell/plugin-chrome/plugin-mode-store.ts");
  resetPluginModeCache();

  assert.equal(DEFAULT_PLUGIN_MODE, "normal", "R3：默认普通模式");
  assert.equal(currentPluginMode("grid"), "normal");

  setPluginMode("grid", "pro");
  assert.equal(currentPluginMode("grid"), "pro", "点一次记住");
  // 「按编辑器」不是一句口号：切到另一件必须仍是普通模式。
  assert.equal(
    currentPluginMode("pdf"),
    "normal",
    "另一件编辑器不受影响",
  );
  assert.equal(pluginModeStorageKey("grid"), "oceanleo.editor-mode.grid");
  assert.notEqual(
    pluginModeStorageKey("grid"),
    pluginModeStorageKey("pdf"),
    "两件不许共用一个 key",
  );

  setPluginMode("grid", "normal");
  assert.equal(currentPluginMode("grid"), "normal", "能切回去");
});

test("存储里的非法值不当成 pro", async () => {
  const map = installStorage();
  const { currentPluginMode, resetPluginModeCache } = await import(
    "../src/shell/plugin-chrome/plugin-mode-store.ts"
  );
  for (const bad of ["PRO", "professional", "1", "true", ""]) {
    map.set("oceanleo.editor-mode.deck", bad);
    // 每轮清缓存，验的才是「解析这个值」而不是「上一轮缓存住的结果」。
    resetPluginModeCache();
    assert.equal(currentPluginMode("deck"), "normal", bad);
  }
});
