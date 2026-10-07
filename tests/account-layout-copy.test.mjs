// W5：账户新画面 47 条中文原文必须有 16 语、非 CJK 无汉字、占位符与 support 邮箱不丢。

import assert from "node:assert/strict";
import test from "node:test";

const { LOCALES } = await import("../src/i18n/config.ts");
const { ACCOUNT_LAYOUT_SOURCE, ACCOUNT_LAYOUT_MESSAGES } = await import(
  "../src/i18n/ui/messages/account-layout-copy.ts"
);

const TRANSLATED = LOCALES.filter((locale) => locale !== "zh");
const KEYS = Object.values(ACCOUNT_LAYOUT_SOURCE);
const PLACEHOLDER = /\{[a-zA-Z]+\}/g;
const CJK = /[\u4e00-\u9fff]/;
const CJK_LOCALES = new Set(["zh", "zh-TW", "ja", "ko"]);
const FORBIDDEN = [
  "退出登录",
  "取消",
  "关闭",
  "邮箱",
  "加载中…",
  "免费计划",
  "当前设备",
  "账户",
];
const REQUIRED = [
  "全名",
  "更改",
  "用户 ID",
  "复制",
  "已复制。",
  "登录方式",
  "管理用于登录 OceanLeo 的第三方账号。",
  "管理",
  "已连接的设备",
  "查看并管理已登录 OceanLeo 的设备。",
  "删除账户",
  "这将删除你的账户和全部数据。",
  "删除后无法恢复。未用完的余额按退款政策处理。",
  "确认删除账户",
  "更改邮箱地址",
  "为了账户安全，请先完成两步验证。",
  "验证身份",
  "验证你的身份后才能继续。点击发送，验证码会发到 {email}",
  "输入验证码",
  "发送",
  "下一步",
  "新邮箱地址",
  "输入新的邮箱地址",
  "请写信到 support@oceanleo.com 申请注销。",
  "管理登录方式",
  "连接",
  "断开",
  "断开后将不能再用这个方式登录。",
  "至少保留一种登录方式。",
  "邮箱登录",
  "微信",
  "绑定失败，请稍后重试。",
  "已断开。",
  "已连接。",
  "其他设备",
  "如果无法识别某台设备，请将其移除并更改登录方式。",
  "没有其他已登录的设备。",
  "上次活动 {time}",
  "{n} 秒前",
  "上次活动 {m} 分钟前",
  "位置未知",
  "设备名称",
  "保存名称",
  "移除",
];

test("SOURCE 44 条且含任务书列出的原文，不含已有键", () => {
  assert.equal(KEYS.length, 44, `SOURCE 条数 ${KEYS.length}，应为 44`);
  assert.deepEqual([...KEYS].sort(), [...REQUIRED].sort());
  for (const key of FORBIDDEN) {
    assert.equal(KEYS.includes(key), false, `不该再写已有键：${key}`);
  }
});

test("assembleCopy 16 个非 zh locale 都在，译文非空", () => {
  assert.equal(TRANSLATED.length, 16);
  assert.equal(ACCOUNT_LAYOUT_MESSAGES.zh[KEYS[0]], KEYS[0]);
  for (const key of KEYS) {
    for (const locale of TRANSLATED) {
      const value = ACCOUNT_LAYOUT_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      assert.notEqual(String(value).trim(), "", `${locale} 译文是空串：${key}`);
    }
  }
});

test("英文对齐截图且无汉字；占位符与 support 邮箱不丢", () => {
  const en = ACCOUNT_LAYOUT_MESSAGES.en;
  assert.equal(en["全名"], "Full name");
  assert.equal(en["更改"], "Change");
  assert.equal(en["用户 ID"], "User ID");
  assert.equal(en["复制"], "Copy");
  assert.equal(en["登录方式"], "Sign-in methods");
  assert.equal(en["管理"], "Manage");
  assert.equal(en["已连接的设备"], "Connected devices");
  assert.equal(en["删除账户"], "Delete account");
  assert.equal(en["更改邮箱地址"], "Change email address");
  assert.equal(en["发送"], "Send");
  assert.equal(en["下一步"], "Next");
  assert.equal(en["管理登录方式"], "Manage sign-in methods");
  assert.equal(en["连接"], "Connect");
  assert.equal(en["断开"], "Disconnect");
  assert.equal(en["其他设备"], "Other devices");
  assert.equal(en["上次活动 {time}"], "Last active {time}");
  assert.equal(en["{n} 秒前"], "{n} seconds ago");
  assert.equal(en["上次活动 {m} 分钟前"], "Last active {m} minutes ago");
  assert.equal(en["移除"], "Remove");
  for (const key of KEYS) {
    const value = en[key];
    assert.equal(CJK.test(value), false, `英文仍有汉字：${key} → ${value}`);
    assert.notEqual(value, key, `英文等于中文原文：${key}`);
  }
  for (const key of KEYS) {
    const needed = key.match(PLACEHOLDER) || [];
    for (const locale of TRANSLATED) {
      const value = ACCOUNT_LAYOUT_MESSAGES[locale][key];
      for (const token of needed) {
        assert.ok(value.includes(token), `${locale} 丢了 ${token}：${key} → ${value}`);
      }
      if (key.includes("support@oceanleo.com")) {
        assert.ok(
          value.includes("support@oceanleo.com"),
          `${locale} 改了 support 邮箱：${value}`,
        );
      }
    }
  }
});

test("非 CJK 语种译文零汉字", () => {
  for (const locale of TRANSLATED) {
    if (CJK_LOCALES.has(locale)) continue;
    for (const key of KEYS) {
      const value = ACCOUNT_LAYOUT_MESSAGES[locale][key];
      assert.equal(CJK.test(value), false, `${locale} 译文有汉字：${key} → ${value}`);
    }
  }
});
