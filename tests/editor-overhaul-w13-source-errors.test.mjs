import test from "node:test";
import assert from "node:assert/strict";
import { React, compileModule, dataModule, mount, settle } from "./collab-media-sim.mjs";
import { Model3DClosureError } from "../src/shell/media-editors/model3d-closure.ts";
import { EDITOR_OVERHAUL_W13_COPY } from "../src/i18n/ui/messages/editor-overhaul-copy-w13.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LOCALES } from "../src/i18n/config.ts";

const { useModel3DSourceLoader } = await import(await compileModule("src/shell/media-editors/use-model3d-source-loader.ts", {
  "./model3d-files": dataModule("export const prepareModelRuntimeSource = async () => { throw globalThis.__w13SourceError; };"),
}));
const messages = ["无法恢复 3D 检查点版本", "3D 检查点来源身份无法确认", "3D 检查点内容校验失败"];
const english = ["Unable to restore the 3D checkpoint revision", "Unable to verify the 3D checkpoint source identity", "3D checkpoint content verification failed"];

async function displayed(error) {
  globalThis.__w13SourceError = error;
  const errors = []; const translated = [];
  const ref = (current) => ({ current });
  const options = {
    runtimeRef: ref({ cancelLoad() {} }), runtimeReady: true, sourceUrl: "https://models.invalid/test.glb",
    dependencyBaseUrl: "https://models.invalid/test.glb", artifactIdentity: null, reloadToken: 0,
    sourceGenerationRef: ref(1), loadedSourceRef: ref(""), aliveRef: ref(true), viewRef: ref({}),
    pendingOperationsRef: ref([]), annotations: [], setModelLoading() {}, setProgress() {},
    setError: (value) => errors.push(value), setNotice() {}, onPreparedSource() {},
    tt: (key) => { translated.push(key); return EDITOR_OVERHAUL_W13_COPY.en[key] || `translated:${key}`; },
  };
  function Probe() { useModel3DSourceLoader(options); return null; }
  const tree = await mount(React.createElement(Probe));
  try { await settle(3); return { text: errors.at(-1), translated }; }
  finally { await tree.unmount(); }
}

test("the real source-loader UI boundary translates only the three known checkpoint errors", async () => {
  for (const [index, message] of messages.entries()) {
    const result = await displayed(new Error(message));
    assert.equal(result.text, english[index]);
    assert.deepEqual(result.translated.filter((key) => key !== "3D 模型加载失败"), [message]);
  }
});

test("abort, structured closure detail, unknown errors and non-Error fallbacks retain their semantics", async () => {
  const closure = new Model3DClosureError({ state: "degraded", message: "Missing textures/base-color.png", missing: [{ uri: "textures/base-color.png", kind: "image", index: 0 }] });
  const closureWithKnownText = new Model3DClosureError({ state: "invalid", message: messages[0], missing: [] });
  for (const [error, expected] of [
    [new DOMException(messages[0], "AbortError"), ""],
    [closure, "[model-3d-closure-incomplete] Missing textures/base-color.png"],
    [closureWithKnownText, `[model-3d-closure-incomplete] ${messages[0]}`],
    [new Error("HTTP 410: exact old revision unavailable"), "HTTP 410: exact old revision unavailable"],
    [new Error(`${messages[0]}: detail`), `${messages[0]}: detail`],
    [{ message: messages[0] }, "translated:3D 模型加载失败"],
  ]) {
    const result = await displayed(error);
    assert.equal(result.text, expected);
    assert.deepEqual(result.translated.filter((key) => key !== "3D 模型加载失败"), []);
  }
});

test("all sixteen non-Chinese locale dictionaries register the three checkpoint errors", () => {
  const locales = LOCALES.filter((locale) => locale !== "zh");
  assert.equal(locales.length, 16);
  for (const locale of locales) for (const message of messages) {
    const translated = EDITOR_OVERHAUL_W13_COPY[locale][message];
    assert.equal(typeof translated, "string", `${locale}:${message}`);
    assert.ok(translated.trim()); assert.notEqual(translated, message);
    assert.equal(UI_MESSAGES[locale][message], translated);
    if (!["zh-TW", "ja"].includes(locale)) assert.doesNotMatch(translated, /\p{Script=Han}/u);
  }
});
