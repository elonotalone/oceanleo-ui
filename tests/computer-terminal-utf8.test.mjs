import assert from "node:assert/strict";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const { decodeTermB64, isTerminalProtocolReply } = await import(await compileModule("src/shell/cloud-computer/TerminalPanel.tsx", {
  "../../lib/auth/client": dataModule("export async function accessToken(){return null}"),
  "../../lib/cloud-computer-api": dataModule("export function terminalWsUrl(){return ''}"),
}));

test("terminal UTF-8 survives packet boundaries inside Chinese and emoji", () => {
  const source = "你好 🌊 café · مرحبا · 日本語\n";
  const bytes = Buffer.from(source, "utf8");
  for (let width = 1; width <= 7; width += 1) {
    const decoder = new TextDecoder();
    let result = "";
    for (let offset = 0; offset < bytes.length; offset += width) {
      result += decodeTermB64(bytes.subarray(offset, offset + width).toString("base64"), decoder);
    }
    result += decoder.decode();
    assert.equal(result, source, `packet width ${width}`);
  }
});

test("xterm OSC and DCS replies are not keystrokes", () => {
  assert.equal(isTerminalProtocolReply("\u001b]11;rgb:0a0a/0a0a/0a0a\u0007"), true);
  assert.equal(isTerminalProtocolReply("\u001b]7501;?\u0007"), true);
  assert.equal(isTerminalProtocolReply("\u001bP1$r0\u001b\\"), true);
  assert.equal(isTerminalProtocolReply("\u001b[A"), false);
  assert.equal(isTerminalProtocolReply("a"), false);
  assert.equal(isTerminalProtocolReply(""), false);
});

test("independent terminal streams do not share incomplete codepoints", () => {
  const a = new TextDecoder(), b = new TextDecoder();
  const bytes = Buffer.from("中");
  assert.equal(decodeTermB64(bytes.subarray(0, 1).toString("base64"), a), "");
  assert.equal(decodeTermB64(Buffer.from("other").toString("base64"), b), "other");
  assert.equal(decodeTermB64(bytes.subarray(1).toString("base64"), a), "中");
});
