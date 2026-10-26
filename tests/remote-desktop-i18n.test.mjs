import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";
window.scrollTo = () => {};

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";

import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const HAN = /[一-鿿]/;

/** 取源码里所有含汉字的字符串字面量 / JSX 文本（即所有会进 tt 的中文原文）。 */
async function cjkLiterals(file) {
  const text = await readFile(resolve(file), "utf8");
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const out = new Set();
  (function walk(node) {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HAN.test(node.text)) {
      out.add(node.text);
    }
    if (ts.isJsxText(node) && HAN.test(node.text)) out.add(node.text.trim());
    ts.forEachChild(node, walk);
  })(sf);
  return [...out];
}

const NEW_FILES = ["src/pages/RemoteDesktopPanel.tsx", "src/pages/remote-desktop-input.ts"];
const ENTRY_KEYS = ["进入桌面", "远程桌面", "查看这台电脑的屏幕，并用鼠标键盘操控。"];

test("新增文案的每一条中文原文在运行时英文词典里都有英文译文（没有汉字）", async () => {
  const keys = [...new Set([...(await Promise.all(NEW_FILES.map(cjkLiterals))).flat(), ...ENTRY_KEYS])];
  assert.ok(keys.length > 40, `应收集到全部新文案，实际 ${keys.length}`);
  const en = await loadUiMessages("en");
  const missing = keys.filter((key) => !(key in en));
  assert.deepEqual(missing, [], "英文页会漏出中文的词条");
  for (const key of keys) assert.doesNotMatch(en[key], HAN, `${key} → ${en[key]}`);
});

test("useUI 的真实加载链（request.ts → loadUiMessages）加载这份分表，旧的静态汇总也含它", async () => {
  const request = await readFile(resolve("src/i18n/request.ts"), "utf8");
  assert.match(request, /loadUiMessages\(locale\)/);
  const aggregator = await readFile(resolve("src/i18n/ui/messages/shell-overhaul-copy.ts"), "utf8");
  assert.match(aggregator, /REMOTE_DESKTOP_MESSAGES/);
  assert.match(aggregator, /from "\.\/remote-desktop-copy"/);
  const probe = "进入桌面";
  assert.equal((await loadUiMessages("en"))[probe], "Enter desktop");
  assert.equal(UI_MESSAGES.en[probe], "Enter desktop");
  assert.equal(UI_MESSAGES["zh-TW"][probe], "進入桌面");
});

test("17 个语种都有这批词条；拉丁文字语种与英文里都没有汉字，zh-TW 是繁体", async () => {
  const keys = [...new Set([...(await Promise.all(NEW_FILES.map(cjkLiterals))).flat(), ...ENTRY_KEYS])];
  const NO_HAN = new Set(["en", "de", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi", "tr"]);
  for (const locale of LOCALES) {
    const dict = await loadUiMessages(locale);
    for (const key of keys) {
      assert.ok(key in dict || locale === "zh", `${locale} 缺 ${key}`);
      if (NO_HAN.has(locale)) assert.doesNotMatch(dict[key], HAN, `${locale}: ${key}`);
    }
  }
  const tw = await loadUiMessages("zh-TW");
  assert.equal(tw["进入桌面"], "進入桌面");
  assert.equal(tw["粘贴文字"], "貼上文字");
});

test("占位符在译文里原样保留", async () => {
  for (const locale of ["en", "zh-TW"]) {
    const dict = await loadUiMessages(locale);
    assert.match(dict["「{name}」的桌面"], /\{name\}/);
    assert.match(dict["{name}的桌面"], /\{name\}/);
  }
});

test("英文页面：设备卡入口与查看面板渲染出来的是英文，没有一个汉字", async () => {
  const dict = await loadUiMessages("en");
  globalThis.__rdEnDict = dict;
  const stubs = {
    "../facades/devices": dataModule(`export const devicesFacade = null;`),
    "../api/remote-desktop": dataModule(`export const remoteDesktopClient = null;`),
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        const dict = globalThis.__rdEnDict;
        return (value, vars) => (dict[value] ?? value).replace(/\\{(\\w+)\\}/g, (_, k) => String(vars?.[k] ?? "{" + k + "}"));
      }
    `),
    "../ui": dataModule(`export function ConfirmDialog() { return null; }`),
    "./PageHeader": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function PageHeader({ title }) { return React.createElement("h1", null, title); }
    `),
    "./CloudComputersPage": dataModule(`
      export function CloudComputersSection() { return null; }
      export function CloudComputersPage() { return null; }
    `),
    "../shell/cloud-computer/CreateComputerDialog": dataModule(`export function CreateComputerDialog() { return null; }`),
    "../shell/cloud-computer/ConnectServerDialog": dataModule(`export function ConnectServerDialog() { return null; }`),
  };
  const { DevicesPage } = await import(await compileModule("src/pages/DevicesPage.tsx", stubs));

  const dev = (id, name, platform = "windows") => ({
    device_id: id,
    platform,
    device_name: name,
    online: true,
    local_exec_enabled: true,
    granted_kinds: ["read"],
    last_seen_at: "",
  });
  const statuses = {
    a: { supported: true, enabled: true, online: true, availability: "online", session_id: null },
    b: { supported: false, enabled: false, online: true, availability: "online", session_id: null },
    c: { supported: true, enabled: false, online: true, availability: "signed_out", session_id: null },
    d: { supported: true, enabled: true, online: false, availability: "offline", session_id: null },
  };
  const frames = [];
  const remote = {
    async getStatus(id) {
      return { ok: true, data: statuses[id] };
    },
    async createSession() {
      return { ok: true, data: { session_id: "s", state: "connecting", expires_at: "" } };
    },
    async getFrame() {
      frames.push(1);
      return { ok: true, data: { state: "active", frame: { image: "data:image/jpeg;base64,AAAA", width: 16, height: 9, sequence: frames.length } } };
    },
    async sendInput(d, s, seq) {
      return { ok: true, data: { accepted: true, seq } };
    },
    async closeSession() {
      return { ok: true, data: { closed: true } };
    },
  };
  const list = [dev("a", "Studio PC"), dev("b", "Old PC", "macos"), dev("c", "Lab PC", "linux"), dev("d", "Away PC")];
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
  await act(async () => {
    root.render(
      React.createElement(DevicesPage, {
        client: {
          async listDevices() {
            return { ok: true, data: list };
          },
        },
        remoteDesktopClient: remote,
        remoteStatusIntervalMs: 60_000,
      }),
    );
  });
  for (let i = 0; i < 6; i += 1) await act(async () => {});

  const entries = [...host.querySelectorAll("[data-device-card]")];
  assert.equal(entries.length, 4);
  const entryText = entries.map((node) => node.textContent || "").join("\n");
  assert.doesNotMatch(entryText, HAN, `入口里漏出中文：${entryText}`);
  assert.match(entryText, /Enter desktop/);
  assert.doesNotMatch(entryText, /That switch can only be turned on|hasn't allowed remote desktop/);
  assert.match(entryText, /Settings/);
  assert.match(entryText, /Tasks/);
  assert.match(entryText, /offline/i);

  const enter = [...host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "Enter desktop" && !b.disabled);
  await act(async () => {
    enter.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  const panel = document.querySelector("[data-oceanleo-remote-desktop]");
  assert.ok(panel, "面板打开");
  const panelText = [panel.textContent, panel.querySelector("img")?.getAttribute("alt"), panel.querySelector("[data-remote-stage]")?.getAttribute("aria-label"), panel.querySelector("[data-remote-input]")?.getAttribute("aria-label")].join("\n");
  assert.doesNotMatch(panelText, HAN, `面板里漏出中文：${panelText}`);
  assert.match(panelText, /Studio PC/);
  assert.match(panelText, /Connected/);
  for (const label of ["Fullscreen", "Leave desktop"]) {
    assert.match(panelText + [...panel.querySelectorAll("button")].map((b) => b.textContent).join("|"), new RegExp(label.replace("Fullscreen", "(Fullscreen|Full screen)")), label);
  }
  } finally {
  await act(async () => root.unmount());
  host.remove();
  delete globalThis.__rdEnDict;
  }
});
