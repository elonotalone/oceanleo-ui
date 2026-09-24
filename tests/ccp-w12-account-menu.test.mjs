import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/shell/AccountMenu.tsx", import.meta.url), "utf8");

test("AccountMenu exposes identity, balance, settings entries, links and sign out", () => {
  for (const text of ["data-account-identity", "data-identity-switch", "余额", "账户", "个性化", "设置", "主页", "获取帮助", "使用文档", "退出登录"]) {
    assert.match(source, new RegExp(text));
  }
  assert.match(source, /IdentitySwitchChevrons/);
  assert.doesNotMatch(source, /⇅/);
  assert.match(source, /signedIn \? <>/);
  assert.match(source, /listMyOrgs\(\)/);
  assert.match(source, /persistPayerOrgId\(id\)/);
  assert.match(source, /external/);
  assert.match(source, /side="right"/);
});

test("AccountMenu handles organization lookup failure as personal identity", () => {
  assert.match(source, /catch\(\(\) =>/);
  assert.match(source, /setOrgs\(\[\]\)/);
  assert.match(source, /tt\("个人"\)/);
});
