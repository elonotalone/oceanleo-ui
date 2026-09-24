import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

// 操作员 2026-09-24：左下角 / 顶栏的「?」删掉，帮助只从账号菜单「获取帮助」进。
// 三种布局真渲染出来的判据在 eas-w05-shell-help-leo；这里钉住源码层面不许回来。
test("AppShell 不再渲染 HelpLink，HelpLink.tsx 已删", () => {
  assert.doesNotMatch(appShell, /<HelpLink\b/);
  assert.doesNotMatch(appShell, /from ["']\.\/HelpLink["']/);
  assert.equal(existsSync("src/shell/HelpLink.tsx"), false);
});

test("AppShell 仍收 helpHref / showHelp / siteKey（子站在传），只喂账号菜单「获取帮助」", () => {
  assert.match(appShell, /helpHref\?: string \| null/);
  assert.match(appShell, /showHelp\?: boolean/);
  assert.match(appShell, /siteKey\?: string/);
  assert.match(appShell, /helpHref=\{accountHelpHref\}/);
  assert.match(appShell, /helpCenterUrl\(\{\s*host: window\.location\.host,/);
});
