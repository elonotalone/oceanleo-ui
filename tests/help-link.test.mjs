import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { helpCenterUrl, isHelpCenterHost } from "../src/lib/help-url.ts";

test(".com 子站 → help.oceanleo.com", () => {
  assert.equal(
    helpCenterUrl({ host: "website.oceanleo.com" }),
    "https://help.oceanleo.com/",
  );
});

test(".cn 子站 → help.oceanleo.cn", () => {
  assert.equal(
    helpCenterUrl({ host: "website.oceanleo.cn" }),
    "https://help.oceanleo.cn/",
  );
  assert.equal(
    helpCenterUrl({ host: "oceanleo.cn" }),
    "https://help.oceanleo.cn/",
  );
});

test("localhost → help.oceanleo.com", () => {
  assert.equal(
    helpCenterUrl({ host: "localhost:3000" }),
    "https://help.oceanleo.com/",
  );
});

test("LeoDev 预览 host → help.oceanleo.com", () => {
  assert.equal(
    helpCenterUrl({
      host: "p-9817b57ea19b4977191526fb2ebf774c.dev.oceanleo.com",
    }),
    "https://help.oceanleo.com/",
  );
});

test("siteKey + from 按顺序编码进 query", () => {
  const from = "https://agent.oceanleo.com/workspace?x=1";
  assert.equal(
    helpCenterUrl({
      host: "agent.oceanleo.com",
      siteKey: "agent",
      from,
    }),
    `https://help.oceanleo.com/?site=agent&from=${encodeURIComponent(from)}`,
  );
});

test("path=/chat", () => {
  assert.equal(
    helpCenterUrl({
      host: "chat.oceanleo.cn",
      siteKey: "chat",
      from: "https://chat.oceanleo.cn/",
      path: "/chat",
    }),
    `https://help.oceanleo.cn/chat?site=chat&from=${encodeURIComponent("https://chat.oceanleo.cn/")}`,
  );
});

test("isHelpCenterHost: help.com / help.cn 隐藏；design.com 与本机开发 host 不隐藏", () => {
  assert.equal(isHelpCenterHost("help.oceanleo.com"), true);
  assert.equal(isHelpCenterHost("help.oceanleo.cn"), true);
  assert.equal(isHelpCenterHost("www.help.oceanleo.com"), true);
  assert.equal(isHelpCenterHost("www.help.oceanleo.cn"), true);
  assert.equal(isHelpCenterHost("HELP.oceanleo.com:443"), true);
  assert.equal(isHelpCenterHost("design.oceanleo.com"), false);
  assert.equal(isHelpCenterHost("localhost"), false);
  assert.equal(isHelpCenterHost("localhost:3000"), false);
});

const appShell = await readFile("src/shell/AppShell.tsx", "utf8");
const helpLinkSrc = await readFile("src/shell/HelpLink.tsx", "utf8");

test("HelpLink 在 help host 上 return null；AppShell 两处仍调用", () => {
  assert.match(helpLinkSrc, /isHelpCenterHost/);
  assert.match(helpLinkSrc, /if \(hidden\) return null/);
});

test("AppShell 声明 helpHref，并在 sidebar 与 topbar 各渲染一次 HelpLink", () => {
  assert.match(appShell, /helpHref\?: string \| null/);
  assert.match(appShell, /siteKey\?: string/);
  const renders = appShell.match(/<HelpLink\b/g) || [];
  assert.equal(
    renders.length,
    2,
    `HelpLink JSX 出现 ${renders.length} 次，期望 sidebar + topbar 两处`,
  );
  assert.match(appShell, /from ["']\.\/HelpLink["']/);
});
