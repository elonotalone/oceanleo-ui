// 生成合成内容标识（U2）：开关、复制提示语、气泡角标、docx 自定义属性。
//
// 跑法（必须带 loader，与仓里其它 TS 测试相同）：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/aigc-label.test.mjs

import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import JSZip from "jszip";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  AIGC_LABEL_TEXT,
  AIGC_SERVICE_PROVIDER,
  AIGC_TEXT_NOTICE,
  aigcLabelActive,
  aigcMetadata,
  withAigcTextNotice,
} from "../src/contracts/aigc-label.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";
import { markdownToShareBlocks } from "../src/shell/share/share-blocks.ts";
import { shareMessagesToDocxBlob } from "../src/shell/share/share-docx.ts";

const AIGC_ENV = "NEXT_PUBLIC_OCEANLEO_AIGC_LABEL";

function setHost(host) {
  const location = { host, href: `https://${host}/` };
  if (typeof globalThis.window === "undefined") {
    globalThis.window = { location };
    return;
  }
  try {
    globalThis.window.location = location;
  } catch {
    Object.defineProperty(globalThis.window, "location", {
      configurable: true,
      writable: true,
      value: location,
    });
  }
}

function setAigcEnv(value) {
  if (value == null) delete process.env[AIGC_ENV];
  else process.env[AIGC_ENV] = value;
}

function resetSwitch() {
  setAigcEnv(undefined);
  setHost("agent.oceanleo.com");
}

resetSwitch();

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);

const clipboardStub = dataModule(`
  export async function writeClipboardText() { return true; }
`);

const { AgentTranscriptBubble } = await import(
  await compileModule("src/shell/AgentTranscriptBubble.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
  })
);

function markup(message, extra = {}) {
  return renderToStaticMarkup(
    React.createElement(AgentTranscriptBubble, { message, ...extra }),
  );
}

const assistantText = {
  id: 1,
  role: "assistant",
  kind: "text",
  content: "这是一条助手回答",
};

test("aigcLabelActive：无 env 时 com 家族不激活、cn 家族激活", () => {
  setAigcEnv(undefined);
  setHost("agent.oceanleo.com");
  assert.equal(aigcLabelActive(), false);
  setHost("agent.oceanleo.cn");
  assert.equal(aigcLabelActive(), true);
});

test("aigcLabelActive：NEXT_PUBLIC_OCEANLEO_AIGC_LABEL=0 覆盖 cn 家族", () => {
  setHost("agent.oceanleo.cn");
  setAigcEnv("0");
  assert.equal(aigcLabelActive(), false);
});

test("aigcLabelActive：NEXT_PUBLIC_OCEANLEO_AIGC_LABEL=1 覆盖 com 家族", () => {
  setHost("agent.oceanleo.com");
  setAigcEnv("1");
  assert.equal(aigcLabelActive(), true);
});

test("withAigcTextNotice：开关关原样返回，开关开前置且幂等", () => {
  const body = "正文第一段";
  setAigcEnv("0");
  assert.equal(withAigcTextNotice(body), body);
  setAigcEnv("1");
  const once = withAigcTextNotice(body);
  assert.equal(once, `${AIGC_TEXT_NOTICE}\n\n${body}`);
  assert.equal(withAigcTextNotice(once), once);
  assert.equal(withAigcTextNotice(AIGC_TEXT_NOTICE), AIGC_TEXT_NOTICE);
});

test("aigcMetadata：四项制作要素", () => {
  const meta = aigcMetadata("msg-42");
  assert.equal(meta.AIGC, "true");
  assert.equal(meta.ServiceProvider, AIGC_SERVICE_PROVIDER);
  assert.equal(meta.ContentID, "msg-42");
  assert.match(meta.ProducedAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

test("AgentTranscriptBubble：cn 家族助手消息含 aigc-label，用户消息不含", () => {
  setAigcEnv(undefined);
  setHost("agent.oceanleo.cn");
  const assistant = markup(assistantText);
  assert.match(assistant, /data-testid="aigc-label"/);
  assert.match(assistant, new RegExp(`>${AIGC_LABEL_TEXT}<`));
  const user = markup({
    id: 2,
    role: "user",
    kind: "text",
    content: "请写一段说明",
  });
  assert.doesNotMatch(user, /data-testid="aigc-label"/);
});

test("AgentTranscriptBubble：com 家族助手消息不含 aigc-label", () => {
  setAigcEnv(undefined);
  setHost("agent.oceanleo.com");
  const html = markup(assistantText);
  assert.doesNotMatch(html, /data-testid="aigc-label"/);
});

test("AgentTranscriptBubble：流式中不显示角标，结束后显示", () => {
  setAigcEnv(undefined);
  setHost("agent.oceanleo.cn");
  assert.doesNotMatch(
    markup(assistantText, { streaming: true }),
    /data-testid="aigc-label"/,
  );
  assert.match(markup(assistantText, { streaming: false }), /data-testid="aigc-label"/);
});

test("AgentTranscriptBubble：env=0 覆盖 cn 家族后 DOM 无角标", () => {
  setHost("agent.oceanleo.cn");
  setAigcEnv("0");
  assert.doesNotMatch(markup(assistantText), /data-testid="aigc-label"/);
});

const SAMPLE_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "hello" }],
    },
  ],
};

async function docxCustomXml(env, contentId) {
  setAigcEnv(env);
  setHost("agent.oceanleo.com");
  const blob = await tiptapJsonToDocxBlob("aigc", SAMPLE_DOC, { contentId });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file("docProps/custom.xml");
  const core = zip.file("docProps/core.xml");
  return {
    custom: file ? await file.async("string") : "",
    core: core ? await core.async("string") : "",
  };
}

test("docx 导出：开关开时 custom.xml 含 ContentID，core 含提示语", async () => {
  const { custom, core } = await docxCustomXml("1", "doc-xyz");
  assert.match(custom, /name="ContentID"/);
  assert.match(custom, /doc-xyz/);
  assert.match(custom, /name="AIGC"/);
  assert.match(custom, /name="ServiceProvider"/);
  assert.match(custom, /name="ProducedAt"/);
  assert.match(core, new RegExp(AIGC_TEXT_NOTICE));
});

test("docx 导出：开关关时 custom.xml 不含 ContentID", async () => {
  const { custom, core } = await docxCustomXml("0", "doc-xyz");
  assert.doesNotMatch(custom, /ContentID/);
  assert.doesNotMatch(core, new RegExp(AIGC_TEXT_NOTICE));
});

async function shareDocxCustomXml(env, contentId) {
  setAigcEnv(env);
  setHost("agent.oceanleo.com");
  const blob = await shareMessagesToDocxBlob({
    title: "对话",
    brand: "Generated by OceanLeo",
    contentId,
    messages: [{ speaker: "OceanLeo", blocks: markdownToShareBlocks("hello") }],
  });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file("docProps/custom.xml");
  const core = zip.file("docProps/core.xml");
  return {
    custom: file ? await file.async("string") : "",
    core: core ? await core.async("string") : "",
  };
}

test("对话分享 docx：开关开时 custom.xml 含四项要素，core 含提示语", async () => {
  const { custom, core } = await shareDocxCustomXml("1", "conv-42");
  for (const name of ["AIGC", "ServiceProvider", "ContentID", "ProducedAt"]) {
    assert.match(custom, new RegExp(`name="${name}"`));
  }
  assert.match(custom, /conv-42/);
  assert.match(core, new RegExp(AIGC_TEXT_NOTICE));
});

test("对话分享 docx：开关关时没有自定义属性，描述仍是品牌行", async () => {
  const { custom, core } = await shareDocxCustomXml("0", "conv-42");
  assert.doesNotMatch(custom, /ContentID/);
  assert.doesNotMatch(core, new RegExp(AIGC_TEXT_NOTICE));
  assert.match(core, /Generated by OceanLeo/);
});
