// W31 A-90 行为闸：导入 microStudio 时缺文件名不许编造 oceanleo-import.html。
//
// 锁的是用户语义，不是源码里还有没有那个默认名（A-48）。
// 没文件名 → 不产出 envelope，用户看见「导入前请先给这份代码起个文件名」。
// 有文件名 → 文件树里就是作者给的那份，不是猜出来的 .html / .js。
//
// 断言同时锁「没送出去」和「有可读原因」（W25 形态）。
// 原因必须是人话：空串或机器码不能算告知（A-93）。

import assert from "node:assert/strict";
import test from "node:test";

import {
  GAME_IDE_IMPORT_MESSAGE_TYPE,
  GAME_IDE_IMPORT_NEEDS_FILENAME,
  GAME_IDE_PAYLOAD_KIND,
  buildGameIdeImportEnvelope,
  hostGameIdeImportFileName,
} from "../src/shell/game-editor/game-microstudio-embed.ts";

const MINIMAL_HTML =
  "<!doctype html><html><body><script>void 0</script></body></html>";
const INSTANCE = "gm-w31-import";

function isHumanReason(reason) {
  const text = String(reason ?? "");
  return (
    text.trim().length > 0 &&
    /[\u4e00-\u9fff]/.test(text) &&
    !/^[A-Z][A-Z0-9_]+$/.test(text.trim())
  );
}

test("host title becomes the file name; blank title is not invented", () => {
  assert.equal(hostGameIdeImportFileName("我的平台跳跃"), "我的平台跳跃");
  assert.equal(hostGameIdeImportFileName("  闸  "), "闸");
  assert.equal(hostGameIdeImportFileName(""), "");
  assert.equal(hostGameIdeImportFileName("   "), "");
  assert.equal(hostGameIdeImportFileName(undefined), "");
});

test("missing fileName does not produce an import envelope", () => {
  const result = buildGameIdeImportEnvelope(INSTANCE, { source: MINIMAL_HTML });
  assert.equal(result.ok, false, "缺文件名时不许产出 envelope");
  assert.equal(result.envelope, undefined, "缺文件名时不许产出 envelope");
  assert.equal(
    result.reason,
    GAME_IDE_IMPORT_NEEDS_FILENAME,
    "缺文件名时用户看得见一句人话",
  );
  assert.equal(
    isHumanReason(result.reason),
    true,
    "拒绝了但用户看不见原因",
  );
  assert.match(result.reason, /文件名/);
  assert.match(result.reason, /microStudio/);
  assert.notEqual(result.reason.trim(), "", "拒绝了但用户看不见原因");
});

test("whitespace-only fileName is treated as missing, not sent as a guessed html name", () => {
  const result = buildGameIdeImportEnvelope(INSTANCE, {
    source: MINIMAL_HTML,
    title: "作者标题",
    fileName: "   ",
  });
  assert.equal(result.ok, false, "缺文件名时不许产出 envelope");
  assert.equal(result.envelope, undefined, "缺文件名时不许产出 envelope");
  assert.equal(result.reason, GAME_IDE_IMPORT_NEEDS_FILENAME);
  assert.equal(isHumanReason(result.reason), true, "拒绝了但用户看不见原因");
});

test("empty-string fileName is refused with a sentence a person can read", () => {
  const result = buildGameIdeImportEnvelope(INSTANCE, {
    source: MINIMAL_HTML,
    fileName: "",
  });
  assert.equal(result.ok, false, "缺文件名时不许产出 envelope");
  assert.equal(result.ok, false);
  assert.ok(result.reason.length >= 8, "拒绝了但用户看不见原因");
  assert.equal(isHumanReason(result.reason), true, "原因必须是人话，不能是机器码或空串");
  assert.equal(result.reason, "导入前请先给这份代码起个文件名，没有文件名不会送进 microStudio。");
});

test("a host-given fileName is sent exactly, not oceanleo-import.html or a .js guess", () => {
  const result = buildGameIdeImportEnvelope(INSTANCE, {
    source: MINIMAL_HTML,
    title: "作者标题",
    fileName: "我的平台跳跃.html",
  });
  assert.equal(result.ok, true, "有文件名时应当送进 microStudio");
  assert.equal(result.envelope.type, GAME_IDE_IMPORT_MESSAGE_TYPE);
  assert.equal(result.envelope.content.kind, GAME_IDE_PAYLOAD_KIND);
  assert.equal(
    result.envelope.content.fileName,
    "我的平台跳跃.html",
    "专业模式文件树里必须是作者给的文件名",
  );
  assert.notEqual(result.envelope.content.fileName, "oceanleo-import.html");
  assert.notEqual(result.envelope.content.fileName, "stolen-name.js");
  assert.equal(result.envelope.content.source, MINIMAL_HTML);
});
