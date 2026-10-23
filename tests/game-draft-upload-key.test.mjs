// W15 2026-10-23 [实测]：Code 页第二次保存被上传 409 拒掉——幂等键是 `seed + item.id`，与字节无关。
// 判据：同字节同键（重试安全），换字节换键；拿不到 SHA-256 时也随字节变。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { gameDraftUploadKey, sha256Text } = await import("../src/shell/game-editor/game-draft-save.ts");

test("upload key follows the bytes", async () => {
  const a = await sha256Text("<html>one</html>");
  const b = await sha256Text("<html>two</html>");
  assert.notEqual(gameDraftUploadKey("envelope", a), gameDraftUploadKey("envelope", b));
  assert.equal(gameDraftUploadKey("envelope", a), gameDraftUploadKey("envelope", a));
  assert.notEqual(gameDraftUploadKey("envelope", a), gameDraftUploadKey("manifest", a));
  assert.equal(gameDraftUploadKey("envelope", `sha256:${a}`), gameDraftUploadKey("envelope", a));
});

test("without a digest the key still changes with the text", () => {
  const one = gameDraftUploadKey("envelope", "", "<html>one</html>");
  const two = gameDraftUploadKey("envelope", "", "<html>two</html>");
  assert.notEqual(one, two);
  assert.equal(one, gameDraftUploadKey("envelope", "", "<html>one</html>"));
});

test("the Code page uses the content key, not the item id", () => {
  const code = readFileSync("src/shell/game-editor/GameCodeStage.tsx", "utf8");
  assert.match(code, /idempotencyKey:\s*gameDraftUploadKey\(seed,\s*localDigest,\s*json\)/);
  assert.doesNotMatch(code, /game-draft:\$\{seed\}:\$\{String\(item\.id\)/);
});

test("Code page run bar lives in the stage (aux page has no edit bar), not in toolbox", () => {
  const code = readFileSync("src/shell/game-editor/GameCodeStage.tsx", "utf8");
  assert.match(code, /<GameCodeRunBar/);
  assert.doesNotMatch(code, /toolbox:\s*\{/);
});
