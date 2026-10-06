// 公开分享链接分流（work-chat W05）：分享码以 `w_` 开头 = 工作回放，走 /v1/replays/work/public/<code> 并渲染 WorkReplayPlayer；
// 其余分享码仍走原来的 AI 对话回放（/v1/share/<id>），行为不变。公开请求不带 cookie、不带 token。
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const GATEWAY = "https://api.dev.oceanleo.com";
const configStub = dataModule(`export const GATEWAY_BASE = "${GATEWAY}";`);
const uiStub = dataModule(`
  const tt = (text, vars) => (vars ? String(text).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);
  export function useUI() { return tt; }
`);

globalThis.__workReplayLinkReact = React;
const playerStub = dataModule(`
  export function WorkReplayPlayer(props) {
    return globalThis.__workReplayLinkReact.createElement("div", {
      "data-stub-work-player": props.publicCode,
      "data-stub-gateway": props.publicFetch?.gatewayBase ?? "",
    });
  }
`);

const pageUrl = await compileModule("src/shell/replay/AgentReplayPage.tsx", {
  "../../i18n/ui/useUI": uiStub,
  "./work/WorkReplayPlayer": playerStub,
  "../../lib/auth/config": configStub,
});
const { AgentReplayPage, replayRouteFor } = await import(pageUrl);

const apiUrl = await compileModule("src/shell/replay/work/replay-work-api.ts", {
  "../../../lib/agent": dataModule(`export async function authed() { throw new Error("匿名请求不该走登录态"); }`),
  "../../../lib/auth/config": configStub,
});
const api = await import(apiUrl);

const CODE = "w_" + "A1b2C3d4E5f6G7h8I9j0K1";

test("replayRouteFor：只有 w_ 前缀（且后面有内容）才是工作回放", () => {
  assert.equal(api.WORK_REPLAY_SHARE_PREFIX, "w_");
  assert.equal(replayRouteFor(CODE), "work");
  assert.equal(replayRouteFor("w_x"), "work");
  assert.equal(replayRouteFor("w_"), "task");
  assert.equal(replayRouteFor("W_abc"), "task");
  assert.equal(replayRouteFor("abc123"), "task");
  assert.equal(replayRouteFor("wx_abc"), "task");
  assert.equal(replayRouteFor(""), "task");
  assert.equal(replayRouteFor(undefined), "task");
  assert.equal(api.isWorkReplayShareCode(CODE), true);
  assert.equal(api.isWorkReplayShareCode("abc"), false);
});

test("分享页：w_ 码渲染工作回放播放器，并把网关地址交给它", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentReplayPage, { shareId: CODE, gatewayBase: GATEWAY, fetchImpl: async () => { throw new Error("不该请求旧接口"); } }),
  );
  assert.match(html, new RegExp(`data-stub-work-player="${CODE}"`));
  assert.match(html, /data-stub-gateway="https:\/\/api\.dev\.oceanleo\.com"/);
  assert.doesNotMatch(html, /data-replay-root/);
});

test("分享页：非 w_ 码仍是原来的 AI 对话回放，不渲染工作回放播放器", () => {
  const html = renderToStaticMarkup(
    React.createElement(AgentReplayPage, { shareId: "abc123", gatewayBase: GATEWAY, fetchImpl: async () => new Response("{}") }),
  );
  assert.doesNotMatch(html, /data-stub-work-player/);
  assert.match(html, /data-replay-root/);
});

test("公开取数：走 /v1/replays/work/public/<code>，credentials=omit，不带 Authorization", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ replay: { id: "r1" }, chapters: [], events: [], sources: [], people: [] }), { status: 200 });
  };
  const result = await api.getPublicWorkReplay(CODE, { gatewayBase: GATEWAY, fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.ok(url.startsWith(`${GATEWAY}/v1/replays/work/public/${CODE}?`), url);
  assert.match(url, /tz_offset_minutes=-?\d+/);
  assert.equal(init.credentials, "omit");
  assert.equal(init.method, "GET");
  assert.equal(JSON.stringify(init.headers).toLowerCase().includes("authorization"), false);

  await api.getPublicWorkReplayFrames(CODE, "artifact:doc1", { fromSeq: 3, toSeq: 9 }, { gatewayBase: GATEWAY, fetchImpl });
  const framesUrl = calls[1].url;
  assert.ok(framesUrl.startsWith(`${GATEWAY}/v1/replays/work/public/${CODE}/frames?`), framesUrl);
  assert.match(framesUrl, /source=artifact%3Adoc1/);
  assert.match(framesUrl, /from_seq=3/);
  assert.match(framesUrl, /to_seq=9/);
});

test("公开取数：403/404/网络错误都给出失败结果，不抛", async () => {
  for (const status of [403, 404, 500]) {
    const result = await api.getPublicWorkReplay(CODE, { gatewayBase: GATEWAY, fetchImpl: async () => new Response("{}", { status }) });
    assert.deepEqual([result.ok, result.status], [false, status]);
  }
  const broken = await api.getPublicWorkReplay(CODE, {
    gatewayBase: GATEWAY,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual([broken.ok, broken.status], [false, 0]);
});
