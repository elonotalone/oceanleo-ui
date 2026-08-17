/**
 * 人才市场 v1（W13）：把「叫真人」这条链上最容易被悄悄改坏的三条产品判据钉住。
 *
 *   1. 上下文是**白名单**：调用方交出去的 ref 会被去空、去重、截到合同 §3.1 的 50 条上限，
 *      而且发起弹窗**默认一条都不勾**——「顺手帮用户全选」是回归，不是便利。
 *   2. agent 雇人的默认态是**最保守**的：总开关关、两个上限都是 0、每次都要人确认；
 *      任何脏上限归 0（= 请不动人），绝不能被当成「无限」。
 *   3. 人类复核入口必须在：每个 decision 都要有中文说法，`pending_confirmation` 要能被推翻。
 *
 * 组件本身要 DOM 才能渲染，这里改为对源码断言那几条判据的存在——它们正是 V1/V2 会打的点。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_AGENT_HIRING_POLICY,
  HANDOFF_BRIEF_MAX_LENGTH,
  HANDOFF_CONTEXT_MAX_ITEMS,
  HANDOFF_ORIGIN_REF_MAX_LENGTH,
  fenFromYuanInput,
  formatFen,
  normalizeAgentHiringPolicy,
  normalizeHandoffContext,
} from "../src/api/talent-handoff.ts";

function source(relative) {
  return readFileSync(
    fileURLToPath(new URL(`../src/${relative}`, import.meta.url)),
    "utf8",
  );
}

const DIALOG = source("shell/HumanHandoffDialog.tsx");
const BUTTON = source("shell/HumanHandoffButton.tsx");
const STATUS = source("shell/HumanHandoffStatus.tsx");
const PANEL = source("shell/AgentHiringPolicyPanel.tsx");
const CLIENT = source("api/talent-handoff.ts");

/* ------------------------------------------------------------------ *
 * 1. 上下文白名单
 * ------------------------------------------------------------------ */

test("白名单收口：去空、去重、按合同截到 50 条", () => {
  assert.equal(HANDOFF_CONTEXT_MAX_ITEMS, 50);
  assert.equal(HANDOFF_BRIEF_MAX_LENGTH, 4000);
  assert.equal(HANDOFF_ORIGIN_REF_MAX_LENGTH, 500);

  const normalized = normalizeHandoffContext({
    messages: [" 7 ", "7", "", "   ", "8"],
    artifacts: Array.from({ length: 60 }, (_, i) => `a${i}`),
  });
  assert.deepEqual(normalized.messages, ["7", "8"]);
  assert.equal(normalized.artifacts.length, HANDOFF_CONTEXT_MAX_ITEMS);
  assert.equal(normalized.artifacts[0], "a0");
});

test("白名单收口：没给 context 也不会变成「把整段会话都给出去」", () => {
  assert.deepEqual(normalizeHandoffContext(undefined), {
    messages: [],
    artifacts: [],
  });
});

test("发起弹窗默认一条上下文都不勾", () => {
  assert.match(
    DIALOG,
    /useState<Set<string>>\(new Set\(\)\)/,
    "选中集合的初值必须是空 Set",
  );
  // 「全选 / 一键把整个会话给出去」这类捷径在这一屏是被明确否决的。
  assert.doesNotMatch(DIALOG, /全选|selectAll|checked=\{true\}/);
});

test("入口按钮只摘候选，不预勾选，也不授权没有 durable id 的产物", () => {
  assert.match(BUTTON, /message\.id <= 0\) continue/);
  assert.match(BUTTON, /artifact\?\.id/);
  assert.doesNotMatch(BUTTON, /selected|checked/);
});

test("撤回授权取的是服务端认账的授权面，不是本地勾选状态", () => {
  assert.match(STATUS, /getHandoffContext\(/);
  assert.match(STATUS, /revokeHandoffContext\(/);
  assert.match(STATUS, /全部收回/);
});

/* ------------------------------------------------------------------ *
 * 2. agent 雇人的默认态
 * ------------------------------------------------------------------ */

test("默认策略是最保守的那一份，且冻结", () => {
  assert.deepEqual({ ...DEFAULT_AGENT_HIRING_POLICY }, {
    enabled: false,
    per_request_cap_fen: 0,
    daily_cap_fen: 0,
    allowed_categories: [],
    require_confirmation: true,
  });
  assert.ok(Object.isFrozen(DEFAULT_AGENT_HIRING_POLICY));
});

test("脏上限一律归 0（= 请不动人），不许被当成无限", () => {
  for (const dirty of [NaN, -1, 1.5, Infinity, "100", null, undefined]) {
    const policy = normalizeAgentHiringPolicy({
      enabled: true,
      per_request_cap_fen: dirty,
      daily_cap_fen: dirty,
    });
    assert.equal(policy.per_request_cap_fen, 0, `${String(dirty)} 应归 0`);
    assert.equal(policy.daily_cap_fen, 0, `${String(dirty)} 应归 0`);
  }
});

test("总开关只有显式 true 才开；每次确认只有显式 false 才关", () => {
  assert.equal(normalizeAgentHiringPolicy({}).enabled, false);
  assert.equal(normalizeAgentHiringPolicy({ enabled: "yes" }).enabled, false);
  assert.equal(normalizeAgentHiringPolicy({ enabled: true }).enabled, true);
  assert.equal(normalizeAgentHiringPolicy({}).require_confirmation, true);
  assert.equal(
    normalizeAgentHiringPolicy({ require_confirmation: 0 }).require_confirmation,
    true,
    "0 这种脏值不算「用户关掉了确认」",
  );
  assert.equal(
    normalizeAgentHiringPolicy({ require_confirmation: false })
      .require_confirmation,
    false,
  );
});

test("策略读不到时，面板回落到最保守默认值而不是画成开着的", () => {
  assert.match(PANEL, /\.\.\.DEFAULT_AGENT_HIRING_POLICY/);
  assert.match(PANEL, /normalizeAgentHiringPolicy\(/);
});

/* ------------------------------------------------------------------ *
 * 3. 人类复核入口（欧盟 (EU) 2024/2831 算法管理）
 * ------------------------------------------------------------------ */

test("五个 decision 都有中文说法，未知码兜底不吞", () => {
  for (const decision of [
    "auto_allowed",
    "pending_confirmation",
    "blocked_by_cap",
    "blocked_by_category",
    "blocked_by_policy_off",
  ]) {
    assert.match(PANEL, new RegExp(`case "${decision}"`), decision);
  }
  assert.match(PANEL, /default:\s*\n\s*return \{ label: String\(decision\)/);
});

test("pending_confirmation 能被人推翻，且被挡住的请求也进时间线", () => {
  assert.match(PANEL, /overrideAgentHiringEvent\(event\.id, action\)/);
  assert.match(PANEL, /"approve"\)/);
  assert.match(PANEL, /"reject"\)/);
  assert.match(PANEL, /listAgentHiringEvents\(/);
  assert.match(PANEL, /包括被挡住的/);
});

/* ------------------------------------------------------------------ *
 * 4. 金额与红线
 * ------------------------------------------------------------------ */

test("金额一律 fen；元输入的脏值一律 0 = 面议", () => {
  assert.equal(formatFen(1234), "¥12.34");
  assert.equal(formatFen(1200), "¥12");
  assert.equal(formatFen(-5), "¥0");
  assert.equal(fenFromYuanInput("12.34"), 1234);
  assert.equal(fenFromYuanInput(""), 0);
  assert.equal(fenFromYuanInput("abc"), 0);
  assert.equal(fenFromYuanInput("-3"), 0);
});

test("红线：不碰跨域面、不出现抽成文案、人那层不叫仲裁", () => {
  for (const [name, text] of [
    ["client", CLIENT],
    ["dialog", DIALOG],
    ["button", BUTTON],
    ["status", STATUS],
    ["panel", PANEL],
  ]) {
    assert.doesNotMatch(text, /https?:\/\//, `${name} 不许硬编码域名`);
    assert.doesNotMatch(text, /dangerouslySetInnerHTML/, `${name} 不许注入点`);
    assert.doesNotMatch(text, /postMessage|iframe|cookieDomain/, name);
    assert.doesNotMatch(text, /仲裁|arbitration|arbitrator/, `${name} 红线 7`);
    assert.doesNotMatch(text, /抽成|服务费|佣金|platform_fee/, `${name} 红线 5`);
  }
  // 传输层必须走包内既有的 authed（自带网关 base + Bearer），不新造 fetch。
  assert.match(CLIENT, /import \{ authed/);
  assert.doesNotMatch(CLIENT, /\bfetch\(/);
});
