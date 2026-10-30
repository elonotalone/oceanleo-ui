// W9（2026-10-31）回归门：网关 origin 只能从域名家族档案取。
//
// oceanbizs.com（ws 家族）与 oceanleo.com 吃同一份 Vercel 构建，`NEXT_PUBLIC_*`
// 是 com 的值（网关 api.oceanleo.com）。任何「env 优先、家族档案兜底」的写法
// 都会把分身页的请求送去生产 / com 网关。env overlay 唯一合法的读取点是
// `contracts/domain-family.ts`（同族校验）与宿主注入 `contracts/client-host-config.ts`。
// 本测试扫**源码**（不是产物），出现新的读取点就红。
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

const ALLOWED = new Set([
  "src/contracts/domain-family.ts",
  "src/contracts/client-host-config.ts",
]);

const GATEWAY_ENV = /process\.env\.NEXT_PUBLIC_(?:OCEANLEO_)?GATEWAY(?:_URL)?\b/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:ts|tsx|mjs|js)$/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}

const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

test("src 里除家族档案外没有任何 env 优先的网关读取", () => {
  const offenders = [];
  for (const file of walk(SRC)) {
    const rel = relative(ROOT, file).split("\\").join("/");
    if (ALLOWED.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (GATEWAY_ENV.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(offenders, [], `env 优先的网关读取：\n${offenders.join("\n")}`);
});

test("曾经泄漏的三个模块按调用现取家族网关", () => {
  for (const rel of [
    "src/shell/leo/LeoBoard.tsx",
    "src/shell/material-library-controller.ts",
    "src/shell/material-library-template-source.ts",
  ]) {
    const text = stripComments(readFileSync(join(ROOT, rel), "utf8"));
    assert.match(text, /function gatewayBase\(\): string \{\s*return currentDomainProfile\(\)\.gatewayOrigin;/, rel);
    assert.doesNotMatch(text, /const GATEWAY(?:_BASE)?\s*=/, `${rel} 不得再有模块级网关快照`);
  }
});

test("自检：扫描规则能抓住 env 优先写法", () => {
  const sample = 'const G = process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL || "https://api.oceanleo.com";';
  assert.match(stripComments(sample), GATEWAY_ENV);
  assert.match("process.env.NEXT_PUBLIC_GATEWAY_URL", GATEWAY_ENV);
  assert.match("process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY)", GATEWAY_ENV);
  assert.doesNotMatch(stripComments("// process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL"), GATEWAY_ENV);
});

// 行为锁：同一份 com 构建（env 钉 api.oceanleo.com）跑在 oceanbizs.com 页上，
// 模板素材预览 URL 必须落到 api.oceanbizs.com；跑在 oceanleo.com 页上逐字不变。
import { spawnSync } from "node:child_process";

const LOADER_URL = new URL("./ts-extension-loader.mjs", import.meta.url).href;
const TEMPLATE_URL = new URL("../src/shell/material-library-template-source.ts", import.meta.url).href;

function previewUrlOn(host) {
  const probe = `
    globalThis.window = { location: { host: ${JSON.stringify(host)}, origin: "https://" + ${JSON.stringify(host)} } };
    const m = await import(${JSON.stringify(TEMPLATE_URL)});
    process.stdout.write(JSON.stringify(m.templateMaterialPreviewUrl("tpl-1")));
  `;
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "--experimental-loader", LOADER_URL, "--input-type=module", "-e", probe],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_OCEANLEO_GATEWAY_URL: "https://api.oceanleo.com",
        NEXT_PUBLIC_GATEWAY_URL: "",
        NEXT_PUBLIC_OCEANLEO_DOMAIN_FAMILY: "",
      },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("com 构建跑在 ws 页：模板预览走 api.oceanbizs.com；com 页逐字不变", () => {
  const ws = previewUrlOn("oceanbizs.com");
  const com = previewUrlOn("oceanleo.com");
  assert.equal(ws, "https://api.oceanbizs.com/v1/template-materials/tpl-1/preview");
  assert.equal(com, "https://api.oceanleo.com/v1/template-materials/tpl-1/preview");
});

test("本地编辑器入口：分身 oceanbizs.com 与其子域同样算远端", async () => {
  const m = await import("../src/client-editor-adapters/asset-manifest.ts");
  for (const entry of [
    "https://oceanbizs.com/editor/index.html",
    "https://design.oceanbizs.com/",
    "https://slides.ws.oceanleo.app/",
    "https://oceanleo.com/x",
    "https://slide.oceanleo.cn/x",
  ]) {
    assert.equal(m.isForbiddenRemoteEditorEntry(entry), true, entry);
  }
  assert.equal(m.isForbiddenRemoteEditorEntry("./editor/index.html"), false);
  assert.equal(m.isForbiddenRemoteEditorEntry("http://127.0.0.1:4000/x"), false);
  assert.equal(m.isForbiddenRemoteEditorEntry("https://notoceanbizs.com/x"), false);
});
