// W08：专业托管导入路径已拿掉。不再编造文件名送进第三方整站。

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("game hosted import module is gone", () => {
  assert.equal(
    existsSync(
      new URL("../src/shell/game-editor/game-microstudio-embed.ts", import.meta.url),
    ),
    false,
    "导入模块还在，专业托管编辑没拿掉",
  );
  const leaf = readFileSync(
    new URL("../src/shell/game-editor/GameCodeStage.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(leaf, /buildGameIdeImportEnvelope/);
  assert.doesNotMatch(leaf, /oceanleo-import\.html/);
  assert.doesNotMatch(leaf, /microstudio/i);
});
