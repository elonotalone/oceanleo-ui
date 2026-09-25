// MCP OAuth 回调 postMessage 接收侧的 fail-closed 回归锁。
//
// 原锁在门户 oceanleo/tests/mcp-oauth-origin-failclosed.test.mjs（W20，2026-07-25），
// 读的是 app/plugins/page.tsx。editors-and-shell-0924 W09 把插件页整体搬进共享外壳
// （oceanleo-ui dfda3fd / 门户 15f05c1），接收函数现在在
// src/pages/plugins/ConnectorsSection.tsx，旧锁读不到它就直接崩了。同样四条性质搬到这里。
//
// 被锁死的性质：**解析不出网关 origin 时必须拒收消息，不得放行**；origin 之外还要认
// event.source 确为我们开的授权弹窗；两道校验都在读消息体之前；只认一个语义封闭的指令。
//
// 规则 UC-6，见 docs/architecture/oceanleo-untrusted-content-isolation.md §8.6：
// 接收方必须比对**精确** origin，并校验 event.source 确为预期 frame/window。
//
// 跑：cd /root/projects/oceanleo-ui && node --test tests/mcp-oauth-origin-failclosed.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const section = readFileSync(
  new URL("../src/pages/plugins/ConnectorsSection.tsx", import.meta.url),
  "utf8",
);

// 注释里可能逐字引用修前那行 fail-open 代码，断言只针对代码，先剥掉注释。
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const START = "function onMessage(e: MessageEvent) {";
const END = 'window.addEventListener("message", onMessage);';
assert.ok(
  section.includes(START) && section.includes(END),
  "ConnectorsSection.tsx 里找不到 OAuth 回执接收函数；它若再搬家，这把锁要跟着搬，不能删",
);
const handler = stripComments(section.split(START)[1].split(END)[0]);

test("UC-6: 网关 origin 解析失败时拒收，而不是短路整条校验", () => {
  assert.match(handler, /if \(!gatewayOrigin \|\| e\.origin !== gatewayOrigin\) return;/);
  assert.doesNotMatch(
    handler,
    /if \(gatewayOrigin && e\.origin !== gatewayOrigin\) return;/,
    "fail-open 的 origin 校验回来了：网关地址解析失败时任意 origin 可投递消息",
  );
  assert.doesNotMatch(
    handler,
    /gatewayOrigin\s*&&\s*e\.origin/,
    "origin 校验不得再被任何 `gatewayOrigin &&` 短路",
  );
});

test("UC-6: origin 之外还要校验 event.source 确为我们开的授权弹窗", () => {
  assert.match(
    handler,
    /if \(!oauthPopupRef\.current \|\| e\.source !== oauthPopupRef\.current\) return;/,
    "缺少 event.source 校验：同 origin 的其他窗口仍可冒充回调",
  );
  // 弹窗句柄必须真的被记下来，否则上面那条恒为 false（功能坏掉）。
  assert.match(section, /const oauthPopupRef = useRef<Window \| null>\(null\);/);
  assert.match(section, /oauthPopupRef\.current = w;/);
});

test("UC-6: 校验顺序 —— origin 与 source 都在读取消息内容之前", () => {
  const originGate = handler.indexOf("e.origin !== gatewayOrigin");
  const sourceGate = handler.indexOf("e.source !== oauthPopupRef.current");
  const readsPayload = handler.indexOf("e.data as");
  const sideEffect = handler.indexOf("loadConnections()");

  assert.ok(originGate > -1 && sourceGate > -1 && readsPayload > -1 && sideEffect > -1);
  assert.ok(
    originGate < readsPayload && sourceGate < readsPayload,
    "必须先校验来源再读消息体",
  );
  assert.ok(sourceGate < sideEffect, "loadConnections() 这类副作用必须在两道校验之后");
});

test("UC-6: 仍然只接受语义封闭的白名单指令，没有通用代理能力", () => {
  assert.match(handler, /data\.source !== "oceanleo-mcp-oauth"/);
  assert.doesNotMatch(handler, /fetch\(/);
  assert.doesNotMatch(handler, /data\.(url|path|endpoint|body)\b/);
});
