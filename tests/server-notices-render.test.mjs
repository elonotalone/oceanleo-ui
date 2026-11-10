import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { classifyNoticeLink } from "../src/shell/messages/notices/notice-links.ts";
import { serverNoticeLink } from "../src/shell/messages/notices/server-notice.ts";
import { SERVER_NOTICE_MESSAGES } from "../src/i18n/ui/messages/server-notice-copy.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const oldCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (oldCanvas) require.cache[canvasEntry] = oldCanvas; else delete require.cache[canvasEntry];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://preview.invalid/leochat" });
for (const name of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent"])
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: name === "window" ? dom.window : dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const ui = dataModule('export function useUI(){return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_,key) => vars?.[key] ?? key); }');
const source = (over = {}) => ({ computer_id: "pc1", machine_name: "工作电脑", source: "备份 / nightly?", enabled: true, min_level: "normal", first_seen_at: "2026-11-10T12:00:00Z", last_seen_at: "2026-11-10T12:00:00Z", sent_count: 2, ...over });
const notice = (over = {}) => ({ id: "n1", kind: "cloud_computer.notice", title: "备份状态", body: '<img src=x onerror="alert(1)">\n备份 {n} 完成', link: "https://status.example.org/detail", meta: { computer_id: "pc1", machine_name: "工作电脑", source: "备份 / nightly?", level: "urgent", repeat: 2, suppressed: 3, dropped: 4 }, read_at: null, created_at: "2026-11-10T12:00:00Z", ...over });
const state = {};
globalThis.__serverNotices = state;
const api = dataModule(`
 export async function listComputerNoticeSources(){return globalThis.__serverNotices.load();}
 export async function updateComputerNoticeSource(...args){return globalThis.__serverNotices.update(...args);}
 export async function forgetComputerNoticeSource(...args){return globalThis.__serverNotices.forget(...args);}
`);
const settings = await import(await compileModule("src/shell/messages/SettingsView.tsx", {
  "../../i18n/ui/useUI": ui,
  "./notify/NotifySettingsPanel": dataModule('export function NotifySettingsPanel(){return null;}'),
  "./call/diagnostics/diagnostics-store": dataModule('export function openCallTest(){}'),
  "../../../api/notifications": api,
}));
const stubs = {
  "../../../i18n/ui/useUI": ui,
  "./use-notices": dataModule(`export function useNoticeState(){return globalThis.__serverNotices.notices;} export function noticeStore(){return {refresh:async()=>{},markAllRead:async()=>{},loadMore:async()=>{}};}`),
  "../messages-surface": dataModule('export function ImBackIcon(){return null;}'),
  "../cases/use-owner-cases": dataModule('export function useOwnerCases(){return {phase:"ready",cases:[]};}'),
  "../../bay/shell/bay-state": dataModule('export function bayEnabledHere(){return true;} export function openBay(){}'),
  "../host-state": dataModule('export function hostState(){return {open(value){globalThis.__serverNotices.opened=value;}};} export function closeMessages(){} export function openMessages(){} export function isCaseId(){return false;} export function parseImDeepLink(){return {kind:"none"};}'),
};
const { NoticeDetailView } = await import(await compileModule("src/shell/messages/notices/NoticeDetailView.tsx", stubs));
const { NoticesView } = await import(await compileModule("src/shell/messages/notices/NoticesView.tsx", stubs));

let roots, errors;
beforeEach((t) => {
  roots = []; errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args.map(String).join(" ")));
  state.load = async () => ({ ok: true, data: { items: [source()] } });
  state.update = async () => ({ ok: true });
  state.forget = async () => ({ ok: true });
  state.notices = { loaded: true, items: [notice()], unread: 0, loading: false, error: false };
});
afterEach(async () => {
  for (const root of roots) { await act(async () => root.unmount()); }
  document.body.replaceChildren();
  assert.deepEqual(errors, [], "changed components must render without console.error");
});
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
async function mount(Component, props = {}) {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const render = async () => { await act(async () => root.render(React.createElement(Component, props))); };
  await render();
  return { host, render, click: async (node) => { assert.ok(node); await act(async () => node.click()); } };
}
function row(host, computer = "pc1", src = "备份 / nightly?") {
  return [...host.querySelectorAll(`[data-server-notice-computer="${computer}"] [data-server-notice-source]`)].find(node => node.dataset.serverNoticeSource === src);
}

for (const Component of [NoticesView, NoticeDetailView]) {
  test(`${Component.name} renders machine, source, urgent, time, plain body, counters and an https action`, async (t) => {
    const view = await mount(Component, { noticeId: "n1", onBack() {} });
    assert.match(view.host.textContent, /工作电脑 · 备份 \/ nightly\?/);
    assert.match(view.host.textContent, /紧急/);
    assert.match(view.host.textContent, /重复 2 次 · 已限流 3 条 · 本机队列已丢弃 4 条/);
    assert.match(view.host.textContent, /<img src=x onerror="alert\(1\)">/);
    assert.match(view.host.textContent, /备份 \{n\} 完成/);
    assert.equal(view.host.querySelector("img"), null);
    assert.ok(view.host.querySelector("time") || view.host.textContent.match(/\d+:\d+/));
    if (Component === NoticeDetailView) {
      const calls = [];
      t.mock.method(window, "open", (...args) => calls.push(args));
      await view.click(view.host.querySelector("[data-notice-detail-target]"));
      assert.deepEqual(calls, [["https://status.example.org/detail", "_blank", "noopener,noreferrer"]]);
    }
  });
}

test("server notices reject unsafe links everywhere; normal notices retain existing relative links", async () => {
  for (const link of ["http://example.org", "javascript:alert(1)", "data:text/html,<script>", "/history?task=1", "//example.org", "https://user:pass@example.org", "https://", "https://example.org/" + "x".repeat(1024)]) {
    assert.equal(serverNoticeLink(link), null, link.slice(0, 100));
    assert.deepEqual(classifyNoticeLink({ kind: "cloud_computer.notice", link }), { kind: "none" });
    state.notices.items = [notice({ link })];
    const view = await mount(NoticeDetailView, { noticeId: "n1", onBack() {} });
    assert.equal(view.host.querySelector("[data-notice-detail-target]"), null);
  }
  assert.equal(classifyNoticeLink({ kind: "cloud_computer.notice", link: "https://preview.invalid/history" }, { pageHost: "preview.invalid" }).kind, "external");
  assert.equal(classifyNoticeLink({ kind: "ordinary", link: "/history?task=1" }).kind, "internal");
});

test("normal server notice hides urgency and absent/invalid counters", async () => {
  state.notices.items = [notice({ meta: { machine_name: "电脑", source: "脚本", level: "normal", repeat: -1, suppressed: "3", dropped: NaN } })];
  const view = await mount(NoticeDetailView, { noticeId: "n1", onBack() {} });
  assert.equal(view.host.querySelector("[data-server-notice-urgent]"), null);
  assert.equal(view.host.querySelector("[data-server-notice-counts]"), null);
});

test("script title and computer/source labels remain literal text, including missing metadata", async () => {
  state.notices.items = [notice({ title: '<script>alert(1)</script>', meta: { machine_name: '<b>电脑</b>', source: '<svg onload="alert(1)">' } })];
  const view = await mount(NoticeDetailView, { noticeId: "n1", onBack() {} });
  assert.match(view.host.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(view.host.textContent, /<b>电脑<\/b> · <svg/);
  assert.equal(view.host.querySelector("script, b, svg[onload]"), null);
  state.notices.items = [notice({ meta: null })];
  await view.render();
  assert.match(view.host.textContent, /备份状态/);
});

test("message settings mount loading, group sources per computer and optimistically toggle receive/urgent both ways", async () => {
  const load = deferred(); state.load = () => load.promise;
  const view = await mount(settings.SettingsView, { onOpenBlocks() {} });
  assert.ok(view.host.querySelector("[data-server-notice-settings]"));
  assert.match(view.host.textContent, /正在加载/);
  await act(async () => load.resolve({ ok: true, data: { items: [source(), source({ source: "磁盘" }), source({ computer_id: "pc2", machine_name: "笔记本" })] } }));
  assert.equal(view.host.querySelectorAll("[data-server-notice-computer]").length, 2);
  assert.equal(view.host.querySelector('[data-server-notice-computer="pc1"]').querySelectorAll("[data-server-notice-source]").length, 2);
  for (const [index, patch, before] of [[0, { enabled: false }, "true"], [0, { enabled: true }, "false"], [1, { min_level: "urgent" }, "false"], [1, { min_level: "normal" }, "true"]]) {
    const save = deferred(); let args;
    state.update = (...values) => { args = values; return save.promise; };
    const toggle = row(view.host).querySelectorAll('[role="switch"]')[index];
    assert.equal(toggle.getAttribute("aria-checked"), before);
    await view.click(toggle);
    assert.equal(toggle.getAttribute("aria-checked"), before === "true" ? "false" : "true");
    assert.equal(toggle.disabled, true);
    assert.deepEqual(args, ["pc1", "备份 / nightly?", patch]);
    await act(async () => save.resolve({ ok: true }));
    assert.equal(toggle.disabled, false);
  }
});

test("failed toggle restores the previous value while another source's successful edit remains", async () => {
  state.load = async () => ({ ok: true, data: { items: [source(), source({ source: "磁盘" })] } });
  const view = await mount(settings.SettingsView, { onOpenBlocks() {} });
  const save = deferred();
  state.update = (_computer, src) => src === "磁盘" ? Promise.resolve({ ok: true }) : save.promise;
  await view.click(row(view.host).querySelector('[role="switch"]'));
  await view.click(row(view.host, "pc1", "磁盘").querySelector('[role="switch"]'));
  await act(async () => save.resolve({ ok: false }));
  assert.equal(row(view.host).querySelector('[role="switch"]').getAttribute("aria-checked"), "true");
  assert.equal(row(view.host, "pc1", "磁盘").querySelector('[role="switch"]').getAttribute("aria-checked"), "false");
  assert.match(view.host.querySelector('[role="alert"]').textContent, /已恢复原设置/);
});

test("forget removes optimistically, restores on rejection, and succeeds on retry", async () => {
  const view = await mount(settings.SettingsView, { onOpenBlocks() {} });
  let save = deferred(); let args;
  state.forget = (...values) => { args = values; return save.promise; };
  const forget = () => [...row(view.host).querySelectorAll("button")].find(button => button.textContent === "忘记来源");
  await view.click(forget());
  assert.equal(row(view.host), undefined);
  assert.deepEqual(args, ["pc1", "备份 / nightly?"]);
  await act(async () => save.reject(new Error("offline")));
  assert.ok(row(view.host));
  assert.match(view.host.textContent, /已恢复原设置/);
  save = deferred();
  await view.click(forget());
  await act(async () => save.resolve({ ok: true }));
  assert.ok(view.host.querySelector("[data-server-notice-empty]"));
});

test("empty source list explains automatic sources, copies exact example and handles clipboard denial", async (t) => {
  state.load = async () => ({ ok: true, data: { items: [] } });
  const copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => copied.push(text) } });
  const view = await mount(settings.SettingsView, { onOpenBlocks() {} });
  assert.match(view.host.textContent, /来源会自动出现/);
  const example = view.host.querySelector('[aria-label="消息命令示例"]');
  assert.equal(example.value, 'oceanleo-node notify "备份完成"');
  assert.equal(example.readOnly, true);
  const copy = [...view.host.querySelectorAll("button")].find(button => button.textContent === "复制命令");
  await view.click(copy);
  assert.deepEqual(copied, [example.value]);
  assert.match(view.host.textContent, /已复制/);
  t.mock.method(navigator.clipboard, "writeText", async () => { throw new Error("denied"); });
  await view.click(copy);
  assert.match(view.host.textContent, /无法复制/);
});

test("settings load failure can retry without showing an empty-source claim", async () => {
  state.load = async () => ({ ok: false });
  const view = await mount(settings.SettingsView, { onOpenBlocks() {} });
  assert.match(view.host.querySelector('[role="alert"]').textContent, /暂时无法加载/);
  assert.equal(view.host.querySelector("[data-server-notice-empty]"), null);
  state.load = async () => ({ ok: true, data: { items: [source()] } });
  await view.click([...view.host.querySelectorAll("button")].find(button => button.textContent === "重试"));
  assert.ok(row(view.host));
});

test("server notice copy is registered in runtime loader and keeps count placeholders across locales", async () => {
  const en = await loadUiMessages("en");
  assert.equal(en["服务器消息"], "Server messages");
  for (const [locale, dict] of Object.entries(SERVER_NOTICE_MESSAGES)) {
    if (!["zh", "zh-TW", "en"].includes(locale)) assert.notDeepEqual(dict, SERVER_NOTICE_MESSAGES.en, `${locale}: English fallback`);
    for (const key of Object.keys(SERVER_NOTICE_MESSAGES.zh)) {
      assert.ok(dict[key]?.trim(), `${locale}: ${key}`);
      if (locale !== "zh") assert.notEqual(dict[key], key, `${locale}: untranslated ${key}`);
      if (key.includes("{n}")) assert.ok(dict[key].includes("{n}"));
    }
  }
});

test("new server-notice utility classes already exist in committed ui.css", () => {
  const css = execFileSync("git", ["show", "HEAD:src/theme/ui.css"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  for (const name of ["ServerNoticeMeta.tsx", "ServerNoticeSettings.tsx"]) {
    const source = readFileSync(new URL(`../src/shell/messages/notices/${name}`, import.meta.url), "utf8");
    const classes = new Set([...source.matchAll(/className="([^"]+)"/g)].flatMap(match => match[1].split(/\s+/)));
    for (const literal of ["bg-neutral-900", "bg-neutral-300", "translate-x-[18px]", "translate-x-[3px]"]) classes.add(literal);
    for (const cls of classes) assert.ok(css.includes("." + cls.replace(/[^\w-]/g, char => "\\" + char)), `${name}: ${cls} missing from committed CSS`);
  }
});
