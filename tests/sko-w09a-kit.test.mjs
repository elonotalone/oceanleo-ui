// Skills overhaul 2026-10-24 — W09A：共享界面基础件（src/shell/skills/kit）。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//     --experimental-loader ./tests/ts-extension-loader.mjs --test tests/sko-w09a-kit.test.mjs
//
// 覆盖：
//   1. 纯函数：树构建（目录优先、字母序、补中间目录、丢 `..`）、默认选中、默认展开、frontmatter 拆分、字节格式。
//   2. folderApi：URL 拼接（网关绝对地址、门户分享地址）、错误映射（{detail:{code,message}} / 字符串 / 校验列表 /
//      401 / 无 code 的 404）、请求形状（方法、路径、查询串、JSON 体、multipart、登录缺失不发请求、网络失败）。
//   3. 渲染（jsdom + react-dom/client）：ConfigDialogShell（role/aria、焦点进出、Esc、嵌套只关最上层、遮罩）、
//      AddMenu（键盘上下/回车/Esc、跳过禁用、点外关闭）、ConfigItemCard（整卡可点、开关不触发打开）、
//      FolderTreeViewer（默认选中 SKILL.md、YAML 代码块、Markdown 不渲染原始 HTML、代码复制、图片只认栅格
//      data URL、二进制给大小与下载、读失败可重试、截断提示、目录折叠）、SkillCover 占位。
//   4. 源码闸：kit 里没有 innerHTML / dangerouslySetInnerHTML / eval / new Function / javascript:；
//      合同 §3.4 的名字全部从 index 导出；Markdown 走现有 src/shell/Markdown；文案分表 16 语齐全。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { register } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

register("./ts-extension-loader.mjs", import.meta.url);

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings/skills",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  FocusEvent: window.FocusEvent,
  InputEvent: window.InputEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// jsdom 没实现 scrollTo；lockBodyScroll 解锁时会调用它。
window.scrollTo = () => {};
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: {
    async writeText(value) {
      globalThis.__w09aCopied = value;
    },
  },
});

const { createRoot } = await import("react-dom/client");

const STUBS = {
  "../../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (zh, vars) =>
        vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
    }
  `),
  "../../../lib/auth/client": dataModule(`
    export async function accessToken() { return globalThis.__w09aToken ?? null; }
  `),
};

const kit = await import(await compileModule("src/shell/skills/kit/index.ts", STUBS));
const model = await import(await compileModule("src/shell/skills/kit/tree-model.ts"));

const ROOT = new URL("../", import.meta.url);
const KIT_DIR = new URL("src/shell/skills/kit/", ROOT);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function flush(n = 4) {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await flush();
  return {
    host,
    root,
    async rerender(next) {
      await act(async () => root.render(next));
      await flush();
    },
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

function key(target, keyName, extra = {}) {
  const ev = new window.KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true, ...extra });
  target.dispatchEvent(ev);
  return ev;
}

async function press(target, keyName, extra) {
  await act(async () => {
    key(target, keyName, extra);
  });
  await flush();
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

const h = React.createElement;

// ===========================================================================
// 1. 纯函数
// ===========================================================================

test("buildFolderTree：目录优先、字母序（不分大小写）、补齐缺失的中间目录、丢弃 `..`", () => {
  const tree = model.buildFolderTree([
    { path: "SKILL.md", type: "file", kind: "markdown", size: 10 },
    { path: "LICENSE.txt", type: "file", kind: "text" },
    { path: "scripts/b.py", type: "file", kind: "code" },
    { path: "scripts/a.py", type: "file", kind: "code" },
    { path: "references", type: "dir" },
    { path: "references/z.md", type: "file", kind: "markdown" },
    { path: "references/A.md", type: "file", kind: "markdown" },
    { path: "templates/deck/outline.md", type: "file", kind: "markdown" }, // 中间目录没列
    { path: "../evil.md", type: "file", kind: "markdown" },
    { path: "cover.svg", type: "file", kind: "code" },
  ]);
  assert.deepEqual(
    tree.map((n) => `${n.type}:${n.name}`),
    ["dir:references", "dir:scripts", "dir:templates", "file:cover.svg", "file:evil.md", "file:LICENSE.txt", "file:SKILL.md"],
  );
  assert.deepEqual(tree[0].children.map((n) => n.name), ["A.md", "z.md"]);
  assert.deepEqual(tree[1].children.map((n) => n.path), ["scripts/a.py", "scripts/b.py"]);
  const templates = tree[2];
  assert.equal(templates.children[0].type, "dir");
  assert.equal(templates.children[0].path, "templates/deck");
  assert.equal(templates.children[0].depth, 1);
  assert.equal(templates.children[0].children[0].path, "templates/deck/outline.md");
  assert.equal(templates.children[0].children[0].depth, 2);
  // `..` 段被丢弃，不会越出根
  assert.ok(model.flattenFiles(tree).every((p) => !p.includes("..")));
});

test("pickInitialFile / initialExpanded：initialPath → SKILL.md → 嵌套 SKILL.md → 第一个文件；展开第一层 + 选中祖先", () => {
  const tree = model.buildFolderTree([
    { path: "a/b/c.md", type: "file" },
    { path: "SKILL.md", type: "file" },
    { path: "z.txt", type: "file" },
  ]);
  assert.equal(model.pickInitialFile(tree), "SKILL.md");
  assert.equal(model.pickInitialFile(tree, "a/b/c.md"), "a/b/c.md");
  assert.equal(model.pickInitialFile(tree, "missing.md"), "SKILL.md");
  const nested = model.buildFolderTree([{ path: "pkg/SKILL.md", type: "file" }, { path: "a.txt", type: "file" }]);
  assert.equal(model.pickInitialFile(nested), "pkg/SKILL.md");
  const plain = model.buildFolderTree([{ path: "b/x.txt", type: "file" }, { path: "a.txt", type: "file" }]);
  assert.equal(model.pickInitialFile(plain), "b/x.txt", "第一个文件按显示顺序（目录优先）");
  assert.equal(model.pickInitialFile([]), null);
  const exp = model.initialExpanded(tree, "a/b/c.md");
  assert.deepEqual([...exp].sort(), ["a", "a/b"]);
  assert.deepEqual(model.ancestorDirs("x/y/z.md"), ["x", "x/y"]);
});

test("splitFrontmatter：只认首行 `---`，闭合才拆；BOM、CRLF、`...` 结尾都认", () => {
  const md = "---\nname: deep-dossier\ndescription: >-\n  Research\n---\n\n# Title\n\nBody";
  assert.deepEqual(model.splitFrontmatter(md), {
    frontmatter: "name: deep-dossier\ndescription: >-\n  Research",
    body: "# Title\n\nBody",
  });
  assert.deepEqual(model.splitFrontmatter("﻿---\r\na: 1\r\n...\r\nx"), { frontmatter: "a: 1", body: "x" });
  assert.deepEqual(model.splitFrontmatter("# no fm\n---\nx"), { frontmatter: null, body: "# no fm\n---\nx" });
  assert.deepEqual(model.splitFrontmatter("---\nunclosed: true\n"), { frontmatter: null, body: "---\nunclosed: true\n" });
  assert.deepEqual(model.splitFrontmatter(""), { frontmatter: null, body: "" });
});

test("formatBytes / codeLanguage / coverTone", () => {
  assert.equal(model.formatBytes(0), "0 B");
  assert.equal(model.formatBytes(1023), "1023 B");
  assert.equal(model.formatBytes(1536), "1.5 KB");
  assert.equal(model.formatBytes(20 * 1024 * 1024), "20 MB");
  assert.equal(model.formatBytes(undefined), "0 B");
  assert.equal(model.codeLanguage("scripts/calc.py"), "python");
  assert.equal(model.codeLanguage("cover.svg"), "xml");
  assert.equal(model.codeLanguage("Makefile"), "makefile");
  assert.deepEqual(model.coverTone("skill-forge"), model.coverTone("skill-forge"));
});

// ===========================================================================
// 2. folderApi
// ===========================================================================

test("URL：网关绝对地址、官方下载/封面、文件夹下载、门户分享页", () => {
  const base = kit.gatewayAbsoluteUrl("/");
  assert.match(base, /^https?:\/\/[^/]+\/$/);
  const gw = base.replace(/\/$/, "");
  assert.equal(kit.gatewayAbsoluteUrl("/v1/x", "https://gw.example/"), "https://gw.example/v1/x");
  assert.equal(kit.gatewayAbsoluteUrl("v1/x", "https://gw.example"), "https://gw.example/v1/x");
  assert.equal(kit.gatewayAbsoluteUrl("https://cdn.example/a.svg"), "https://cdn.example/a.svg");
  assert.equal(kit.officialSkillDownloadUrl("deep-dossier"), `${gw}/v1/skills/official/deep-dossier/download`);
  assert.equal(kit.officialSkillCoverUrl("deep-dossier"), `${gw}/v1/skills/official/deep-dossier/cover.svg`);
  assert.equal(kit.folderDownloadUrl("f 1"), `${gw}/v1/folders/f%201/download`);
  assert.equal(kit.officialSkillShareUrl("skill-forge", "https://oceanleo.cn/"), "https://oceanleo.cn/skills/skill-forge");
  assert.match(kit.officialSkillShareUrl("skill-forge"), /^https:\/\/[^/]+\/skills\/skill-forge$/);
  assert.equal(kit.folderApi.officialSkillShareUrl, kit.officialSkillShareUrl);
  assert.equal(kit.isGatewayUrl(`${gw}/v1/folders/x/download`), true);
  assert.equal(kit.isGatewayUrl("https://evil.example/v1/folders/x/download"), false);
});

test("错误映射：{detail:{code,message}} 原样用 message；字符串/校验列表；401 统一「请先登录」；无 code 时按状态补", () => {
  assert.deepEqual(kit.folderApiError(400, { detail: { code: "unsafe_path", message: "压缩包里有 ../ 路径" } }), {
    ok: false,
    error: "压缩包里有 ../ 路径",
    code: "unsafe_path",
    status: 400,
  });
  assert.deepEqual(kit.folderApiError(429, { detail: { code: "rate_limited" } }), {
    ok: false,
    error: kit.FOLDER_ERROR_FALLBACKS.rate_limited,
    code: "rate_limited",
    status: 429,
  });
  assert.deepEqual(kit.folderApiError(404, { detail: "Not Found" }), {
    ok: false,
    error: "Not Found",
    code: "not_found",
    status: 404,
  });
  assert.equal(
    kit.folderApiError(422, { detail: [{ msg: "field required" }, { msg: "bad url" }] }).error,
    "field required; bad url",
  );
  assert.deepEqual(kit.folderApiError(401, { detail: "invalid or expired token" }), {
    ok: false,
    error: "请先登录",
    code: "unauthorized",
    status: 401,
  });
  assert.deepEqual(kit.folderApiError(500, undefined), {
    ok: false,
    error: kit.FOLDER_ERROR_FALLBACKS.request_failed,
    status: 500,
  });
  for (const code of [
    "not_found", "forbidden", "invalid_zip", "zip_too_large", "unsafe_path", "not_a_skill",
    "github_unsupported", "github_fetch_failed", "quota_exceeded", "rate_limited", "invalid_skill", "already_exists",
  ]) {
    assert.ok(kit.FOLDER_ERROR_FALLBACKS[code], `合同 §3.2 错误码 ${code} 要有回退文案`);
  }
});

function mockFetch(responder) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
  return calls;
}

function jsonResponse(status, body) {
  return new Response(body === undefined ? "" : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FOLDER = {
  id: "f1", title: "Deep Dossier", source: "official", origin: {}, project_id: null,
  skill: { name: "deep-dossier", description: "d", enabled: true }, cover_url: null,
  file_count: 3, total_bytes: 100, created_at: "2026-10-24T00:00:00Z", updated_at: "2026-10-24T00:00:00Z",
  can_edit: true, official: null,
};

test("公开接口不需要登录；登录接口没 token 时直接回 401 不发请求", async () => {
  globalThis.__w09aToken = null;
  const calls = mockFetch(() => jsonResponse(200, { items: [{ name: "a" }], categories: [{ id: "data" }] }));
  const r = await kit.listOfficialSkills();
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { items: [{ name: "a" }], categories: [{ id: "data" }] });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/skills\/official$/);
  assert.equal(calls[0].init.headers.Authorization, undefined);

  const before = calls.length;
  const mine = await kit.listFolders({ scope: "mine" });
  assert.deepEqual(mine, { ok: false, error: "请先登录", code: "unauthorized", status: 401 });
  assert.equal(calls.length, before, "没登录不该打网关");
});

test("请求形状：查询串、方法、JSON 体、project_id、Bearer", async () => {
  globalThis.__w09aToken = "tok-test";
  const calls = mockFetch((url, init) => {
    if (init.method === "DELETE") return jsonResponse(200, { ok: true });
    if (url.includes("/v1/folders?")) return jsonResponse(200, { items: [FOLDER] });
    if (url.includes("/file?")) return jsonResponse(200, { path: "SKILL.md", kind: "markdown", size: 3, text: "abc" });
    if (url.match(/\/v1\/skills\/official\/[^/]+$/)) return jsonResponse(200, { skill: { name: "x" }, tree: [] });
    if (url.match(/\/v1\/folders\/[^/?]+$/) && (init.method ?? "GET") === "GET") return jsonResponse(200, { folder: FOLDER, tree: [{ path: "SKILL.md", type: "file" }] });
    return jsonResponse(200, { folder: FOLDER });
  });

  const list = await kit.listFolders({ scope: "project", projectId: "p 1", skillsOnly: true });
  assert.equal(list.ok, true);
  assert.deepEqual(list.data, [FOLDER]);
  const u = new URL(calls.at(-1).url);
  assert.equal(u.pathname, "/v1/folders");
  assert.deepEqual(Object.fromEntries(u.searchParams), { scope: "project", project_id: "p 1", skills_only: "1" });
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer tok-test");

  const detail = await kit.getFolder("f1");
  assert.equal(detail.ok, true);
  assert.equal(detail.data.folder.id, "f1");
  assert.equal(detail.data.tree.length, 1);

  const off = await kit.getOfficialSkill("deep-dossier");
  assert.equal(off.ok, true);
  assert.deepEqual(off.data.tree, []);

  const file = await kit.getOfficialSkillFile("deep-dossier", "references/a b.md");
  assert.equal(file.ok, true);
  assert.match(calls.at(-1).url, /\/v1\/skills\/official\/deep-dossier\/file\?path=references%2Fa%20b\.md$/);
  await kit.getFolderFile("f1", "SKILL.md");
  assert.match(calls.at(-1).url, /\/v1\/folders\/f1\/file\?path=SKILL\.md$/);

  const added = await kit.addOfficialSkill("deep-dossier", "proj-1");
  assert.equal(added.ok, true);
  assert.equal(added.data.id, "f1");
  assert.equal(calls.at(-1).init.method, "POST");
  assert.match(calls.at(-1).url, /\/v1\/folders\/from-official$/);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { name: "deep-dossier", project_id: "proj-1" });
  assert.equal(calls.at(-1).init.headers["Content-Type"], "application/json");

  await kit.addOfficialSkill("deep-dossier");
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { name: "deep-dossier" }, "个人范围不带 project_id");

  await kit.importFolderFromGithub("  https://github.com/o/r  ", "proj-1");
  assert.match(calls.at(-1).url, /\/v1\/folders\/import-github$/);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { url: "https://github.com/o/r", project_id: "proj-1" });

  await kit.createSkill({ name: " my-skill ", description: "does x", body: "# Body", title: " ", projectId: undefined });
  assert.match(calls.at(-1).url, /\/v1\/folders\/create-skill$/);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { name: "my-skill", description: "does x", body: "# Body" });

  await kit.copyFolderToProject("f1", "proj-2");
  assert.match(calls.at(-1).url, /\/v1\/folders\/f1\/copy$/);
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { project_id: "proj-2" });

  await kit.updateFolder("f1", { enabled: false });
  assert.equal(calls.at(-1).init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls.at(-1).init.body), { enabled: false }, "只发传了的字段");

  const del = await kit.deleteFolder("f1");
  assert.deepEqual(del, { ok: true, data: { ok: true } });
  assert.equal(calls.at(-1).init.method, "DELETE");
});

test("importFolderZip：multipart 字段 file + project_id，不手写 Content-Type", async () => {
  globalThis.__w09aToken = "tok-test";
  const calls = mockFetch(() => jsonResponse(200, { folder: { ...FOLDER, source: "upload" } }));
  const file = new File([new Uint8Array([80, 75, 3, 4])], "my.skill", { type: "application/zip" });
  const r = await kit.importFolderZip(file, "proj-9");
  assert.equal(r.ok, true);
  assert.equal(r.data.source, "upload");
  const { init, url } = calls.at(-1);
  assert.match(url, /\/v1\/folders\/import$/);
  assert.ok(init.body instanceof FormData);
  assert.equal(init.body.get("project_id"), "proj-9");
  assert.equal(init.body.get("file").name, "my.skill");
  assert.equal(init.headers["Content-Type"], undefined);
});

test("网关错误 / 网络失败 / 坏响应都变成结果对象，不抛异常", async () => {
  globalThis.__w09aToken = "tok-test";
  mockFetch(() => jsonResponse(413, { detail: { code: "zip_too_large", message: "压缩包超过 20 MB" } }));
  assert.deepEqual(await kit.importFolderZip(new Blob(["x"]), undefined), {
    ok: false,
    error: "压缩包超过 20 MB",
    code: "zip_too_large",
    status: 413,
  });
  mockFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(await kit.listOfficialSkills(), {
    ok: false,
    error: kit.FOLDER_ERROR_FALLBACKS.network,
    code: "network",
    status: 0,
  });
  mockFetch(() => new Response("<html>", { status: 200 }));
  const bad = await kit.getFolder("f1");
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "bad_response");
  mockFetch(() => jsonResponse(200, { nope: true }));
  const noFolder = await kit.addOfficialSkill("x");
  assert.equal(noFolder.ok, false);
  assert.equal(noFolder.code, "bad_response");
});

test("downloadFromGateway：只把 Bearer 发给本网关", async () => {
  globalThis.__w09aToken = "tok-test";
  const calls = mockFetch(() => new Response("zip", { status: 200 }));
  const r = await kit.downloadFromGateway("https://evil.example/v1/folders/x/download");
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
});

// ===========================================================================
// 3. 渲染
// ===========================================================================

test("ConfigDialogShell：role/aria、焦点进面板、Esc 关闭后焦点回到触发按钮；open=false 不渲染", async () => {
  const opener = document.createElement("button");
  opener.textContent = "open";
  document.body.appendChild(opener);
  opener.focus();
  let closed = 0;
  const view = await mount(
    h(kit.ConfigDialogShell, {
      open: true,
      onClose: () => {
        closed += 1;
      },
      title: "项目技能",
      subtitle: "说明",
      testId: "dlg",
      toolbar: h(kit.ConfigToolbar, { search: { value: "", onChange() {}, placeholder: "搜索技能" } }),
      children: h("p", null, "body"),
    }),
  );
  const dialog = document.querySelector('[data-testid="dlg"]');
  assert.ok(dialog);
  assert.equal(dialog.getAttribute("role"), "dialog");
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  const title = document.getElementById(dialog.getAttribute("aria-labelledby"));
  assert.equal(title.textContent, "项目技能");
  assert.equal(title.tagName, "H2");
  assert.equal(document.getElementById(dialog.getAttribute("aria-describedby")).textContent, "说明");
  assert.equal(document.activeElement.getAttribute("data-config-toolbar-search"), "", "首个焦点落在内容里（不是 ✕）");
  assert.equal(dialog.querySelector("[data-config-dialog-close]").getAttribute("aria-label"), "关闭");
  assert.equal(document.body.style.position, "fixed", "锁背景滚动");

  await press(document.activeElement, "Escape");
  assert.equal(closed, 1);
  await view.rerender(h(kit.ConfigDialogShell, { open: false, onClose() {}, title: "x", children: null }));
  assert.equal(document.querySelector("[data-config-dialog]"), null);
  assert.equal(document.activeElement, opener, "关闭后焦点回到打开前的元素");
  assert.equal(document.body.style.position, "", "解锁滚动");
  await view.unmount();
  opener.remove();
});

test("ConfigDialogShell：嵌套时 Esc 只关最上层；点遮罩关闭、点面板不关", async () => {
  const closed = [];
  function Nested() {
    return h(kit.ConfigDialogShell, {
      open: true,
      onClose: () => closed.push("outer"),
      title: "外层",
      testId: "outer",
      children: h(kit.ConfigDialogShell, {
        open: true,
        onClose: () => closed.push("inner"),
        title: "内层",
        testId: "inner",
        children: h("button", { type: "button", id: "inner-btn" }, "inner"),
      }),
    });
  }
  const view = await mount(h(Nested));
  const inner = document.querySelector('[data-testid="inner"]');
  assert.ok(inner.contains(document.activeElement));
  await press(document.activeElement, "Escape");
  assert.deepEqual(closed, ["inner"]);

  const panel = document.querySelector('[data-testid="outer"]');
  await click(panel);
  assert.deepEqual(closed, ["inner"], "点面板本身不关");
  await click(panel.parentElement);
  assert.deepEqual(closed, ["inner", "outer"], "点遮罩关");
  await view.unmount();
});

test("ConfigDialogShell onBeforeClose（仲裁 A-14）：三种原因各报一次，返回 false 不关，Esc 仍不漏给外层；不传时行为不变", async () => {
  const reasons = [];
  let allow = false;
  let closed = 0;
  let escapedToParent = 0;
  const view = await mount(
    h(
      "div",
      { onKeyDown: (e) => e.key === "Escape" && (escapedToParent += 1) },
      h(kit.ConfigDialogShell, {
        open: true,
        onClose: () => {
          closed += 1;
        },
        onBeforeClose: (reason) => {
          reasons.push(reason);
          return allow;
        },
        title: "自动化",
        testId: "guarded",
        children: h("button", { type: "button" }, "inner"),
      }),
    ),
  );
  const panel = document.querySelector('[data-testid="guarded"]');
  await press(document.activeElement, "Escape");
  await click(panel.parentElement);
  await click(panel.querySelector("[data-config-dialog-close]"));
  assert.deepEqual(reasons, ["escape", "backdrop", "close-button"]);
  assert.equal(closed, 0, "返回 false 一律不关");
  assert.equal(escapedToParent, 0, "被拦下的 Esc 也不冒泡到外层");
  assert.ok(document.querySelector('[data-testid="guarded"]'));
  assert.ok(panel.contains(document.activeElement) || document.activeElement === panel, "焦点留在面板里");

  allow = true;
  await click(panel.querySelector("[data-config-dialog-close]"));
  assert.deepEqual(reasons.at(-1), "close-button");
  assert.equal(closed, 1, "返回 true 正常关闭");
  await view.unmount();

  // 返回 undefined（非 false）视同放行；不传 prop 时 Esc 照常关
  let closed2 = 0;
  const plain = await mount(
    h(kit.ConfigDialogShell, {
      open: true,
      onClose: () => {
        closed2 += 1;
      },
      onBeforeClose: () => undefined,
      title: "x",
      children: h("button", { type: "button" }, "b"),
    }),
  );
  await press(document.activeElement, "Escape");
  assert.equal(closed2, 1);
  await plain.unmount();
  assert.match(read("src/shell/skills/kit/ConfigDialogShell.tsx"), /onBeforeClose\?: \(reason: ConfigDialogCloseReason\) => boolean;/);
  assert.match(read("src/shell/skills/kit/ConfigDialogShell.tsx"), /export type ConfigDialogCloseReason = "escape" \| "backdrop" \| "close-button";/);
});

test("AddMenu：键盘打开、↑↓ 跳过禁用、回车选中并关闭、Esc 关闭且焦点回按钮、点外关闭", async () => {
  const picked = [];
  const items = [
    { id: "zip", icon: h("i"), title: "上传", description: ".zip / .skill", onSelect: () => picked.push("zip") },
    { id: "mine", icon: h("i"), title: "我的", onSelect: () => picked.push("mine"), disabled: true },
    { id: "gh", icon: h("i"), title: "GitHub", onSelect: () => picked.push("gh"), separatorBefore: true },
  ];
  let escapedToParent = 0;
  const view = await mount(
    h("div", { onKeyDown: (e) => e.key === "Escape" && (escapedToParent += 1) }, h(kit.AddMenu, { items })),
  );
  const trigger = view.host.querySelector("[data-add-menu-trigger]");
  assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.match(trigger.textContent, /添加/);

  trigger.focus();
  await press(trigger, "ArrowDown");
  const menu = document.querySelector("[data-add-menu]");
  assert.ok(menu);
  assert.equal(menu.getAttribute("role"), "menu");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.equal(trigger.getAttribute("aria-controls"), menu.id);
  assert.equal(document.activeElement.getAttribute("data-add-menu-item"), "zip");
  assert.equal(menu.querySelectorAll('[role="menuitem"]').length, 3);
  assert.equal(menu.querySelectorAll('[role="separator"]').length, 1);
  assert.equal(menu.querySelector('[data-add-menu-item="mine"]').getAttribute("aria-disabled"), "true");

  await press(document.activeElement, "ArrowDown");
  assert.equal(document.activeElement.getAttribute("data-add-menu-item"), "gh", "跳过禁用项");
  await press(document.activeElement, "ArrowDown");
  assert.equal(document.activeElement.getAttribute("data-add-menu-item"), "zip", "循环");
  await press(document.activeElement, "ArrowUp");
  assert.equal(document.activeElement.getAttribute("data-add-menu-item"), "gh");
  await press(document.activeElement, "Enter");
  assert.deepEqual(picked, ["gh"]);
  assert.equal(document.querySelector("[data-add-menu]"), null);
  assert.equal(document.activeElement, trigger);

  await press(trigger, "Enter");
  assert.ok(document.querySelector("[data-add-menu]"));
  await press(document.activeElement, "Escape");
  assert.equal(document.querySelector("[data-add-menu]"), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(escapedToParent, 0, "菜单吃掉 Esc，不连带关外层弹窗");

  await click(trigger);
  assert.ok(document.querySelector("[data-add-menu]"));
  await click(document.querySelector('[data-add-menu-item="mine"]'));
  assert.deepEqual(picked, ["gh"], "禁用项点了无效");
  await click(document.body);
  assert.equal(document.querySelector("[data-add-menu]"), null, "点外面关闭");
  await view.unmount();
});

test("ConfigItemCard：整卡可点（点击 / Enter / Space），开关与菜单不触发打开", async () => {
  let opened = 0;
  const toggled = [];
  const view = await mount(
    h(kit.ConfigItemCard, {
      title: "Deep Dossier",
      description: "多源调研",
      badge: h("span", null, "官方"),
      meta: "更新于 10月24日",
      toggle: { checked: true, onChange: (v) => toggled.push(v), label: "启用 Deep Dossier" },
      menu: h("button", { type: "button", id: "card-menu" }, "…"),
      onOpen: () => {
        opened += 1;
      },
    }),
  );
  const card = view.host.querySelector("[data-config-item-card]");
  assert.equal(card.getAttribute("role"), "button");
  assert.equal(card.getAttribute("tabindex"), "0");
  await click(card);
  assert.equal(opened, 1);
  await press(card, "Enter");
  await press(card, " ");
  assert.equal(opened, 3);
  const sw = view.host.querySelector('[role="switch"]');
  assert.equal(sw.getAttribute("aria-checked"), "true");
  assert.equal(sw.getAttribute("aria-label"), "启用 Deep Dossier");
  await click(sw);
  assert.deepEqual(toggled, [false]);
  await press(sw, "Enter");
  await click(view.host.querySelector("#card-menu"));
  assert.equal(opened, 3, "开关与菜单不打开详情");
  assert.match(view.host.textContent, /官方·更新于 10月24日/);
  await view.unmount();

  const plain = await mount(h(kit.ConfigItemCard, { title: "只读" }));
  assert.equal(plain.host.querySelector("[data-config-item-card]").getAttribute("role"), null);
  await plain.unmount();
});

const SKILL_MD = [
  "---",
  "name: deep-dossier",
  "license: Apache-2.0",
  "---",
  "",
  "# Deep Dossier",
  "",
  "Use it <script>window.__pwned = 1</script> safely.",
  "",
  '<img src="x" onerror="window.__pwned=2">',
].join("\n");

const TREE = [
  { path: "references", type: "dir" },
  { path: "references/sources.md", type: "file", kind: "markdown", size: 200 },
  { path: "scripts", type: "dir" },
  { path: "scripts/score.py", type: "file", kind: "code", size: 50 },
  { path: "assets/chart.png", type: "file", kind: "image", size: 1200 },
  { path: "assets/logo.svg", type: "file", kind: "image", size: 100 },
  { path: "data.bin", type: "file", kind: "binary", size: 4096 },
  { path: "big.txt", type: "file", kind: "text", size: 900000 },
  { path: "SKILL.md", type: "file", kind: "markdown", size: SKILL_MD.length },
];

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const FILES = {
  "SKILL.md": { path: "SKILL.md", kind: "markdown", size: SKILL_MD.length, text: SKILL_MD },
  "references/sources.md": { path: "references/sources.md", kind: "markdown", size: 10, text: "## Sources\n\n- a" },
  "scripts/score.py": { path: "scripts/score.py", kind: "code", size: 20, text: "def f():\n    return 1\n" },
  "assets/chart.png": { path: "assets/chart.png", kind: "image", size: 1200, data_url: PNG },
  "assets/logo.svg": { path: "assets/logo.svg", kind: "image", size: 100, data_url: "data:image/svg+xml;base64,PHN2Zz4=" },
  "data.bin": { path: "data.bin", kind: "binary", size: 4096 },
  "big.txt": { path: "big.txt", kind: "text", size: 900000, text: "x".repeat(10), truncated: true },
};

test("FolderTreeViewer：默认选中 SKILL.md；YAML 头成代码块；Markdown 不渲染原始 HTML；目录可折叠", async () => {
  const loads = [];
  const view = await mount(
    h(kit.FolderTreeViewer, {
      tree: TREE,
      loadFile: async (path) => {
        loads.push(path);
        return FILES[path] ?? null;
      },
      downloadUrl: kit.folderDownloadUrl("f1"),
    }),
  );
  const host = view.host;
  assert.deepEqual(loads, ["SKILL.md"]);
  const rows = [...host.querySelectorAll("[data-tree-path]")].map((el) => el.getAttribute("data-tree-path"));
  assert.deepEqual(rows.slice(0, 6), ["assets", "assets/chart.png", "assets/logo.svg", "references", "references/sources.md", "scripts"], "目录优先、第一层默认展开");
  const selected = host.querySelector('[aria-selected="true"]');
  assert.equal(selected.getAttribute("data-tree-path"), "SKILL.md");
  assert.equal(host.querySelector('[role="tree"]') !== null, true);

  const yaml = host.querySelector('[data-code-block="YAML"]');
  assert.ok(yaml, "frontmatter 抽成 YAML 代码块");
  assert.match(yaml.querySelector("pre").textContent, /name: deep-dossier\nlicense: Apache-2\.0/);
  assert.ok(yaml.querySelector("[data-copy-button]"));
  const content = host.querySelector("[data-folder-tree-content]");
  assert.equal(content.querySelector("h1").textContent, "Deep Dossier");
  assert.equal(content.querySelector("script"), null, "原始 HTML 不渲染");
  assert.equal(content.querySelector("img"), null, "原始 <img onerror> 不渲染");
  assert.equal(window.__pwned, undefined);
  assert.doesNotMatch(content.querySelector("h1").parentElement.textContent, /^---/);

  // 折叠 / 展开
  const scriptsDir = host.querySelector('[data-tree-path="scripts"]');
  assert.equal(scriptsDir.getAttribute("aria-expanded"), "true");
  await click(scriptsDir);
  assert.equal(scriptsDir.getAttribute("aria-expanded"), "false");
  assert.equal(host.querySelector('[data-tree-path="scripts/score.py"]'), null);
  await click(scriptsDir);
  assert.ok(host.querySelector('[data-tree-path="scripts/score.py"]'));

  // 代码文件：等宽 + 复制 + 行号
  await click(host.querySelector('[data-tree-path="scripts/score.py"]'));
  const code = host.querySelector('[data-code-block="python"]');
  assert.ok(code);
  assert.equal(code.querySelector("pre").textContent, "def f():\n    return 1\n");
  await click(code.querySelector("[data-copy-button]"));
  assert.equal(globalThis.__w09aCopied, "def f():\n    return 1\n");
  assert.match(code.querySelector("[data-copy-button]").textContent, /已复制/);
  const lineBtn = [...code.querySelectorAll("button")].find((b) => b.textContent === "行号");
  await click(lineBtn);
  assert.equal(lineBtn.getAttribute("aria-pressed"), "true");
  assert.match(host.querySelector('[data-code-block="python"] pre').textContent, /^1def f\(\):\n2    return 1\n$/);

  // 图片：栅格 data URL 预览；svg data URL 不当图片
  await click(host.querySelector('[data-tree-path="assets/chart.png"]'));
  const img = host.querySelector('[data-file-kind="image"] img');
  assert.equal(img.getAttribute("src"), PNG);
  await click(host.querySelector('[data-tree-path="assets/logo.svg"]'));
  assert.equal(host.querySelector('[data-file-kind="image"]'), null);
  assert.ok(host.querySelector('[data-file-kind="binary"]'));

  // 二进制：大小 + 下载
  await click(host.querySelector('[data-tree-path="data.bin"]'));
  const bin = host.querySelector('[data-file-kind="binary"]');
  assert.match(bin.textContent, /4 KB/);
  assert.match(bin.textContent, /下载整个文件夹/);

  // 截断提示
  await click(host.querySelector('[data-tree-path="big.txt"]'));
  assert.match(host.querySelector('[data-file-kind="text"]').textContent, /只显示了前一部分/);

  // 缓存：回到 SKILL.md 不再请求
  const n = loads.length;
  await click(host.querySelector('[data-tree-path="SKILL.md"]'));
  assert.equal(loads.length, n);
  await view.unmount();
});

test("FolderTreeViewer：读失败显示错误并可重试；initialPath 生效；空树", async () => {
  let fail = true;
  const view = await mount(
    h(kit.FolderTreeViewer, {
      tree: TREE,
      initialPath: "references/sources.md",
      loadFile: async (path) => (fail ? null : FILES[path]),
    }),
  );
  assert.equal(view.host.querySelector('[aria-selected="true"]').getAttribute("data-tree-path"), "references/sources.md");
  const err = view.host.querySelector("[data-folder-tree-error]");
  assert.ok(err);
  assert.match(err.textContent, /无法读取这个文件/);
  fail = false;
  await click(err.querySelector("button"));
  assert.equal(view.host.querySelector("[data-folder-tree-error]"), null);
  assert.equal(view.host.querySelector("[data-folder-tree-content] h2").textContent, "Sources");
  await view.unmount();

  const empty = await mount(h(kit.FolderTreeViewer, { tree: [], loadFile: async () => null, rootLabel: "技能文件" }));
  assert.match(empty.host.textContent, /这个文件夹是空的/);
  assert.match(empty.host.textContent, /技能文件/);
  await empty.unmount();
});

test("safeImageDataUrl：只放行栅格 base64", () => {
  assert.equal(kit.safeImageDataUrl(PNG), PNG);
  assert.equal(kit.safeImageDataUrl("data:image/jpeg;base64,/9j/4AAQ"), "data:image/jpeg;base64,/9j/4AAQ");
  assert.equal(kit.safeImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(kit.safeImageDataUrl("javascript:alert(1)"), null);
  assert.equal(kit.safeImageDataUrl("https://x/y.png"), null);
  assert.equal(kit.safeImageDataUrl(undefined), null);
});

test("SkillCover / ConfigEmptyState / ConfigToolbar", async () => {
  const withSrc = await mount(h(kit.SkillCover, { src: "https://gw.example/c.svg", title: "Skill Forge", size: "lg" }));
  const coverEl = withSrc.host.querySelector("[data-skill-cover]");
  assert.equal(coverEl.getAttribute("data-skill-cover"), "image");
  assert.equal(coverEl.querySelector("img").getAttribute("src"), "https://gw.example/c.svg");
  await withSrc.unmount();
  const none = await mount(h(kit.SkillCover, { src: null, title: "skill forge" }));
  assert.equal(none.host.querySelector("[data-skill-cover]").getAttribute("data-skill-cover"), "placeholder");
  assert.equal(none.host.textContent, "S");
  await none.unmount();

  const empty = await mount(
    h(kit.ConfigEmptyState, { title: "还没有技能", description: "添加一个", action: h("button", null, "+ 添加") }),
  );
  assert.equal(empty.host.querySelector("h3").textContent, "还没有技能");
  assert.ok(empty.host.querySelector("svg"), "默认线性图标");
  await empty.unmount();

  let value = "";
  const tb = await mount(
    h(kit.ConfigToolbar, {
      search: { value, onChange: (v) => (value = v), placeholder: "搜索" },
      filter: h("button", { id: "f" }, "f"),
      secondary: h("button", { id: "s" }, "s"),
      primary: h("button", { id: "p" }, "p"),
      more: h("button", { id: "m" }, "m"),
    }),
  );
  const input = tb.host.querySelector('input[type="search"]');
  assert.equal(input.getAttribute("aria-label"), "搜索");
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, "dossier");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  assert.equal(value, "dossier");
  assert.deepEqual([...tb.host.querySelectorAll("button")].map((b) => b.id), ["f", "s", "p", "m"]);
  await tb.unmount();
});

// ===========================================================================
// 4. 源码闸
// ===========================================================================

const KIT_FILES = readdirSync(KIT_DIR).filter((f) => /\.(tsx?|mjs)$/.test(f));

test("kit 源码：无 innerHTML / dangerouslySetInnerHTML / eval / new Function / javascript:", () => {
  assert.ok(KIT_FILES.length >= 10);
  for (const f of KIT_FILES) {
    const src = readFileSync(new URL(f, KIT_DIR), "utf8");
    assert.doesNotMatch(src, /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|\beval\s*\(|new\s+Function\s*\(|javascript:/, f);
  }
  const viewer = read("src/shell/skills/kit/FolderTreeViewer.tsx");
  assert.match(viewer, /import \{ Markdown \} from "\.\.\/\.\.\/Markdown";/, "Markdown 只用现有组件");
  assert.match(read("src/shell/Markdown.tsx"), /skipHtml/);
  assert.doesNotMatch(viewer, /rehype-raw/);
});

test("合同 §3.4：W09A 名字全部从 skills/kit 导出，并经 @oceanleo/ui/shell 透出", () => {
  for (const name of [
    "folderApi", "ConfigDialogShell", "ConfigToolbar", "AddMenu", "ConfigEmptyState",
    "ConfigItemCard", "FolderTreeViewer", "SkillCover",
  ]) {
    assert.ok(kit[name], `缺导出 ${name}`);
  }
  for (const fn of [
    "listOfficialSkills", "getOfficialSkill", "getOfficialSkillFile", "officialSkillDownloadUrl",
    "officialSkillCoverUrl", "officialSkillShareUrl", "listFolders", "getFolder", "getFolderFile",
    "folderDownloadUrl", "addOfficialSkill", "importFolderZip", "importFolderFromGithub", "createSkill",
    "copyFolderToProject", "updateFolder", "deleteFolder",
  ]) {
    assert.equal(typeof kit.folderApi[fn], "function", `folderApi.${fn}`);
  }
  const index = read("src/shell/skills/kit/index.ts");
  for (const t of ["OfficialSkill", "Folder", "TreeEntry", "FileContent"]) {
    assert.match(index, new RegExp(`\\b${t},`), `类型 ${t}`);
  }
  // 父任务可能把两行收成 `export * from "./skills"`（再由 skills/index.ts 转 `./kit`）；两种接法都认。
  const shellIndex = read("src/shell/index.ts");
  const direct = /export \* from "\.\/skills\/kit";/.test(shellIndex);
  const viaSkills =
    /export \* from "\.\/skills";/.test(shellIndex) &&
    /export \* from "\.\/kit";/.test(read("src/shell/skills/index.ts"));
  assert.ok(direct || viaSkills, "@oceanleo/ui/shell 必须透出 skills/kit");
});

test("文案分表：16 语齐全、key 等于中文原文、非中日韩语种不含汉字；kit 里每条 tt() 都有译文", async () => {
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { SKO_W09A_MESSAGES, SKO_W09A_SOURCE } = await import("../src/i18n/ui/messages/sko-w09a-copy.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const zhValues = Object.values(SKO_W09A_SOURCE);
  assert.ok(zhValues.length >= 15);
  for (const locale of LOCALES) {
    const dict = SKO_W09A_MESSAGES[locale];
    assert.deepEqual(Object.keys(dict).sort(), [...zhValues].sort(), locale);
    for (const [k, v] of Object.entries(dict)) {
      assert.ok(v && v.trim(), `${locale} ${k}`);
      if (!["zh", "zh-TW", "ja"].includes(locale)) assert.doesNotMatch(v, /\p{Script=Han}/u, `${locale}: ${v}`);
      if (locale !== "zh" && locale !== "zh-TW") assert.notEqual(v, k, `${locale} 未翻译：${k}`);
    }
  }
  // 源码里 tt("…") 的字面量 + 错误回退句，都要 16 语有译文（同 i18n-tt-key-coverage 的判据）
  const keys = new Set(Object.values(kit.FOLDER_ERROR_FALLBACKS));
  for (const f of KIT_FILES) {
    const src = readFileSync(new URL(f, KIT_DIR), "utf8");
    for (const m of src.matchAll(/\btt\(\s*"([^"]+)"/g)) keys.add(m[1]);
  }
  const missing = [];
  for (const k of keys) {
    for (const locale of LOCALES) {
      if (locale === "zh") continue;
      if (!UI_MESSAGES[locale]?.[k]) missing.push(`${locale}:${k}`);
    }
  }
  assert.deepEqual(missing, []);
  for (const k of keys) assert.doesNotMatch(k, /模板/, "useUI 会把「模板」改写成「灵感」，kit 文案不能用这个词");
});

test("仲裁 A-24：kit 的点击目标 ≥ 44px，outline-none 的元素都补了 focus-visible 环", async () => {
  // 交互元素（button / a / input / role=switch|menuitem|treeitem）不再写死 < 44 的高度
  for (const f of KIT_FILES.filter((x) => x.endsWith(".tsx") && x !== "kit-icons.tsx")) {
    const src = readFileSync(new URL(f, KIT_DIR), "utf8");
    for (const m of src.matchAll(/<(button|a|input)\b(?:(?!<)[\s\S])*?className=\{?[`"]([^`"]*)/g)) {
      assert.doesNotMatch(m[2], /(^|\s)h-(?:[1-9]|10)(\s|$)/, `${f} <${m[1]}> 写死了 < 44 的高度：${m[2].slice(0, 60)}`);
    }
    for (const m of src.matchAll(/className=\{?[`"]([^`"]*\boutline-none\b[^`"]*)/g)) {
      assert.match(m[1], /focus-visible:ring-2/, `${f}: outline-none 要补 focus-visible:ring-2`);
    }
  }
  const toolbar = read("src/shell/skills/kit/ConfigToolbar.tsx");
  for (const name of ["CONFIG_TOOLBAR_BUTTON_CLASS", "CONFIG_TOOLBAR_ICON_BUTTON_CLASS", "CONFIG_PRIMARY_BUTTON_CLASS"]) {
    assert.match(toolbar, new RegExp(`${name} =\\s*"[^"]*\\bh-11\\b`), name);
  }
  // 开关：可点区 44×44，视觉轨道仍是 40×24
  const view = await mount(h(kit.ConfigToggle, { checked: false, onChange() {}, label: "t" }));
  const sw = view.host.querySelector('[role="switch"]');
  assert.match(sw.className, /\bmin-h-11\b/);
  assert.match(sw.className, /\bmin-w-11\b/);
  assert.match(sw.querySelector("[data-config-toggle-track]").className, /\bh-6 w-10\b/);
  await view.unmount();
});
