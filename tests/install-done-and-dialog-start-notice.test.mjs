// InstallSheet and MessageList are deleted with the agent-dialog card (install now runs through
// native-surface/useProgramAccess); the notice copy and actions stay shared.
import assert from "node:assert/strict";
import test from "node:test";

import { LOCALES } from "../src/i18n/config.ts";
import { ACP_CARD_MESSAGES } from "../src/i18n/ui/messages/acp-card-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { isOpaqueDialogDidNotStart, noticeAction, noticeCopy, visibleNoticeCopy } from "../src/shell/cloud-computer/agent-dialog/notice.ts";

const SESSION_NOT_OPENED = "程序没能开新会话。";
const STILL_NEEDS_INSTALL = "这个程序的对话组件还没就绪。安装会一并补齐。";
const tt = (zh, vars) => {
  if (!vars) return zh;
  return zh.replace(/\{(\w+)\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
};

test("acp_start_failed：一句话，没有安装按钮", () => {
  assert.equal(noticeCopy(tt, "acp_start_failed"), SESSION_NOT_OPENED);
  assert.equal(noticeCopy(tt, "acp_start_failed", false), SESSION_NOT_OPENED);
  assert.equal(isOpaqueDialogDidNotStart(noticeCopy(tt, "acp_start_failed")), false);
  assert.equal(noticeAction("acp_start_failed", false), null);
  assert.equal(noticeAction("acp_start_failed", true), null);
  assert.equal(
    visibleNoticeCopy(tt, "acp_start_failed", true, "The dialog did not start."),
    SESSION_NOT_OPENED,
  );
  assert.equal(
    visibleNoticeCopy(tt, "acp_start_failed", true, "工作目录必须是这台电脑上已有的绝对路径。"),
    "工作目录必须是这台电脑上已有的绝对路径。",
  );
});

test("acp_unavailable：程序已装也提供补装缺失对话组件的入口", () => {
  assert.equal(noticeCopy(tt, "acp_unavailable", false), STILL_NEEDS_INSTALL);
  assert.equal(noticeAction("acp_unavailable", false), "install");
  assert.equal(noticeCopy(tt, "acp_unavailable", true), STILL_NEEDS_INSTALL);
  assert.equal(noticeAction("acp_unavailable", true), "install");
  assert.equal(noticeCopy(tt, "acp_unavailable", null), STILL_NEEDS_INSTALL);
  assert.equal(noticeAction("acp_unavailable", null), "install");
  assert.equal(noticeAction("program_missing", null), "install");
  assert.equal(noticeAction("dialog_unreachable"), "retry");
  assert.equal(noticeAction("computer_offline"), "retry");
  assert.equal(noticeAction("computer_reconnecting"), "retry");
});

test("电脑页从不显示 The dialog did not start", () => {
  for (const locale of LOCALES) {
    const value = ACP_CARD_MESSAGES[locale][SESSION_NOT_OPENED] ?? UI_MESSAGES[locale]?.[SESSION_NOT_OPENED];
    assert.equal(typeof value, "string", locale);
    assert.equal(value.length > 0, true, locale);
    assert.equal(isOpaqueDialogDidNotStart(value), false, locale);
  }
  assert.equal(ACP_CARD_MESSAGES.en[SESSION_NOT_OPENED], UI_MESSAGES.en[SESSION_NOT_OPENED]);
  assert.equal(UI_MESSAGES.en[SESSION_NOT_OPENED], "The program could not open a new session.");
  assert.equal(UI_MESSAGES.en["对话没有启动。"], "The program could not open a new session.");
  assert.notEqual(UI_MESSAGES.en["对话没有启动。"], "The dialog did not start.");
});
