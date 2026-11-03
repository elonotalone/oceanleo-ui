import assert from "node:assert/strict";
import test from "node:test";
import { compileModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { RD_GATEWAY_MESSAGES } from "../src/i18n/ui/messages/rd-gateway-copy.ts";

const { remoteDesktopErrorCopy, REMOTE_FATAL_CODES } = await import(
  await compileModule("src/pages/remote-desktop-input.ts", {}),
);

test("recent disconnect and old offline codes map to distinct, honest messages", () => {
  const recovering = remoteDesktopErrorCopy("remote_desktop_device_reconnecting", 409);
  const offline = remoteDesktopErrorCopy("remote_desktop_unavailable", 409);
  assert.equal(recovering, "这台电脑上的 OceanLeo 刚断开，正在等待它恢复。");
  assert.match(offline, /已离线/);
  for (const copy of [recovering, offline]) assert.doesNotMatch(copy, /另一个|版本太旧|更新/);
  assert.notEqual(recovering, offline);
  assert.ok(REMOTE_FATAL_CODES.has("remote_desktop_device_reconnecting"));
  assert.ok(REMOTE_FATAL_CODES.has("remote_desktop_unavailable"));
});

test("all locales translate both codes, with traditional Chinese and English fallback", () => {
  for (const code of ["remote_desktop_device_reconnecting", "remote_desktop_unavailable"]) {
    const source = remoteDesktopErrorCopy(code, 409);
    assert.equal(RD_GATEWAY_MESSAGES.zh[source], source);
    assert.match(RD_GATEWAY_MESSAGES["zh-TW"][source], /這台電腦/);
    for (const locale of LOCALES) {
      assert.ok(RD_GATEWAY_MESSAGES[locale][source], `${locale}: ${code}`);
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.equal(RD_GATEWAY_MESSAGES[locale][source], RD_GATEWAY_MESSAGES.en[source]);
        assert.doesNotMatch(RD_GATEWAY_MESSAGES[locale][source], /\p{Script=Han}/u);
      }
    }
  }
});

test("last-seen label preserves the time placeholder in every locale", () => {
  for (const locale of LOCALES) {
    const label = RD_GATEWAY_MESSAGES[locale]["最后在线：{time}"];
    assert.match(label, /\{time\}/);
    if (locale !== "zh" && locale !== "zh-TW") assert.equal(label, "Last seen: {time}");
  }
});
