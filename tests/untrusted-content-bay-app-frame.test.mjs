// U2：作品页内窗口的源码级安全断言。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BAY_APP_FRAME_SANDBOX } from "../src/shell/bay/apps/app-embed.ts";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const APPS_DIR = join(REPO, "src/shell/bay/apps");
const LOCKED = "allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox";
const BANNED_TOKENS = [
  "allow-same-origin",
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-modals",
];
const BANNED_SINKS = [
  "allow-same-origin",
  "postMessage",
  'addEventListener("message"',
  "dangerouslySetInnerHTML",
  "innerHTML",
  "srcDoc",
  "eval(",
  "new Function",
];

function source(relativePath) {
  return readFileSync(join(REPO, relativePath), "utf8");
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function walkTs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTs(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md
// 作品是创作者站点，不是第一方页。sandbox 令牌串锁死；多给同源或顶层导航就能卸沙箱或把 Bay 页带走。
test("BAY_APP_FRAME_SANDBOX 逐字等于锁定串，且不含禁止令牌", () => {
  assert.equal(BAY_APP_FRAME_SANDBOX, LOCKED);
  const tokens = new Set(BAY_APP_FRAME_SANDBOX.split(/\s+/).filter(Boolean));
  for (const banned of BANNED_TOKENS) {
    assert.equal(tokens.has(banned), false, banned);
  }
});

// UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md
// iframe 的 sandbox 写成字面量（跨仓扫描器 oceanleo-untrusted-render-scan.py 只能静态读字面量），
// 且必须与锁定串逐字相同；源码里再写第二个 sandbox= 就是另一条不受锁的窗口。
test("AppEmbedFrame 只有一处 sandbox=，字面量与锁定串逐字相同，并带 no-referrer", () => {
  const src = source("src/shell/bay/apps/AppEmbedFrame.tsx");
  assert.equal((src.match(/sandbox=/g) || []).length, 1);
  assert.ok(src.includes(`sandbox="${LOCKED}"`), "iframe 上的 sandbox 字面量必须与锁定串逐字相同");
  assert.doesNotMatch(src, /sandbox=\{/, "sandbox 不许写成表达式：扫描器读不出它的值");
  assert.match(src, /referrerPolicy="no-referrer"/);
});

// UC-3 / UC-4 / UC-6: docs/architecture/oceanleo-untrusted-content-isolation.md
// 作品目录里不许出现同源令牌、消息桥、HTML 注入或动态代码。注释里点名禁令不算。
test("src/shell/bay/apps 代码面没有禁止令牌与注入点", () => {
  const files = walkTs(APPS_DIR);
  assert.ok(files.length > 0);
  for (const file of files) {
    const code = stripComments(readFileSync(file, "utf8"));
    for (const needle of BANNED_SINKS) {
      assert.equal(code.includes(needle), false, `${file} 含 ${needle}`);
    }
  }
});
