import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COLLAB_MEDIA_MESSAGES } from "../src/i18n/ui/messages/collab-media-copy.ts";

const source = (path) => readFileSync(new URL(`../src/shell/${path}`, import.meta.url), "utf8");

// 只读不再整块 inert：播放、转视角照常，改内容的入口各自置灰。
for (const [name, path] of [
  ["视频", "advanced-routes/VideoTimelineRoute.tsx"],
  ["音频", "advanced-routes/AudioRoute.tsx"],
  ["3D", "advanced-routes/Model3DRoute.tsx"],
]) {
  test(`${name}路由：只读时不再整块 inert，对方改动不走「恢复本地草稿」入口`, () => {
    const text = source(path);
    assert.doesNotMatch(text, /inert=\{/, "没有整块 inert 包裹");
    const applyRemote = /applyRemote[^]{0,400}/.exec(text)?.[0] ?? "";
    assert.doesNotMatch(applyRemote, /restoreRecovery/, "远端改动不经过 restoreRecovery");
    assert.match(text, /applyLocal/, "撤销 / 重做算出的本端改动有单独入口");
  });
}

test("三个编辑器都保留 restoreRecovery 原行为，另有各自的远端改动入口", () => {
  const video = source("video-editor/use-video-timeline.ts");
  assert.match(video, /restoreRecovery/);
  assert.match(video, /applyRemoteDoc/);
  assert.match(source("media-editors/use-audio-persistence.ts"), /restoreRecovery/);
  assert.match(source("media-editors/use-audio-remote-apply.ts"), /applyRemoteProject/);
  const model = source("media-editors/use-model3d-workbench.ts");
  assert.match(model, /restoreRecovery/);
  assert.match(model, /已恢复上次未同步的本地草稿/);
  assert.match(model, /applyRemoteScene/);
});

test("远端改动入口不标未保存、不加改动版本号、不弹提示", () => {
  const video = source("video-editor/use-video-timeline.ts");
  const remote = /const applyRemoteDoc = useCallback\([^]*?\n  \}, \[\]\);/.exec(video)?.[0] ?? "";
  assert.ok(remote.length > 100, "找到 applyRemoteDoc");
  assert.doesNotMatch(remote, /setDirty|revisionRef\.current \+= 1|setNotice|undoStack|redoStack/);
  const audio = source("media-editors/use-audio-remote-apply.ts");
  const remoteBranch = /operationsRef\.current = \[\.\.\.project\.operations\];[^]*?bumpContent\(\);/.exec(audio)?.[0] ?? "";
  assert.match(remoteBranch, /if \(mode === "local"\)/, "改动版本号与未保存标记只在本端撤销 / 重做时设置");
  assert.doesNotMatch(audio, /undoRef|redoRef|setCanUndo/, "不碰本机撤销栈");
  assert.match(audio, /if \(!quiet\) \{\s*setError/, "对方的改动失败时不弹错误");
});

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
