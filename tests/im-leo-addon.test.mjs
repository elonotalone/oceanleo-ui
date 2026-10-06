// W06：输入框上的 leo 付款人选择。Team 群里 @leo 才出现；个人会话与普通群什么都不画。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const useUiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);
const clientStub = dataModule(`
  export class ImApiError extends Error {}
  export async function imFetch() { throw new Error("测试里不联网"); }
`);

const stubs = { "../../../i18n/ui/useUI": useUiStub, "./client": clientStub, "../../../lib/im/client": clientStub };
const addonUrl = await compileModule("src/shell/messages/leo/LeoComposerAddon.tsx", stubs);
const apiUrl = await compileModule("src/lib/im/leo-api.ts", stubs);
const addon = await import(addonUrl);
const api = await import(apiUrl);
const { LeoComposerAddon, LeoPayerSwitch, leoAddonEligible } = addon;

const ORG = "org-1";
function conv(over = {}) {
  return { id: "c1", kind: "team", org_id: ORG, leo_enabled: true, dissolved: false, ...over };
}
const noop = () => {};
const render = (element) => renderToStaticMarkup(element);
const checked = (html, kind) => {
  const tag = html.match(new RegExp(`<button[^>]*data-payer-kind="${kind}"[^>]*>`))?.[0] ?? "";
  return tag.includes('aria-checked="true"');
};

test("个人会话、普通群、没在 @leo 时：什么都不画", () => {
  const cases = [
    conv({ kind: "dm", org_id: null }),
    conv({ kind: "group", org_id: null }),
    conv({ kind: "project", org_id: null }),
  ];
  for (const c of cases) {
    assert.equal(render(React.createElement(LeoComposerAddon, { conversation: c, mentionActive: true, value: null, onChange: noop })), "");
  }
  assert.equal(
    render(React.createElement(LeoComposerAddon, { conversation: conv(), mentionActive: false, value: null, onChange: noop })),
    "",
  );
});

test("leoAddonEligible：Team 群、没关 leo、没解散、正在 @", () => {
  assert.equal(leoAddonEligible(conv(), true), true);
  assert.equal(leoAddonEligible(conv(), false), false);
  assert.equal(leoAddonEligible(conv({ org_id: null }), true), false);
  assert.equal(leoAddonEligible(conv({ leo_enabled: false }), true), false);
  assert.equal(leoAddonEligible(conv({ dissolved: true }), true), false);
  assert.equal(leoAddonEligible(conv({ kind: "talent" }), true), false);
});

test("付款人状态还没读到之前不画（不闪一个不确定的控件）", () => {
  assert.equal(
    render(React.createElement(LeoComposerAddon, { conversation: conv(), mentionActive: true, value: null, onChange: noop })),
    "",
  );
});

test("切换控件：个人 / Team 钱包，当前项被标出，带 Team 名", () => {
  const option = { kind: "team", org_id: ORG, name: "海洋队", allowed: true };
  const personal = render(React.createElement(LeoPayerSwitch, { option, value: "personal", onSelect: noop }));
  assert.match(personal, /role="radiogroup"/);
  assert.match(personal, /这次谁付钱/);
  assert.equal(checked(personal, "personal"), true);
  assert.equal(checked(personal, "team"), false);
  assert.match(personal, /个人钱包/);
  assert.match(personal, /海洋队 钱包/);
  const team = render(React.createElement(LeoPayerSwitch, { option, value: "team", onSelect: noop }));
  assert.equal(checked(team, "team"), true);
  assert.equal(checked(team, "personal"), false);
});

test("Team 没有名字时退回「Team 钱包」", () => {
  const option = { kind: "team", org_id: ORG, name: "", allowed: true };
  assert.match(render(React.createElement(LeoPayerSwitch, { option, value: "personal", onSelect: noop })), /Team 钱包/);
});

test("选了哪个，onSelect 就收到哪个", () => {
  const option = { kind: "team", org_id: ORG, name: "海洋队", allowed: true };
  const element = LeoPayerSwitch({ option, value: "personal", onSelect: (kind) => picked.push(kind) });
  const picked = [];
  const buttons = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "button") buttons.push(node);
    for (const child of [].concat(node.props?.children ?? [])) walk(child);
  })(element);
  assert.equal(buttons.length, 2);
  for (const button of buttons) button.props.onClick();
  assert.deepEqual(picked, ["personal", "team"]);
});

test("teamOption：只认 Team 选项", () => {
  assert.equal(api.teamOption(null), null);
  assert.equal(api.teamOption({ enabled: true, payer_options: [{ kind: "personal" }], default_payer: "personal" }), null);
  const team = { kind: "team", org_id: ORG, name: "海洋队", allowed: true };
  assert.deepEqual(
    api.teamOption({ enabled: true, payer_options: [{ kind: "personal" }, team], default_payer: "personal" }),
    team,
  );
});

test("初始付款人：个人兜底，只有自己选过 / 全站记住了这个 Team 才默认 Team", () => {
  const option = { kind: "team", org_id: ORG, name: "海洋队", allowed: true };
  assert.deepEqual(api.initialPayerChoice({ option, remembered: "" }), { kind: "personal", org_id: null });
  assert.deepEqual(api.initialPayerChoice({ option, remembered: "别的团队" }), { kind: "personal", org_id: null });
  assert.deepEqual(api.initialPayerChoice({ option, remembered: ORG }), { kind: "team", org_id: ORG });
  assert.deepEqual(api.initialPayerChoice({ option, remembered: ORG, chosenHere: "personal" }), { kind: "personal", org_id: null });
  assert.deepEqual(api.initialPayerChoice({ option, remembered: "", chosenHere: "team" }), { kind: "team", org_id: ORG });
  assert.deepEqual(api.initialPayerChoice({ option, remembered: "", defaultPayer: "team" }), { kind: "team", org_id: ORG });
});

test("不能用这个 Team 的钱（被移出 / 停用）时，一律个人，哪怕之前记住过", () => {
  const option = { kind: "team", org_id: ORG, name: "海洋队", allowed: false };
  assert.deepEqual(api.initialPayerChoice({ option, remembered: ORG, chosenHere: "team" }), { kind: "personal", org_id: null });
});

test("发消息时只有选了 Team 钱包才带 leo_payer_org_id", () => {
  assert.deepEqual(api.payerRequestField(null), {});
  assert.deepEqual(api.payerRequestField({ kind: "personal", org_id: null }), {});
  assert.deepEqual(api.payerRequestField({ kind: "team", org_id: ORG }), { leo_payer_org_id: ORG });
  assert.deepEqual(api.payerRequestField({ kind: "team", org_id: null }), {});
});

test("leo-api 的网关调用走契约里的路径", async () => {
  const calls = [];
  const apiWithClient = await import(
    await compileModule("src/lib/im/leo-api.ts", {
      "./client": dataModule(`
        export class ImApiError extends Error {}
        export async function imFetch(path, init) {
          globalThis.__leoCalls.push({ path, init });
          return { ok: true, status: "cancelling", profile: { user_id: "u1" } };
        }
      `),
    })
  );
  globalThis.__leoCalls = calls;
  await apiWithClient.fetchLeoStatus("a b/c");
  await apiWithClient.cancelLeo("m1");
  assert.equal(calls[0].path, "/v1/im/leo/status?conversation_id=a%20b%2Fc");
  assert.equal(calls[1].path, "/v1/im/leo/cancel");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(calls[1].init.json, { message_id: "m1" });
  assert.equal(await apiWithClient.fetchMyUserId(), "u1");
  assert.equal(await apiWithClient.fetchMyUserId(), "u1");
  assert.equal(calls.filter((c) => c.path === "/v1/im/me").length, 1);
  delete globalThis.__leoCalls;
});

void reactUrl;
