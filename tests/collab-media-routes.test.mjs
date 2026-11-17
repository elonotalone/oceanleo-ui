import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COLLAB_MEDIA_MESSAGES } from "../src/i18n/ui/messages/collab-media-copy.ts";

const source = (path) => readFileSync(new URL(`../src/shell/${path}`, import.meta.url), "utf8");

// 只读不再整块 inert：播放、转视角照常，改内容的入口各自置灰。
for (const [name, path] of [
  ["视频", "advanced-routes/VideoTimelineRoute.tsx"],
]) {
  test(`${name}路由：只读时不再整块 inert，对方改动不走「恢复本地草稿」入口`, () => {
    const text = source(path);
    assert.doesNotMatch(text, /inert=\{/, "没有整块 inert 包裹");
    const applyRemote = /applyRemote[^]{0,400}/.exec(text)?.[0] ?? "";
    assert.doesNotMatch(applyRemote, /restoreRecovery/, "远端改动不经过 restoreRecovery");
    assert.match(text, /applyLocal/, "撤销 / 重做算出的本端改动有单独入口");
  });
}

test("新增文案：17 种语言都有，且不含「上线」", () => {
  const keys = [
    "对方已经改过这一步涉及的内容，这一步没有撤销，你们两边的改动都还在。",
    "对方已经改过这一步涉及的内容，这一步没有重做，你们两边的改动都还在。",
    "有 {n} 处对方已经改过，这几处没有动，其余已撤销。",
    "有 {n} 处对方已经改过，这几处没有动，其余已重做。",
    "只能查看，不能修改",
    "空格播放 · ←/→ 逐帧 · Ctrl+滚轮缩放",
    "正在同步对方的改动，本次操作未应用，请稍后重试",
  ];
  const locales = Object.keys(COLLAB_MEDIA_MESSAGES);
  assert.ok(locales.length >= 16, `语言数：${locales.length}`);
  for (const locale of locales) {
    for (const key of keys) {
      const value = COLLAB_MEDIA_MESSAGES[locale][key];
      assert.ok(value && value.trim(), `${locale} 缺少：${key}`);
      assert.doesNotMatch(value, /上线/);
    }
  }
  for (const key of keys.filter((entry) => entry.includes("{n}"))) {
    for (const locale of locales) assert.match(COLLAB_MEDIA_MESSAGES[locale][key], /\{n\}/, `${locale} 保留 {n}`);
  }
});
