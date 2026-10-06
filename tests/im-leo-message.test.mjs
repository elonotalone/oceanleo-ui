// W06：leo 在会话里的回复渲染、提示行、停止按钮的出现条件、文案 17 种语言写全。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const useUiStub = dataModule(`
  export function useUI() {
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);
const clientStub = dataModule(`
  export class ImApiError extends Error {}
  export async function imFetch() { throw new Error("测试里不联网"); }
`);
const hrefStub = dataModule(`export function portalHref(path) { return "https://portal.test" + path; }`);

// Markdown 用真的：契约 §10 要求 leo 的正文不渲染原始 HTML，这条必须对着真实组件判。
const bodyUrl = await compileModule("src/shell/messages/leo/LeoMessageBody.tsx", {
  "../../../i18n/ui/useUI": useUiStub,
  "../../../lib/im/client": clientStub,
  "./client": clientStub,
  "../../cloud-computer/server-page/href": hrefStub,
});
const body = await import(bodyUrl);
const { LeoMessageBody, LeoNoticeLine, leoDisplayText, leoCanStop, leoTriggerId } = body;

function message(over = {}) {
  return {
    id: "m1", conversation_id: "c1", seq: 9, sender_id: null, sender_kind: "leo", kind: "leo",
    body: "", mentions: [], mention_all: false, mention_leo: false,
    quote: { message_id: "t1", sender_id: "alice", preview: "@leo 总结", recalled: false },
    thread_root_id: null, thread: null, attachments: [], card: null, transcript: null,
    reactions: [], pinned: false, edited_at: null, recalled_at: null, recalled_by: null,
    hidden_reason: null, leo: { status: "done", payer: "personal" },
    mention_reads: null, client_id: null, created_at: "2026-10-06T00:00:00Z",
    ...over,
  };
}
const render = (props) => renderToStaticMarkup(React.createElement(LeoMessageBody, props));

test("画哪段字：流式取更长的，结束以落库正文为准", () => {
  const streaming = (b) => message({ body: b, leo: { status: "streaming", payer: "personal" } });
  assert.equal(leoDisplayText(streaming(""), "你好"), "你好");
  assert.equal(leoDisplayText(streaming("你好世界"), "你好"), "你好世界"); // 晚到的人：落库的更全
  assert.equal(leoDisplayText(streaming(""), undefined), "");
  assert.equal(leoDisplayText(message({ body: "完整正文" }), "半截"), "完整正文");
  assert.equal(leoDisplayText(message({ body: "", leo: { status: "failed", payer: "personal" } }), "残句"), "残句");
});

test("生成中、还没出字：显示「leo 正在回复…」", () => {
  const out = render({ message: message({ leo: { status: "streaming", payer: "personal" } }) });
  assert.match(out, /data-leo-status="streaming"/);
  assert.match(out, /data-leo-thinking/);
  assert.match(out, /leo 正在回复…/);
});

test("生成中、有字：照出来；已完成：照出来", () => {
  const live = render({
    message: message({ leo: { status: "streaming", payer: "personal" } }),
    streamingText: "第一段**重点**\n\n第二段还没写完",
  });
  assert.match(live, /第一段/);
  assert.match(live, /<strong>重点<\/strong>/); // 已闭合的块按 Markdown 画
  assert.match(live, /第二段还没写完/); // 没闭合的尾巴按纯文本画
  assert.doesNotMatch(live, /data-leo-thinking/);
  const done = render({ message: message({ body: "# 标题\n\n- 一\n- 二" }) });
  assert.match(done, /<h1[^>]*>标题<\/h1>/);
  assert.match(done, /<li[^>]*>[^]*?一/);
  assert.doesNotMatch(done, /data-leo-footer/);
});

test("leo 正文里的原始 HTML 一律不渲染成元素", () => {
  const evil = '<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">点</a>';
  for (const status of ["done", "streaming"]) {
    const out = render({ message: message({ body: evil, leo: { status, payer: "personal" } }), streamingText: evil });
    assert.doesNotMatch(out, /<script/i);
    assert.doesNotMatch(out, /<img[^>]*onerror/i);
    assert.doesNotMatch(out, /href="javascript:/i);
  }
});

test("失败：保留已出的字，红字说明；被打断的另说", () => {
  const failed = render({ message: message({ body: "写了一半", leo: { status: "failed", payer: "personal", error_code: "model_error" } }) });
  assert.match(failed, /写了一半/);
  assert.match(failed, /data-leo-footer="failed"/);
  assert.match(failed, /leo 出错了，这条回复没有完成。/);
  const interrupted = render({ message: message({ body: "", leo: { status: "failed", payer: "personal", error_code: "interrupted" } }) });
  assert.match(interrupted, /这条回复被中断了，没有完成。/);
  assert.doesNotMatch(interrupted, /leo 出错了/);
});

test("取消：保留已出的字，写「已停止生成」", () => {
  const out = render({ message: message({ body: "前半句", leo: { status: "cancelled", payer: "personal" } }) });
  assert.match(out, /前半句/);
  assert.match(out, /data-leo-footer="cancelled"/);
  assert.match(out, /已停止生成/);
});

test("Team 钱包付费的回复写明；个人付费不写；未完成不写", () => {
  assert.match(render({ message: message({ body: "好", leo: { status: "done", payer: "team" } }) }), /由 Team 钱包付费/);
  assert.doesNotMatch(render({ message: message({ body: "好" }) }), /Team 钱包/);
  assert.doesNotMatch(
    render({ message: message({ body: "好", leo: { status: "failed", payer: "team" } }) }),
    /由 Team 钱包付费/,
  );
});

test("停止按钮：只有触发人、且还在生成时才出现", () => {
  const streaming = message({ leo: { status: "streaming", payer: "personal" } });
  assert.equal(leoTriggerId(streaming), "alice");
  assert.equal(leoCanStop(streaming, "alice"), true);
  assert.equal(leoCanStop(streaming, "bob"), false);
  assert.equal(leoCanStop(streaming, null), false);
  assert.equal(leoCanStop(message(), "alice"), false);
  assert.equal(leoCanStop(message({ leo: { status: "cancelled", payer: "personal" } }), "alice"), false);
  assert.equal(leoCanStop(message({ quote: null, leo: { status: "streaming", payer: "personal" } }), "alice"), false);
});

test("提示行：四种代码各一句，只有余额不足带充值入口，都标「仅你可见」", () => {
  const html = (code) => renderToStaticMarkup(React.createElement(LeoNoticeLine, { code }));
  const balance = html("insufficient_balance");
  assert.match(balance, /余额不足，leo 没有回复。/);
  assert.match(balance, /<a [^>]*href="https:\/\/portal\.test\/settings\/billing"/);
  assert.match(balance, /target="_blank"/);
  assert.match(balance, /rel="noopener noreferrer"/);
  assert.match(balance, /去充值/);
  assert.match(html("disabled"), /这个会话里 leo 已被关闭。/);
  assert.match(html("queued"), /前面还有一轮 leo 在回复，轮到你时会自动开始。/);
  assert.match(html("failed"), /leo 这次没能开始回复，请稍后再试。/);
  for (const code of ["insufficient_balance", "disabled", "queued", "failed"]) {
    const out = html(code);
    assert.match(out, new RegExp(`data-leo-notice="${code}"`));
    assert.match(out, /仅你可见/);
    if (code !== "insufficient_balance") assert.doesNotMatch(out, /<a /);
  }
});

test("@ 候选里的 leo", async () => {
  const { LEO_MENTION } = await import(await compileModule("src/shell/messages/leo/leo-mention.ts", {}));
  assert.deepEqual(LEO_MENTION, { id: "leo", label: "leo" });
});

// ── 文案 ────────────────────────────────────────────────────────────────
// im-leo-copy.ts 借用 shell-overhaul-copy-shared 的 assembleCopy。编译台把无扩展名的相对导入
// 交给 node 原生加载会找不到，所以这里给它一份同语义的替身（17 语种表、zh 取原文）。
const copyStubs = {
  "./shell-overhaul-copy-shared": dataModule(`
    const LOCALES = ["de","en","es","es-419","fr","it","pt-BR","pt-PT","vi","tr","zh","zh-TW","ja","ko","ar","th","hi"];
    export function assembleCopy(source, translations) {
      return Object.fromEntries(LOCALES.map((locale) => [
        locale,
        Object.fromEntries(Object.keys(source).map((name) => [
          source[name],
          (locale === "zh" ? source : translations[locale])[name],
        ])),
      ]));
    }
  `),
};
const LOCALES = ["de", "en", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi", "tr", "zh", "zh-TW", "ja", "ko", "ar", "th", "hi"];

test("文案：17 种语言写全，占位符不丢", async () => {
  const { IM_LEO_ZH, IM_LEO_MESSAGES } = await import(await compileModule("src/i18n/ui/messages/im-leo-copy.ts", copyStubs));
  assert.deepEqual(Object.keys(IM_LEO_MESSAGES).sort(), [...LOCALES].sort());
  const zhKeys = Object.values(IM_LEO_ZH);
  for (const locale of LOCALES) {
    const table = IM_LEO_MESSAGES[locale];
    assert.deepEqual(Object.keys(table).sort(), [...zhKeys].sort(), locale);
    for (const [zh, translated] of Object.entries(table)) {
      assert.ok(translated && translated.trim(), `${locale}: ${zh} 为空`);
      if (locale !== "zh" && locale !== "zh-TW") assert.notEqual(translated, zh, `${locale}: ${zh} 没翻译`);
      assert.equal(translated.includes("{name}"), zh.includes("{name}"), `${locale}: ${zh} 的 {name} 占位符`);
    }
  }
});

test("文案：组件里每个 tt() 原文，要么在 W06 分表里，要么是词典里早就有的键", async () => {
  const { IM_LEO_ZH } = await import(await compileModule("src/i18n/ui/messages/im-leo-copy.ts", copyStubs));
  const mine = new Set(Object.values(IM_LEO_ZH));
  const existing = new Set();
  const dir = "src/i18n/ui/messages";
  const others = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && f !== "im-leo-copy.ts")
    .map((f) => readFileSync(`${dir}/${f}`, "utf8"));
  const literals = new Set();
  for (const file of [
    "src/shell/messages/leo/LeoComposerAddon.tsx",
    "src/shell/messages/leo/LeoMessageBody.tsx",
  ]) {
    for (const match of readFileSync(file, "utf8").matchAll(/\btt\(\s*"([^"]+)"/g)) literals.add(match[1]);
  }
  assert.ok(literals.size >= 12, `只找到 ${literals.size} 条`);
  for (const literal of literals) {
    if (mine.has(literal)) continue;
    assert.ok(others.some((text) => text.includes(`"${literal}"`)), `「${literal}」既不在 im-leo-copy 也不在词典里`);
    existing.add(literal);
  }
  assert.deepEqual([...existing].sort(), ["个人钱包", "去充值", "停止", "已停止生成", "这次谁付钱"].sort());
});
