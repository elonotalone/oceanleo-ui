// Skills overhaul 2026-10-24 — W09B：技能管理面板 / 官方库弹窗 / 技能详情 / `/` 选择列表
// （src/shell/skills/manager；合同 §3.4）。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//     --experimental-loader ./tests/ts-extension-loader.mjs --test tests/sko-w09b-manager.test.mjs
//
// 覆盖：
//   1. 纯逻辑：筛选（来源/分类/只看已启用/搜索名称+描述）、排序、默认开关规则（D7）、未审核来源、
//      已添加检测、`/` 合并与过滤、自建表单校验、GitHub 地址、项目列表过滤。
//   2. 渲染（jsdom + react-dom/client，fetch 替身扮演网关 §3.2）：
//      SkillsManager 个人/项目/只读三种范围；Add ▾ 菜单项；开关乐观更新 + 失败回滚；删除确认；
//      上传 .zip；GitHub 导入；自建技能；从我的技能导入（多选 → copy）；空状态。
//      OfficialSkillLibraryDialog 分类 tab、搜索、已添加角标、点卡进详情。
//      SkillDetailModal 添加到我的技能 / 本项目、已添加、查看详情（左树右文）、分享复制公开页链接。
//      SkillPickerList 合并个人+项目、前缀优先、受控 activeIndex、onItemsChange、点击选中。
//   3. 源码闸：manager 里没有 innerHTML / dangerouslySetInnerHTML / eval / new Function / javascript:；
//      合同 §3.4 的名字从 index 导出；manager 里每条 tt() 文案 16 语齐全。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire, register } from "node:module";
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

const dom = new JSDOM("<!doctype html><html lang=\"zh\"><body></body></html>", {
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
  File: window.File,
  Blob: window.Blob,
  FormData: window.FormData,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
Object.defineProperty(window.navigator, "clipboard", {
  configurable: true,
  value: {
    async writeText(value) {
      globalThis.__w09bCopied = value;
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
    export async function accessToken() { return globalThis.__w09bToken === undefined ? "tok" : globalThis.__w09bToken; }
  `),
  "next-intl": dataModule(`
    export function useLocale() { return globalThis.__w09bLocale || "zh"; }
  `),
};

const manager = await import(await compileModule("src/shell/skills/manager/index.ts", STUBS));
const logic = await import(await compileModule("src/shell/skills/manager/logic.ts"));
const projectsClient = await import(await compileModule("src/shell/skills/manager/projects-client.ts", STUBS));

const ROOT = new URL("../", import.meta.url);
const MANAGER_DIR = new URL("src/shell/skills/manager/", ROOT);
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");

// ---------------------------------------------------------------------------
// fixtures + fake gateway (contract §3.2 shapes)
// ---------------------------------------------------------------------------

function official(name, category, extra = {}) {
  return {
    name,
    title: name.replace(/-/g, " "),
    title_zh: `${name}-中文`,
    description: `${name} english description`,
    summary_zh: `${name} 中文介绍`,
    category,
    version: "1.0.0",
    author: "OceanLeo",
    license: "Apache-2.0",
    connectors: ["github"],
    tools: ["web_search"],
    updated_at: "2026-10-24T02:34:00Z",
    cover_url: `/v1/skills/official/${name}/cover.svg`,
    file_count: 4,
    download_url: `/v1/skills/official/${name}/download`,
    share_path: `/skills/${name}`,
    ...extra,
  };
}

let seq = 0;
function folder(name, source, extra = {}) {
  seq += 1;
  const off = extra.official === undefined && source === "official" ? official(name, extra.category || "research") : extra.official ?? null;
  return {
    id: extra.id || `f-${name}-${seq}`,
    title: extra.title || name,
    source,
    origin: extra.origin || {},
    project_id: extra.project_id ?? null,
    skill: extra.skill === null ? null : { name, description: extra.description || `${name} does things`, enabled: extra.enabled ?? true },
    cover_url: null,
    file_count: 3,
    total_bytes: 1200,
    created_at: "2026-10-20T00:00:00Z",
    updated_at: extra.updated_at || "2026-10-24T02:34:00Z",
    can_edit: extra.can_edit ?? true,
    official: off,
  };
}

const server = {
  mine: [],
  project: {},
  official: [],
  categories: [],
  calls: [],
  failPatch: false,
  projects: [],
};

function resetServer() {
  server.mine = [];
  server.project = {};
  server.official = [];
  server.categories = [];
  server.calls = [];
  server.failPatch = false;
  server.projects = [];
  globalThis.__w09bToken = undefined;
  globalThis.__w09bLocale = "zh";
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function scopeList(projectId) {
  if (!projectId) return server.mine;
  server.project[projectId] ||= [];
  return server.project[projectId];
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const method = (init.method || "GET").toUpperCase();
  let body = init.body;
  if (typeof body === "string") body = JSON.parse(body);
  server.calls.push({ method, path: url.pathname, search: url.search, body });
  const p = url.pathname;
  if (method === "GET" && p === "/v1/skills/official") {
    return json(200, { items: server.official, categories: server.categories });
  }
  let m = /^\/v1\/skills\/official\/([^/]+)$/.exec(p);
  if (method === "GET" && m) {
    const skill = server.official.find((s) => s.name === m[1]);
    if (!skill) return json(404, { detail: { code: "not_found", message: "找不到" } });
    return json(200, {
      skill,
      tree: [
        { path: "references", type: "dir" },
        { path: "references/guide.md", type: "file", size: 20, kind: "markdown" },
        { path: "SKILL.md", type: "file", size: 40, kind: "markdown" },
      ],
    });
  }
  m = /^\/v1\/skills\/official\/([^/]+)\/file$/.exec(p);
  if (method === "GET" && m) {
    const path = url.searchParams.get("path");
    return json(200, { path, kind: "markdown", size: 40, text: `---\nname: ${m[1]}\n---\n# ${m[1]} body\n` });
  }
  if (method === "GET" && p === "/v1/folders") {
    const scope = url.searchParams.get("scope");
    const projectId = url.searchParams.get("project_id") || undefined;
    return json(200, { items: scope === "project" ? scopeList(projectId) : server.mine });
  }
  m = /^\/v1\/folders\/([^/]+)$/.exec(p);
  if (method === "GET" && m) {
    const all = [...server.mine, ...Object.values(server.project).flat()];
    const f = all.find((x) => x.id === m[1]);
    if (!f) return json(404, { detail: { code: "not_found", message: "找不到" } });
    return json(200, { folder: f, tree: [{ path: "SKILL.md", type: "file", size: 10, kind: "markdown" }] });
  }
  if (method === "PATCH" && m) {
    if (server.failPatch) return json(500, { detail: { code: "request_failed", message: "服务器出错" } });
    const all = [...server.mine, ...Object.values(server.project).flat()];
    const f = all.find((x) => x.id === m[1]);
    if (body.enabled !== undefined && f.skill) f.skill = { ...f.skill, enabled: body.enabled };
    return json(200, { folder: f });
  }
  if (method === "DELETE" && m) {
    server.mine = server.mine.filter((x) => x.id !== m[1]);
    for (const k of Object.keys(server.project)) server.project[k] = server.project[k].filter((x) => x.id !== m[1]);
    return json(200, { ok: true });
  }
  if (method === "POST" && p === "/v1/folders/from-official") {
    const off = server.official.find((s) => s.name === body.name);
    const f = folder(body.name, "official", { official: off, project_id: body.project_id ?? null, category: off?.category });
    scopeList(body.project_id).unshift(f);
    return json(200, { folder: f });
  }
  if (method === "POST" && p === "/v1/folders/import") {
    const file = body.get("file");
    const projectId = body.get("project_id") || undefined;
    const f = folder(String(file.name).replace(/\.(zip|skill)$/, ""), "upload", { enabled: false, project_id: projectId ?? null });
    scopeList(projectId).unshift(f);
    server.calls.at(-1).body = { file: file.name, project_id: projectId ?? null };
    return json(200, { folder: f });
  }
  if (method === "POST" && p === "/v1/folders/import-github") {
    if (!/github\.com/.test(body.url)) return json(400, { detail: { code: "github_unsupported", message: "只支持公开 GitHub" } });
    const f = folder("gh-skill", "github", { enabled: false, project_id: body.project_id ?? null });
    scopeList(body.project_id).unshift(f);
    return json(200, { folder: f });
  }
  if (method === "POST" && p === "/v1/folders/create-skill") {
    const f = folder(body.name, "created", { description: body.description, project_id: body.project_id ?? null });
    scopeList(body.project_id).unshift(f);
    return json(200, { folder: f });
  }
  m = /^\/v1\/folders\/([^/]+)\/copy$/.exec(p);
  if (method === "POST" && m) {
    const src = server.mine.find((x) => x.id === m[1]);
    const f = folder(src.skill.name, "copy", { project_id: body.project_id, origin: { source: src.source }, enabled: src.skill.enabled });
    scopeList(body.project_id).unshift(f);
    return json(200, { folder: f });
  }
  if (method === "GET" && p === "/v1/projects") {
    return json(200, { items: server.projects });
  }
  return json(404, { detail: { code: "not_found", message: `unhandled ${method} ${p}` } });
};

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

async function flush(n = 6) {
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
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
      document.body.innerHTML = "";
    },
  };
}

async function click(el) {
  assert.ok(el, "click target exists");
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function mouseDown(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  });
  await flush();
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await flush();
}

async function typeInto(input, value) {
  const proto = input.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await flush();
}

function byText(root, selector, text) {
  return [...root.querySelectorAll(selector)].find((el) => el.textContent.trim().includes(text)) || null;
}

/** Open menu items only — closed popovers stay mounted with `hidden` (anchored-popover keeps them for the exit transition). */
function menuItems() {
  return [...document.querySelectorAll("[role='menuitem']")].filter((el) => !el.closest("[hidden]"));
}

function menuItem(text) {
  return menuItems().find((el) => el.textContent.trim().includes(text)) || null;
}

function cards() {
  return [...document.querySelectorAll("[data-skill-card]")];
}

function card(name) {
  return document.querySelector(`[data-skill-card="${name}"]`);
}

async function openAddMenu() {
  const trigger = byText(document, "[data-testid='skills-manager'] button", "添加");
  await click(trigger);
  return menuItems();
}

// ---------------------------------------------------------------------------
// 1. pure logic
// ---------------------------------------------------------------------------

test("logic: filter by source / category / enabled / query (name + description)", () => {
  const items = [
    folder("deep-dossier", "official", { category: "research" }),
    folder("chart-smith", "official", { category: "data", enabled: false }),
    folder("my-upload", "upload", { enabled: false, description: "周报 生成" }),
    folder("weekly", "created", { description: "write the weekly report" }),
  ];
  const f = (patch) => logic.filterFolders(items, { ...logic.EMPTY_FILTER, ...patch }).map((x) => x.skill.name);
  assert.deepEqual(f({}), ["deep-dossier", "chart-smith", "my-upload", "weekly"]);
  assert.deepEqual(f({ sources: ["official"] }), ["deep-dossier", "chart-smith"]);
  assert.deepEqual(f({ sources: ["upload", "created"] }), ["my-upload", "weekly"]);
  assert.deepEqual(f({ categories: ["data"] }), ["chart-smith"]);
  assert.deepEqual(f({ enabledOnly: true }), ["deep-dossier", "weekly"]);
  assert.deepEqual(f({ query: "WEEKLY report" }), ["weekly"]);
  assert.deepEqual(f({ query: "周报" }), ["my-upload"]);
  assert.deepEqual(f({ query: "中文介绍" }), ["deep-dossier", "chart-smith"], "official summary_zh is searchable");
  assert.equal(logic.filterIsActive(logic.EMPTY_FILTER), false);
  assert.equal(logic.filterIsActive({ ...logic.EMPTY_FILTER, enabledOnly: true }), true);
});

test("logic: sort newest first, ties by title", () => {
  const a = folder("a", "created", { updated_at: "2026-10-01T00:00:00Z" });
  const b = folder("b", "created", { updated_at: "2026-10-24T00:00:00Z" });
  const c = folder("c", "created", { updated_at: "2026-10-24T00:00:00Z" });
  assert.deepEqual(logic.sortFolders([a, c, b]).map((x) => x.title), ["b", "c", "a"]);
});

test("logic: D7 default switch and unreviewed source", () => {
  assert.equal(logic.defaultEnabledFor({ source: "official", origin: {} }), true);
  assert.equal(logic.defaultEnabledFor({ source: "created", origin: {} }), true);
  assert.equal(logic.defaultEnabledFor({ source: "upload", origin: {} }), false);
  assert.equal(logic.defaultEnabledFor({ source: "github", origin: {} }), false);
  assert.equal(logic.defaultEnabledFor({ source: "copy", origin: { source: "github" } }), false);
  assert.equal(logic.defaultEnabledFor({ source: "copy", origin: { source: "official" } }), true);
  assert.equal(logic.isUnreviewedSource({ source: "upload", origin: {} }), true);
  assert.equal(logic.isUnreviewedSource({ source: "copy", origin: { source: "upload" } }), true);
  assert.equal(logic.isUnreviewedSource({ source: "official", origin: {} }), false);
});

test("logic: added detection, picker merge (project wins) and prefix-first filtering", () => {
  const mine = [folder("deep-dossier", "official"), folder("weekly", "created"), folder("plain", "upload", { skill: null })];
  const project = [folder("weekly", "copy", { description: "project copy" }), folder("deck-architect", "official", { category: "docs" })];
  assert.equal(logic.isOfficialAdded(mine, "deep-dossier"), true);
  assert.equal(logic.isOfficialAdded(mine, "chart-smith"), false);
  const merged = logic.mergeAvailableSkills(mine, project, "zh");
  assert.deepEqual(merged.map((s) => `${s.name}:${s.scope}`), ["deck-architect:project", "deep-dossier:personal", "weekly:project"]);
  assert.equal(merged.find((s) => s.name === "weekly").description, "project copy");
  assert.equal(merged.find((s) => s.name === "deep-dossier").title, "deep-dossier-中文", "zh locale uses title_zh");
  assert.equal(logic.mergeAvailableSkills(mine, [], "en").find((s) => s.name === "deep-dossier").title, "deep dossier");
  const skills = [
    { name: "deck-architect", title: "Deck", description: "", scope: "personal" },
    { name: "deep-dossier", title: "Dossier", description: "", scope: "personal" },
    { name: "landing-deep", title: "Landing", description: "", scope: "personal" },
  ];
  assert.deepEqual(logic.filterPickerSkills(skills, "dee").map((s) => s.name), ["deep-dossier", "landing-deep"]);
  // prefix matches first, then "contains" matches (landing-deep contains "de").
  assert.deepEqual(logic.filterPickerSkills(skills, "/de").map((s) => s.name), ["deck-architect", "deep-dossier", "landing-deep"]);
  assert.deepEqual(logic.filterPickerSkills(skills, "/deck").map((s) => s.name), ["deck-architect"]);
  assert.equal(logic.filterPickerSkills(skills, "").length, 3);
  assert.equal(logic.wrapIndex(-1, 3), 2);
  assert.equal(logic.wrapIndex(3, 3), 0);
  assert.equal(logic.wrapIndex(0, 0), -1);
});

test("logic: create-skill validation, slug, GitHub URL and archive checks", () => {
  assert.equal(logic.validateCreateSkill({ name: "weekly-report", description: "d", body: "b" }), null);
  assert.equal(logic.validateCreateSkill({ name: "Weekly", description: "d", body: "b" }), "name");
  assert.equal(logic.validateCreateSkill({ name: "-x", description: "d", body: "b" }), "name");
  assert.equal(logic.validateCreateSkill({ name: "x".repeat(65), description: "d", body: "b" }), "name");
  assert.equal(logic.validateCreateSkill({ name: "ok", description: " ", body: "b" }), "description");
  assert.equal(logic.validateCreateSkill({ name: "ok", description: "x".repeat(1025), body: "b" }), "description");
  assert.equal(logic.validateCreateSkill({ name: "ok", description: "d", body: "  " }), "body");
  assert.equal(logic.slugifySkillName("  Weekly Report!! v2 "), "weekly-report-v2");
  assert.equal(logic.isSupportedGithubUrl("https://github.com/anthropics/skills/tree/main/skills/pdf"), true);
  assert.equal(logic.isSupportedGithubUrl("https://github.com/anthropics"), false);
  assert.equal(logic.isSupportedGithubUrl("http://github.com/a/b"), false);
  assert.equal(logic.isSupportedGithubUrl("https://gitlab.com/a/b"), false);
  assert.equal(logic.isSupportedGithubUrl("javascript:alert(1)"), false);
  assert.equal(logic.isImportableArchive("x.ZIP"), true);
  assert.equal(logic.isImportableArchive("x.skill"), true);
  assert.equal(logic.isImportableArchive("x.tar.gz"), false);
});

test("projects client: only editable workspace projects are copy targets", () => {
  const rows = projectsClient.copyTargetsFrom([
    { id: "p1", name: "Mine", role: "owner", kind: "project" },
    { id: "p2", name: "Shared edit", role: "edit" },
    { id: "p3", name: "Shared view", role: "view" },
    { id: "p4", name: "Site", kind: "website", role: "owner" },
    { name: "no id" },
  ]);
  assert.deepEqual(rows.map((r) => r.id), ["p1", "p2"]);
  assert.deepEqual(projectsClient.copyTargetsFrom(null), []);
});

// ---------------------------------------------------------------------------
// 2. SkillsManager
// ---------------------------------------------------------------------------

test("SkillsManager (personal): cards, unreviewed tag, search, filter, add menu without 'from my skills'", async () => {
  resetServer();
  server.mine = [
    folder("deep-dossier", "official", { category: "research" }),
    folder("zip-skill", "upload", { enabled: false }),
    folder("weekly", "created", { updated_at: "2026-10-01T00:00:00Z" }),
  ];
  const view = await mount(React.createElement(manager.SkillsManager, { scope: { kind: "personal" } }));
  try {
    assert.equal(cards().length, 3);
    const list = server.calls.find((c) => c.path === "/v1/folders");
    assert.match(list.search, /scope=mine/);
    assert.match(list.search, /skills_only=1/);
    // Unreviewed tag only on the upload.
    assert.ok(card("zip-skill").querySelector("[data-unreviewed-source]"));
    assert.equal(card("deep-dossier").querySelector("[data-unreviewed-source]"), null);
    assert.match(card("deep-dossier").textContent, /官方/);
    assert.match(card("deep-dossier").textContent, /更新于/);
    // zh locale → official title_zh + summary_zh.
    assert.match(card("deep-dossier").textContent, /deep-dossier-中文/);
    assert.match(card("deep-dossier").textContent, /中文介绍/);
    // toggles mirror enabled.
    assert.equal(card("zip-skill").querySelector("[role='switch']").getAttribute("aria-checked"), "false");
    assert.equal(card("weekly").querySelector("[role='switch']").getAttribute("aria-checked"), "true");

    const search = document.querySelector("[data-config-toolbar-search] input[type='search']");
    await typeInto(search, "weekly");
    assert.deepEqual(cards().map((c) => c.getAttribute("data-skill-card")), ["weekly"]);
    await typeInto(search, "nothing-matches-this");
    assert.equal(cards().length, 0);
    assert.match(document.body.textContent, /没有匹配的技能/);
    await typeInto(search, "");

    // Filter: only enabled.
    await click(document.querySelector("[data-skills-filter-button]"));
    await click(menuItem("只看已启用"));
    assert.deepEqual(cards().map((c) => c.getAttribute("data-skill-card")).sort(), ["deep-dossier", "weekly"]);
    // Filter: source = upload (stack with enabled-only → nothing), then clear.
    await click(menuItem("上传"));
    assert.equal(cards().length, 0);
    await click(menuItem("清除筛选"));
    assert.equal(cards().length, 3);
    await pressEscape();
    assert.equal(menuItems().length, 0, "filter menu closed");

    const items = (await openAddMenu()).map((el) => el.textContent);
    assert.equal(items.length, 4);
    assert.ok(items.some((t) => t.includes("从本地文件添加") && t.includes("上传 .zip 或 .skill")));
    assert.ok(items.some((t) => t.includes("从官方库添加")));
    assert.ok(items.some((t) => t.includes("从 GitHub 导入")));
    assert.ok(items.some((t) => t.includes("自己写一个")));
    assert.ok(!items.some((t) => t.includes("从我的技能导入")), "personal scope has no 'import from my skills'");
  } finally {
    await view.unmount();
  }
});

test("SkillsManager: toggle is optimistic and rolls back on failure", async () => {
  resetServer();
  server.mine = [folder("weekly", "created")];
  const view = await mount(React.createElement(manager.SkillsManager, { scope: { kind: "personal" } }));
  try {
    const sw = () => card("weekly").querySelector("[role='switch']");
    await click(sw());
    const patch = server.calls.find((c) => c.method === "PATCH");
    assert.deepEqual(patch.body, { enabled: false });
    assert.equal(sw().getAttribute("aria-checked"), "false");

    server.failPatch = true;
    await click(sw());
    assert.equal(sw().getAttribute("aria-checked"), "false", "rolled back to the previous state after the 500");
    assert.equal(server.calls.filter((c) => c.method === "PATCH").length, 2);
  } finally {
    await view.unmount();
  }
});

test("SkillsManager: delete asks for confirmation, then removes the card", async () => {
  resetServer();
  server.mine = [folder("weekly", "created", { id: "f-weekly" }), folder("other", "created")];
  const view = await mount(React.createElement(manager.SkillsManager, { scope: { kind: "personal" } }));
  try {
    await click(card("weekly").querySelector("[aria-label='更多操作']"));
    const menuLabels = menuItems().map((el) => el.textContent.trim());
    assert.deepEqual(menuLabels, ["查看", "下载", "复制到项目", "删除"]);
    await click(menuItem("删除"));
    const dialog = document.querySelector("[data-testid='skills-delete-dialog']");
    assert.ok(dialog, "confirm dialog shown");
    assert.equal(server.calls.filter((c) => c.method === "DELETE").length, 0, "nothing deleted before confirming");
    await click(byText(dialog, "button", "删除"));
    await flush();
    const del = server.calls.find((c) => c.method === "DELETE");
    assert.equal(del.path, "/v1/folders/f-weekly");
    assert.equal(card("weekly"), null);
    assert.ok(card("other"));
  } finally {
    await view.unmount();
  }
});

test("SkillsManager (project, canEdit): add menu, upload .zip, GitHub, write one, import from my skills", async () => {
  resetServer();
  server.mine = [folder("weekly", "created", { id: "mine-weekly" }), folder("deep-dossier", "official", { id: "mine-dd" })];
  server.project.p1 = [folder("deep-dossier", "official", { project_id: "p1" })];
  const view = await mount(
    React.createElement(manager.SkillsManager, { scope: { kind: "project", projectId: "p1", canEdit: true } }),
  );
  try {
    const list = server.calls.find((c) => c.path === "/v1/folders");
    assert.match(list.search, /scope=project/);
    assert.match(list.search, /project_id=p1/);
    assert.equal(cards().length, 1);
    // Project scope: no "copy to project" in the card menu.
    await click(card("deep-dossier").querySelector("[aria-label='更多操作']"));
    assert.equal(menuItem("复制到项目"), null);
    await pressEscape();

    const items = await openAddMenu();
    assert.equal(items.length, 5);
    assert.ok(items.some((el) => el.textContent.includes("从我的技能导入")));
    await click(byText(document, "[data-testid='skills-manager'] button", "添加")); // toggle closed
    assert.equal(menuItems().length, 0);

    // Upload: hidden input → POST /v1/folders/import with project_id; new card starts off.
    const input = document.querySelector("[data-skills-file-input]");
    assert.equal(input.getAttribute("accept"), ".zip,.skill,application/zip");
    const file = new window.File(["PK"], "notes-helper.zip", { type: "application/zip" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => {
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    await flush();
    const imp = server.calls.find((c) => c.path === "/v1/folders/import");
    assert.deepEqual(imp.body, { file: "notes-helper.zip", project_id: "p1" });
    assert.equal(card("notes-helper").querySelector("[role='switch']").getAttribute("aria-checked"), "false");
    assert.ok(card("notes-helper").querySelector("[data-unreviewed-source]"));

    // GitHub: client-side validation, then POST.
    await openAddMenu();
    await click(menuItem("从 GitHub 导入"));
    const gh = document.querySelector("[data-testid='skills-github-dialog']");
    assert.match(gh.textContent, /只支持公开仓库/);
    await typeInto(gh.querySelector("input"), "https://gitlab.com/a/b");
    await click(byText(gh, "button", "导入"));
    assert.match(gh.textContent, /请粘贴 github\.com 上公开仓库的地址/);
    assert.equal(server.calls.filter((c) => c.path === "/v1/folders/import-github").length, 0);
    await typeInto(gh.querySelector("input"), "https://github.com/acme/skills/tree/main/gh-skill");
    await click(byText(gh, "button", "导入"));
    await flush();
    const ghCall = server.calls.find((c) => c.path === "/v1/folders/import-github");
    assert.deepEqual(ghCall.body, { url: "https://github.com/acme/skills/tree/main/gh-skill", project_id: "p1" });
    assert.ok(card("gh-skill"));

    // Write one.
    await openAddMenu();
    await click(menuItem("自己写一个"));
    const form = document.querySelector("[data-testid='skills-create-dialog']");
    const [nameInput] = form.querySelectorAll("input");
    const [descArea, bodyArea] = form.querySelectorAll("textarea");
    await click(byText(form, "button", "创建技能"));
    assert.match(form.textContent, /名称只能用小写英文/);
    await typeInto(nameInput, "Team Retro");
    await typeInto(descArea, "Run a team retrospective");
    await typeInto(bodyArea, "# Retro\n\n1. Collect notes");
    await click(byText(form, "button", "创建技能"));
    await flush();
    const created = server.calls.find((c) => c.path === "/v1/folders/create-skill");
    assert.deepEqual(created.body, {
      name: "team-retro",
      description: "Run a team retrospective",
      body: "# Retro\n\n1. Collect notes",
      project_id: "p1",
    });
    assert.ok(card("team-retro"));

    // Import from my skills: already-present name is disabled; pick the other → copy.
    await openAddMenu();
    await click(menuItem("从我的技能导入"));
    const mineDialog = document.querySelector("[data-testid='skills-import-mine-dialog']");
    const boxes = [...mineDialog.querySelectorAll("input[type='checkbox']")];
    assert.equal(boxes.length, 2);
    const ddLabel = byText(mineDialog, "label", "deep-dossier");
    assert.ok(ddLabel.querySelector("input").disabled, "already in project");
    assert.match(ddLabel.textContent, /已在项目中/);
    await click(byText(mineDialog, "label", "weekly").querySelector("input"));
    await click(byText(mineDialog, "button", "导入 1 个"));
    await flush();
    const copy = server.calls.find((c) => c.path === "/v1/folders/mine-weekly/copy");
    assert.deepEqual(copy.body, { project_id: "p1" });
    assert.ok(card("weekly"));
  } finally {
    await view.unmount();
  }
});

test("SkillsManager (project, read-only): no add, no switches, no delete", async () => {
  resetServer();
  server.project.p2 = [folder("deep-dossier", "official", { project_id: "p2", can_edit: false })];
  const view = await mount(
    React.createElement(manager.SkillsManager, { scope: { kind: "project", projectId: "p2", canEdit: false } }),
  );
  try {
    assert.equal(cards().length, 1);
    assert.equal(document.querySelectorAll("[role='switch']").length, 0);
    assert.equal(byText(document, "[data-testid='skills-manager'] button", "添加"), null);
    assert.match(card("deep-dossier").textContent, /已启用/);
    await click(card("deep-dossier").querySelector("[aria-label='更多操作']"));
    const labels = menuItems().map((el) => el.textContent.trim());
    assert.deepEqual(labels, ["查看", "下载"]);
  } finally {
    await view.unmount();
  }
  resetServer();
  server.project.p3 = [];
  const empty = await mount(
    React.createElement(manager.SkillsManager, { scope: { kind: "project", projectId: "p3", canEdit: false } }),
  );
  try {
    assert.match(document.body.textContent, /还没有技能/);
    assert.match(document.body.textContent, /项目所有者或可编辑成员可以添加技能/);
    assert.equal(byText(document, "button", "添加"), null);
  } finally {
    await empty.unmount();
  }
});

test("SkillsManager: empty state offers the Add menu; signed out shows a sign-in hint", async () => {
  resetServer();
  const view = await mount(React.createElement(manager.SkillsManager, { scope: { kind: "personal" } }));
  try {
    assert.match(document.body.textContent, /还没有技能/);
    assert.match(document.body.textContent, /从官方库添加，或导入、自己写一个技能/);
    const addButtons = [...document.querySelectorAll("button")].filter((b) => b.textContent.includes("添加"));
    assert.equal(addButtons.length, 2, "toolbar Add + empty-state Add");
  } finally {
    await view.unmount();
  }
  resetServer();
  globalThis.__w09bToken = null;
  const out = await mount(React.createElement(manager.SkillsManager, { scope: { kind: "personal" } }));
  try {
    assert.match(document.body.textContent, /登录后管理你的技能/);
    assert.equal(server.calls.filter((c) => c.path === "/v1/folders").length, 0, "no request without a token");
  } finally {
    await out.unmount();
  }
});

// ---------------------------------------------------------------------------
// 3. Official library + detail
// ---------------------------------------------------------------------------

test("OfficialSkillLibraryDialog: category dropdown, search, added badge, card → detail → add", async () => {
  resetServer();
  server.official = [
    official("deep-dossier", "research"),
    official("source-verifier", "research"),
    official("chart-smith", "data"),
  ];
  server.categories = [
    { id: "research", label: "Research", label_zh: "研究与情报" },
    { id: "data", label: "Data", label_zh: "数据与金融" },
  ];
  server.mine = [folder("deep-dossier", "official")];
  const added = [];
  const view = await mount(
    React.createElement(manager.OfficialSkillLibraryDialog, { open: true, onClose() {}, onAdded: (f) => added.push(f) }),
  );
  try {
    const dlg = document.querySelector("[data-testid='official-skill-library']");
    assert.ok(dlg);
    const category = dlg.querySelector("[data-collection-filter='official-skill-category']");
    assert.ok(category, "category dropdown shares the search toolbar");
    assert.ok(category.closest("[data-config-toolbar]").querySelector("input[type='search']"));
    assert.equal(dlg.querySelector("[role='tablist']"), null);
    assert.equal(dlg.querySelectorAll("[data-official-skill]").length, 3);
    assert.ok(dlg.querySelector("[data-official-skill='deep-dossier'] [data-official-added]"));
    assert.equal(dlg.querySelector("[data-official-skill='chart-smith'] [data-official-added]"), null);
    assert.match(dlg.textContent, /3 个技能/);
    const link = dlg.querySelector("[data-official-library-page-link]");
    assert.match(link.getAttribute("href"), /\/skills$/);
    assert.equal(link.getAttribute("target"), "_blank");
    assert.match(link.getAttribute("rel"), /noopener/);

    await click(category);
    const options = [...document.querySelectorAll("[role='option']")];
    assert.deepEqual(options.map((o) => o.textContent.trim()), ["全部", "研究与情报", "数据与金融"]);
    await click(options.find((o) => o.textContent.trim() === "数据与金融"));
    assert.deepEqual([...dlg.querySelectorAll("[data-official-skill]")].map((c) => c.getAttribute("data-official-skill")), ["chart-smith"]);
    await click(category);
    await click([...document.querySelectorAll("[role='option']")].find((o) => o.textContent.trim() === "全部"));
    await typeInto(dlg.querySelector("[data-config-toolbar-search] input[type='search']"), "verifier");
    assert.deepEqual([...dlg.querySelectorAll("[data-official-skill]")].map((c) => c.getAttribute("data-official-skill")), ["source-verifier"]);

    await click(dlg.querySelector("[data-official-skill='source-verifier']"));
    await flush();
    const detail = document.querySelector("[data-testid='skill-detail-modal']");
    assert.ok(detail, "detail modal opened on top");
    assert.match(detail.textContent, /source-verifier-中文/);
    assert.match(detail.textContent, /OceanLeo/);
    assert.match(detail.textContent, /source-verifier 中文介绍/);
    assert.match(detail.textContent, /推荐连接器/);
    assert.match(detail.textContent, /Apache-2\.0/);
    const add = detail.querySelector("[data-skill-add]");
    assert.match(add.textContent, /添加到我的技能/);
    await click(add);
    await flush();
    const post = server.calls.find((c) => c.path === "/v1/folders/from-official");
    assert.deepEqual(post.body, { name: "source-verifier" });
    assert.ok(detail.querySelector("[data-skill-added]"), "button flips to ✓ Added");
    assert.equal(added.length, 1);
    assert.equal(added[0].skill.name, "source-verifier");
  } finally {
    await view.unmount();
  }
});

test("SkillDetailModal: project wording, already-added, share link, view files (tree + content) and back", async () => {
  resetServer();
  server.official = [official("deck-architect", "docs")];
  server.project.p1 = [];
  const view = await mount(
    React.createElement(manager.SkillDetailModal, {
      open: true,
      onClose() {},
      skill: { kind: "official", name: "deck-architect" },
      projectId: "p1",
    }),
  );
  try {
    const detail = document.querySelector("[data-testid='skill-detail-modal']");
    assert.match(detail.querySelector("[data-skill-add]").textContent, /添加到本项目/);
    await click(detail.querySelector("[aria-label='分享']"));
    assert.match(globalThis.__w09bCopied, /\/skills\/deck-architect$/);
    assert.ok(detail.querySelector("[aria-label='下载']"));

    await click(detail.querySelector("[data-skill-add]"));
    await flush();
    const post = server.calls.find((c) => c.path === "/v1/folders/from-official");
    assert.deepEqual(post.body, { name: "deck-architect", project_id: "p1" });
    assert.ok(detail.querySelector("[data-skill-added]"));

    await click(detail.querySelector("[data-skill-view-files]"));
    await flush(10);
    assert.ok(detail.querySelector("[data-skill-detail-files]"));
    assert.ok(detail.querySelector("[data-skill-detail-back]"));
    assert.match(detail.textContent, /SKILL\.md/);
    assert.match(detail.textContent, /references/);
    assert.ok(server.calls.some((c) => c.path === "/v1/skills/official/deck-architect/file"), "SKILL.md loaded");
    await click(detail.querySelector("[data-skill-detail-back]"));
    assert.ok(detail.querySelector("[data-skill-detail-overview]"));
  } finally {
    await view.unmount();
  }
});

test("SkillDetailModal (folder): unreviewed warning, switch, no share", async () => {
  resetServer();
  server.mine = [folder("gh-skill", "github", { id: "f-gh", enabled: false })];
  const view = await mount(
    React.createElement(manager.SkillDetailModal, { open: true, onClose() {}, skill: { kind: "folder", id: "f-gh" } }),
  );
  try {
    const detail = document.querySelector("[data-testid='skill-detail-modal']");
    assert.ok(detail.querySelector("[data-unreviewed-warning]"));
    assert.equal(detail.querySelector("[aria-label='分享']"), null, "share only for official skills");
    assert.equal(detail.querySelector("[data-skill-add]"), null);
    assert.match(detail.textContent, /\/gh-skill/);
    const sw = detail.querySelector("[role='switch']");
    assert.equal(sw.getAttribute("aria-checked"), "false");
    await click(sw);
    assert.deepEqual(server.calls.find((c) => c.method === "PATCH").body, { enabled: true });
    assert.equal(detail.querySelector("[role='switch']").getAttribute("aria-checked"), "true");
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 4. `/` picker
// ---------------------------------------------------------------------------

test("SkillPickerList + useAvailableSkills: personal + project, filter, controlled index, pick", async () => {
  resetServer();
  server.mine = [folder("deep-dossier", "official"), folder("weekly", "created")];
  server.project.p1 = [folder("deck-architect", "official", { category: "docs", project_id: "p1" })];
  const picked = [];
  const reported = [];
  function Harness({ query, active }) {
    return React.createElement(manager.SkillPickerList, {
      projectId: "p1",
      query,
      onPick: (name) => picked.push(name),
      activeIndex: active,
      onActiveChange() {},
      onItemsChange: (items) => reported.push(items.map((i) => i.name)),
      id: "w15-list",
    });
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Harness, { query: "", active: 0 })));
    await flush();
    const names = () => [...host.querySelectorAll("[role='option']")].map((o) => o.getAttribute("data-skill-name"));
    assert.deepEqual(names(), ["deck-architect", "deep-dossier", "weekly"]);
    assert.match(host.querySelector("[data-skill-name='deck-architect']").textContent, /项目技能/);
    assert.match(host.querySelector("[data-skill-name='deep-dossier']").textContent, /\/deep-dossier/);
    assert.equal(host.querySelector("[role='listbox']").id, "w15-list");
    assert.equal(host.querySelector("[role='option']").id, "w15-list-option-0");

    await act(async () => root.render(React.createElement(Harness, { query: "de", active: 1 })));
    await flush();
    assert.deepEqual(names(), ["deck-architect", "deep-dossier"]);
    assert.deepEqual(reported.at(-1), ["deck-architect", "deep-dossier"]);
    assert.equal(host.querySelector("[data-skill-name='deep-dossier']").getAttribute("aria-selected"), "true");
    assert.equal(host.querySelector("[data-skill-name='deck-architect']").getAttribute("aria-selected"), "false");

    await mouseDown(host.querySelector("[data-skill-name='deep-dossier']"));
    assert.deepEqual(picked, ["deep-dossier"]);

    await act(async () => root.render(React.createElement(Harness, { query: "zzz", active: 0 })));
    await flush();
    assert.equal(host.querySelector("[role='listbox']"), null, "empty → renders nothing (W15 owns the empty line)");
    assert.equal(host.textContent, "");
    assert.deepEqual(reported.at(-1), []);
    // Same order as the exported pure function W15 uses for Enter / Tab.
    assert.deepEqual(
      manager.filterPickerSkills(logic.mergeAvailableSkills(server.mine, server.project.p1, "zh"), "de").map((s) => s.name),
      ["deck-architect", "deep-dossier"],
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

// ---------------------------------------------------------------------------
// 5. source gates
// ---------------------------------------------------------------------------

function managerSources() {
  return readdirSync(MANAGER_DIR)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: f, text: readFileSync(new URL(f, MANAGER_DIR), "utf8") }));
}

test("source gate (UC-4): no innerHTML / dangerouslySetInnerHTML / eval / new Function / javascript: in manager", () => {
  for (const { file, text } of managerSources()) {
    const code = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(code, /dangerouslySetInnerHTML/, file);
    assert.doesNotMatch(code, /\.innerHTML\s*=/, file);
    assert.doesNotMatch(code, /\beval\s*\(/, file);
    assert.doesNotMatch(code, /new\s+Function\s*\(/, file);
    assert.doesNotMatch(code, /["'`]javascript:/i, file);
  }
});

test("source gate: contract §3.4 names are exported from skills/manager/index", () => {
  for (const name of ["SkillsManager", "OfficialSkillLibraryDialog", "SkillDetailModal", "SkillPickerList", "useAvailableSkills", "filterPickerSkills"]) {
    assert.equal(typeof manager[name], "function", name);
  }
  const index = read("src/shell/skills/manager/index.ts");
  for (const type of ["SkillsManagerProps", "OfficialSkillLibraryDialogProps", "SkillDetailModalProps", "SkillPickerListProps"]) {
    assert.match(index, new RegExp(`\\b${type}\\b`), type);
  }
  // Parent wiring (11a701b7): shell/index.ts → `export * from "./skills"` → skills/index.ts → `export * from "./manager"`.
  const shellIndex = read("src/shell/index.ts");
  if (!/export \* from "\.\/skills\/manager"/.test(shellIndex)) {
    assert.match(shellIndex, /export \* from "\.\/skills"/);
    assert.match(read("src/shell/skills/index.ts"), /export \* from "\.\/manager"/);
  }
});

test("i18n: every tt() string in manager has all 16 non-Chinese translations", async () => {
  const { LOCALES } = await import("../src/i18n/config.ts");
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const keys = new Set();
  for (const { text } of managerSources()) {
    for (const m of text.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)) keys.add(JSON.parse(`"${m[1]}"`));
  }
  const { SKILL_CATEGORY_LABEL_ZH, FOLDER_SOURCE_LABEL_ZH } = logic;
  for (const v of [...Object.values(SKILL_CATEGORY_LABEL_ZH), ...Object.values(FOLDER_SOURCE_LABEL_ZH), "全部"]) keys.add(v);
  assert.ok(keys.size > 100, `found ${keys.size} keys`);
  const missing = [];
  for (const locale of LOCALES.filter((l) => l !== "zh")) {
    for (const key of keys) {
      if (typeof UI_MESSAGES[locale]?.[key] !== "string") missing.push(`${locale}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
  // The fragment itself must not drop placeholders.
  const { SKO_W09B_MESSAGES } = await import("../src/i18n/ui/messages/sko-w09b-copy.ts");
  for (const [key, zh] of Object.entries(SKO_W09B_MESSAGES.zh)) {
    const want = (zh.match(/\{\w+\}/g) || []).sort().join();
    for (const locale of LOCALES) {
      assert.equal((SKO_W09B_MESSAGES[locale][key].match(/\{\w+\}/g) || []).sort().join(), want, `${locale} ${key}`);
    }
  }
});
