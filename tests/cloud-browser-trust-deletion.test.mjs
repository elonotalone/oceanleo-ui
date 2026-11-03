import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { afterEach, test } from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve("react")).href;
const apiModule = dataModule(`
  export const cloudBrowserTrustApi = new Proxy({}, {
    get(_, key) { return (...args) => globalThis.__browserLoginDeleteTest[key](...args); },
  });
`);
const { CloudBrowserSettingsSection } = await import(await compileModule("src/pages/settings/CloudBrowserSettingsSection.tsx", {
  "../../lib/browser-trust": apiModule,
  "../../i18n/ui/useUI": dataModule(`
    const tt = (text, vars) => text.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? key));
    export function useUI() { return tt; }
  `),
  "../../shell/cloud-browser-trust": dataModule(`
    export function browserTrustActionLabel(value) { return value; }
    export function browserTrustScopeLabel(value) { return value; }
    export function browserTrustErrorCopy() { return "安全的错误提示"; }
  `),
  "../../ui": dataModule(`
    import { createElement } from ${JSON.stringify(reactUrl)};
    export function Switch({ checked, disabled, label, onChange }) {
      return createElement("button", { type: "button", role: "switch", "aria-label": label,
        "aria-checked": checked, disabled, onClick: () => onChange(!checked) });
    }
  `),
  "./CloudBrowserFlowsSection": dataModule("export function CloudBrowserFlowsSection() { return null; }"),
}));

const origins = {
  accounts: "https://accounts.example.com",
  mail: "https://mail.example.com",
  isolated: "https://other.example.org",
};
const mounted = [];

function runtime() {
  const api = {
    calls: [], revision: "9007199254740993",
    saved: Object.entries(origins).map(([id, origin]) => ({ id, origin, saved_at: "2026-11-04T00:00:00.000Z", last_used_at: null })),
    groups: { accounts: ["mail"], mail: ["accounts"], isolated: [] },
    settings: async () => ({ ok: true, data: { save_logins: true } }),
    logins: async () => ({ ok: true, data: { logins: api.saved.map(row => ({ ...row })) } }),
    approvals: async () => ({ ok: true, data: { approvals: [] } }),
    loginDeletePreview: async (id, signal) => {
      api.calls.push({ method: "preview", id, signal });
      return { ok: true, data: api.preview(id) };
    },
    deleteLogin: async (id, signal) => {
      api.calls.push({ method: "single", id, signal });
      api.saved = api.saved.filter(row => row.id !== id);
      api.revision = String(BigInt(api.revision) + 1n);
      return { ok: true, data: { ok: true } };
    },
    deleteRelatedLogins: async (id, revision, signal) => {
      api.calls.push({ method: "together", id, revision, signal });
      if (revision !== api.revision) return { ok: false, status: 409 };
      const removed = new Set([id, ...(api.groups[id] || [])]);
      api.saved = api.saved.filter(row => !removed.has(row.id));
      api.revision = String(BigInt(api.revision) + 1n);
      return { ok: true, data: { ok: true } };
    },
    deleteAllLogins: async () => {
      api.calls.push({ method: "all" });
      api.saved = [];
      return { ok: true, data: { ok: true } };
    },
    preview: id => ({
      login: { id, origin: origins[id] },
      related_logins: (api.groups[id] || []).map(related => ({ id: related, origin: origins[related] })),
      revision: api.revision,
    }),
  };
  globalThis.__browserLoginDeleteTest = api;
  return api;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function render() {
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host); mounted.push({ host, root });
  await act(async () => { root.render(React.createElement(CloudBrowserSettingsSection)); });
  return { host, root };
}
async function click(element) {
  assert.ok(Boolean(element), "expected button exists");
  await act(async () => { element.dispatchEvent(new window.MouseEvent("click", { bubbles: true })); });
}
const named = (host, text) => [...host.querySelectorAll("button")].find(button => button.textContent === text);
const targetButton = (host, id) => host.querySelector(`[aria-label="删除 ${origins[id]} 的登录"]`);
const dialog = host => host.querySelector("[data-cloud-browser-login-delete]");
const methods = (api, name) => api.calls.filter(call => call.method === name);
const rows = host => host.querySelectorAll("[data-cloud-browser-saved-login]").length;

afterEach(async () => {
  for (const { root, host } of mounted.splice(0)) { await act(async () => root.unmount()); host.remove(); }
  delete globalThis.__browserLoginDeleteTest;
});

test("shared-login confirmation names selected/related sites, offers three choices and cancels without deleting", async () => {
  const api = runtime();
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  const confirmation = dialog(host);
  assert.equal(confirmation?.getAttribute("role"), "dialog");
  assert.equal(Boolean(document.getElementById(confirmation.getAttribute("aria-labelledby"))), true);
  assert.equal(confirmation.querySelector("[data-cloud-browser-login-delete-target]").textContent, origins.accounts);
  assert.deepEqual([...confirmation.querySelectorAll("[data-cloud-browser-login-delete-related]")].map(row => row.textContent), [origins.mail]);
  assert.deepEqual([...confirmation.querySelectorAll("button")].map(button => button.textContent), ["仅删除此记录", "一起删除", "取消"]);
  assert.equal(confirmation.textContent.includes("不保证退出网站"), true);
  assert.equal(/Cookie|PSL|revision|token|9007199254740993/.test(confirmation.textContent), false);
  assert.equal(document.activeElement?.textContent, "取消");
  assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
  await click(named(confirmation, "取消"));
  assert.equal(Boolean(dialog(host)), false);
  assert.equal(rows(host), 3);
  assert.equal(document.activeElement?.getAttribute("aria-label"), `删除 ${origins.accounts} 的登录`);
});

test("record-only choice deletes the selected record and retains its related and unrelated saved sites", async () => {
  const api = runtime();
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  await click(named(dialog(host), "仅删除此记录"));
  assert.equal(methods(api, "single").length, 1);
  assert.equal(methods(api, "single")[0].id, "accounts");
  assert.equal(methods(api, "together").length, 0);
  assert.equal(rows(host), 2);
  assert.equal(Boolean(targetButton(host, "mail")), true);
  assert.equal(Boolean(targetButton(host, "isolated")), true);
});

test("together choice sends the exact large revision once and removes only the explicitly previewed group", async () => {
  const api = runtime();
  const pending = deferred();
  api.deleteRelatedLogins = (id, revision, signal) => { api.calls.push({ method: "together", id, revision, signal }); return pending.promise; };
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  const together = named(dialog(host), "一起删除");
  await act(async () => {
    together.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    together.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(methods(api, "together").length, 1);
  assert.equal(methods(api, "together")[0].revision, "9007199254740993");
  assert.equal(together.disabled, true);
  await act(async () => { pending.resolve({ ok: true, data: { ok: true } }); });
  assert.equal(rows(host), 1);
  assert.equal(Boolean(targetButton(host, "isolated")), true);
  assert.equal(methods(api, "single").length, 0);
});

test("a site with no related records preserves single deletion and duplicate initial clicks share the preview", async () => {
  const api = runtime();
  const pending = deferred();
  api.loginDeletePreview = (id, signal) => { api.calls.push({ method: "preview", id, signal }); return pending.promise; };
  const { host } = await render();
  const remove = targetButton(host, "isolated");
  await act(async () => {
    remove.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    remove.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(methods(api, "preview").length, 1);
  assert.equal(methods(api, "single").length, 0);
  await act(async () => { pending.resolve({ ok: true, data: api.preview("isolated") }); });
  assert.equal(methods(api, "single").length, 1);
  assert.equal(methods(api, "together").length, 0);
  assert.equal(rows(host), 2);
  assert.equal(Boolean(dialog(host)), false);
});

test("an unavailable preview never falls back to deletion and re-reading an empty group still requires a choice", async () => {
  const api = runtime();
  api.loginDeletePreview = async (id, signal) => { api.calls.push({ method: "preview", id, signal }); return { ok: false, status: 503, error: "cookie=never-render" }; };
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  assert.equal(dialog(host)?.getAttribute("data-cloud-browser-login-delete"), "failed");
  assert.equal(host.textContent.includes("never-render"), false);
  assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
  api.groups.accounts = [];
  api.loginDeletePreview = async (id, signal) => { api.calls.push({ method: "preview", id, signal }); return { ok: true, data: api.preview(id) }; };
  await click(named(dialog(host), "重新读取"));
  assert.equal(Boolean(named(dialog(host), "一起删除")), false);
  assert.equal(methods(api, "single").length, 0);
  await click(named(dialog(host), "仅删除此记录"));
  assert.equal(methods(api, "single").length, 1);
});

test("stale409 refreshes the preview, changes nothing and requires a fresh choice even when no related sites remain", async () => {
  const api = runtime();
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  api.revision = "9007199254740994";
  api.groups.accounts = [];
  await click(named(dialog(host), "一起删除"));
  assert.equal(methods(api, "together").length, 1);
  assert.equal(methods(api, "together")[0].revision, "9007199254740993");
  assert.equal(methods(api, "preview").length, 2);
  assert.equal(methods(api, "single").length, 0);
  assert.equal(rows(host), 3);
  assert.equal(dialog(host).textContent.includes("请重新选择"), true);
  assert.equal(Boolean(named(dialog(host), "一起删除")), false);
  await click(named(dialog(host), "仅删除此记录"));
  assert.equal(methods(api, "single").length, 1);
  assert.equal(rows(host), 2);
});

test("switching delete target aborts and ignores a late prior preview", async () => {
  const api = runtime();
  const old = deferred();
  api.loginDeletePreview = (id, signal) => {
    api.calls.push({ method: "preview", id, signal });
    return id === "accounts" ? old.promise : Promise.resolve({ ok: true, data: api.preview(id) });
  };
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  await click(targetButton(host, "mail"));
  assert.equal(methods(api, "preview")[0].signal.aborted, true);
  await act(async () => { old.resolve({ ok: true, data: { ...api.preview("accounts"), related_logins: [] } }); });
  assert.equal(dialog(host).querySelector("[data-cloud-browser-login-delete-target]").textContent, origins.mail);
  assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
});

test("unmount aborts a pending preview and its late no-related reply cannot delete anything", async () => {
  const api = runtime();
  const pending = deferred();
  api.loginDeletePreview = (id, signal) => { api.calls.push({ method: "preview", id, signal }); return pending.promise; };
  const { host, root } = await render();
  await click(targetButton(host, "isolated"));
  await act(async () => root.unmount()); mounted.pop(); host.remove();
  assert.equal(methods(api, "preview")[0].signal.aborted, true);
  await act(async () => { pending.resolve({ ok: true, data: api.preview("isolated") }); });
  assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
});

test("delete-all cancels a pending group preview and clears every saved record through the independent all endpoint", async () => {
  const api = runtime();
  const pending = deferred();
  api.loginDeletePreview = (id, signal) => { api.calls.push({ method: "preview", id, signal }); return pending.promise; };
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  await click(named(host, "删除全部登录"));
  assert.equal(methods(api, "preview")[0].signal.aborted, true);
  await click(named(host, "确认删除全部"));
  await act(async () => { pending.resolve({ ok: true, data: api.preview("accounts") }); });
  assert.equal(methods(api, "all").length, 1);
  assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
  assert.equal(rows(host), 0);
});

test("foreign preview targets or origins cannot become an actionable confirmation", async () => {
  for (const foreign of [
    { id: "not-accounts", origin: origins.accounts },
    { id: "accounts", origin: "https://foreign.example" },
  ]) {
    const api = runtime();
    api.loginDeletePreview = async () => ({ ok: true, data: { ...api.preview("accounts"), login: foreign } });
    const { host } = await render();
    await click(targetButton(host, "accounts"));
    assert.equal(dialog(host)?.getAttribute("data-cloud-browser-login-delete"), "failed");
    assert.equal(Boolean(named(dialog(host), "仅删除此记录")), false);
    assert.equal(Boolean(named(dialog(host), "一起删除")), false);
    assert.equal(host.textContent.includes("https://foreign.example"), false);
    assert.equal(methods(api, "single").length + methods(api, "together").length, 0);
    const previous = mounted.pop(); await act(async () => previous.root.unmount()); previous.host.remove();
  }
});

test("an ambiguous delete error removes the old choice and never retries destruction automatically", async () => {
  const api = runtime();
  api.deleteRelatedLogins = async (id, revision, signal) => {
    api.calls.push({ method: "together", id, revision, signal });
    return { ok: false, status: 503, error: "private-action-detail" };
  };
  const { host } = await render();
  await click(targetButton(host, "accounts"));
  await click(named(dialog(host), "一起删除"));
  assert.equal(methods(api, "together").length, 1);
  assert.equal(dialog(host)?.getAttribute("data-cloud-browser-login-delete"), "failed");
  assert.equal(Boolean(named(dialog(host), "一起删除")), false);
  assert.equal(host.textContent.includes("private-action-detail"), false);
  assert.equal(rows(host), 3);
});
