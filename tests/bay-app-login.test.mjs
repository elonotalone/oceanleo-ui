// 安全矩阵：UC-6 不适用（本页不收发 postMessage）；UC-4（地址参数与作品信息只按文本渲染；跳转目标与登记的回调地址逐项核对）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  defaultRedirectUri,
  loginSampleCode,
  readLoginRequest,
  redirectUriProblem,
  redirectUrisProblem,
  sameRedirectTarget,
  sdkScriptUrl,
} from "../src/shell/bay/applogin/login-model.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

const VALID_CLIENT = "olapp_abcdefghij0123456789abcd";
const VALID_CHALLENGE = "a".repeat(43);

function validSearch(extra = {}) {
  const params = new URLSearchParams({
    client_id: VALID_CLIENT,
    redirect_uri: "https://app.example.com/cb",
    state: "xyz",
    code_challenge: VALID_CHALLENGE,
    code_challenge_method: "S256",
    ...extra,
  });
  return `?${params.toString()}`;
}

test("readLoginRequest 接受一例合法请求（可带 nonce）", () => {
  const withNonce = readLoginRequest(validSearch({ nonce: "n1" }));
  assert.equal(withNonce.ok, true);
  assert.equal(withNonce.request.client_id, VALID_CLIENT);
  assert.equal(withNonce.request.redirect_uri, "https://app.example.com/cb");
  assert.equal(withNonce.request.state, "xyz");
  assert.equal(withNonce.request.code_challenge, VALID_CHALLENGE);
  assert.equal(withNonce.request.code_challenge_method, "S256");
  assert.equal(withNonce.request.nonce, "n1");

  const withoutNonce = readLoginRequest(validSearch());
  assert.equal(withoutNonce.ok, true);
  assert.equal(withoutNonce.request.nonce, undefined);
});

test("readLoginRequest 每一种非法输入各一例", () => {
  assert.equal(readLoginRequest("").ok, false);
  assert.equal(readLoginRequest(validSearch({ client_id: "olapp_short" })).ok, false);
  assert.equal(readLoginRequest(validSearch({ redirect_uri: "not-a-url" })).ok, false);
  assert.equal(readLoginRequest(validSearch({ redirect_uri: "http://app.example.com/cb" })).ok, false);
  assert.equal(readLoginRequest(validSearch({ state: "" })).ok, false);
  assert.equal(readLoginRequest(validSearch({ state: "x".repeat(513) })).ok, false);
  assert.equal(readLoginRequest(validSearch({ code_challenge: "a".repeat(42) })).ok, false);
  assert.equal(readLoginRequest(validSearch({ code_challenge_method: "plain" })).ok, false);
  assert.equal(readLoginRequest(validSearch({ nonce: "n".repeat(129) })).ok, false);
});

test("sameRedirectTarget 主机名、协议、路径不同为 false；只多 code/state 为 true", () => {
  const registered = "https://app.example.com/cb";
  assert.equal(sameRedirectTarget("https://evil.example.com/cb", registered), false);
  assert.equal(sameRedirectTarget("http://app.example.com/cb", registered), false);
  assert.equal(sameRedirectTarget("https://app.example.com/other", registered), false);
  assert.equal(
    sameRedirectTarget("https://app.example.com/cb?code=abc&state=xyz", registered),
    true,
  );
});

test("回调地址表单校验", () => {
  const host = "app.example.com";
  assert.equal(redirectUriProblem("", host), "请填写回调地址");
  assert.equal(redirectUriProblem("not-a-url", host), "回调地址无效");
  assert.equal(redirectUriProblem("http://app.example.com/", host), "回调地址必须是 https 开头");
  assert.equal(redirectUriProblem("https://app.example.com/cb#frag", host), "回调地址不能带 # 片段");
  assert.equal(redirectUriProblem(`https://app.example.com/${"x".repeat(500)}`, host), "回调地址不能超过 512 个字符");
  assert.equal(redirectUriProblem("https://other.example.com/", host), "回调地址的主机名必须和上架的网址一致");
  assert.equal(redirectUriProblem("https://app.example.com/cb", host), null);
  assert.equal(redirectUrisProblem([], host, true), "开通登录至少要有一个回调地址");
  assert.equal(
    redirectUrisProblem(
      [
        "https://app.example.com/a",
        "https://app.example.com/b",
        "https://app.example.com/c",
        "https://app.example.com/d",
        "https://app.example.com/e",
        "https://app.example.com/f",
      ],
      host,
      true,
    ),
    "最多 5 个回调地址",
  );
  assert.equal(defaultRedirectUri("https://app.example.com/app/"), "https://app.example.com/app/");
  assert.equal(sdkScriptUrl("https://api.oceanleo.com/v1/bay/pub/login/token"), "https://api.oceanleo.com/v1/bay/pub/login/sdk.js");
  assert.match(loginSampleCode(VALID_CLIENT, "https://app.example.com/", "https://api.example/sdk.js"), /OceanLeoLogin\.start/);
  assert.match(loginSampleCode(VALID_CLIENT, "https://app.example.com/", "https://api.example/sdk.js"), /OceanLeoLogin\.finish/);
});

// UC-4：授权页被嵌入时不给按钮；跳转目标与登记的回调地址逐项核对；地址参数不进 href。
test("授权页源码：点劫持判断、跳转前核对、无注入、不把地址参数放进 href", () => {
  const pane = source("src/shell/bay/applogin/AppLoginConsentPane.tsx");
  const manage = source("src/shell/bay/applogin/LoginManagePanel.tsx");
  const hint = source("src/shell/bay/applogin/AppLoginHint.tsx");
  const grants = source("src/shell/bay/applogin/MyAppLoginGrants.tsx");
  assert.match(pane, /window\.top !== window\.self/);
  assert.match(pane, /sameRedirectTarget\(/);
  assert.match(pane, /window\.location\.assign\(/);
  assert.match(pane, /previewBayAppLogin/);
  assert.match(pane, /approveBayAppLogin/);
  assert.match(pane, /data-bay-pane="app-login"/);
  assert.doesNotMatch(pane, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(pane, /postMessage/);
  assert.doesNotMatch(pane, /innerHTML\s*=/);
  assert.doesNotMatch(pane, /href=\{/);
  assert.doesNotMatch(manage, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(manage, /postMessage/);
  assert.doesNotMatch(hint, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(grants, /dangerouslySetInnerHTML/);
  assert.match(hint, /data-bay-app-login-hint/);
  assert.match(manage, /saveBayAppLoginClient/);
  assert.match(manage, /getBayAppLoginUsers\(appId, 30\)/);
  const model = source("src/shell/bay/applogin/login-model.ts");
  assert.match(model, /OceanLeoLogin\.start/);
  assert.match(model, /OceanLeoLogin\.finish/);
  assert.match(grants, /listMyBayAppLoginGrants/);
  assert.match(grants, /revokeBayAppLoginGrant/);
  assert.doesNotMatch(pane, /fetch\(/);
  assert.doesNotMatch(manage, /\/v1\//);
});

test("登录填写页回调地址用展开表单，不事先堆提示小字", () => {
  const manage = source("src/shell/bay/applogin/LoginManagePanel.tsx");
  assert.match(manage, /BayRevealForm/);
  assert.match(manage, /from ["']\.\.\/form["']/);
  assert.match(manage, /id:\s*"redirects"/);
  assert.match(manage, /data-bay-login-uri/);
  assert.match(manage, /data-bay-login-uri-add/);
  assert.match(manage, /data-bay-login-enabled/);
  assert.doesNotMatch(manage, /placeholder=/);
  assert.doesNotMatch(manage, /Please enter/i);
  assert.doesNotMatch(manage, /开通登录至少要有一个回调地址/);
  assert.doesNotMatch(manage, /最多 5 个回调地址/);
  assert.doesNotMatch(manage, /请填写回调地址/);
});

test("登录设置填写页灰字可读、没有整页白板页脚", () => {
  const manage = source("src/shell/bay/applogin/LoginManagePanel.tsx");
  assert.doesNotMatch(manage, /text-neutral-400/);
  assert.doesNotMatch(manage, /text-stone-400/);
  assert.doesNotMatch(manage, /bg-white\/95/);
  assert.doesNotMatch(manage, /-mx-4/);
});
