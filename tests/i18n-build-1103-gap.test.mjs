import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { BUILD_1103_GAP_MESSAGES as GAP } from "../src/i18n/ui/messages/build-1103-gap-copy.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Acceptance snapshot from W6-I18NOLD; do not mask gaps by extending its baseline.
const REQUESTED_KEYS = [
  "4 小时",
  "Agent 每次控制都要同意",
  "仅你的账号可以开启；到时间会自动关闭，也可以在这台电脑的托盘中停止。",
  "允许 Agent 控制此设备",
  "允许云端助手使用这台电脑",
  "允许操作屏幕（查看、点击、输入）",
  "允许时长",
  "关闭后，Agent 申请仍会显示，但不会自动获得远程控制。",
  "开启后，Agent 每次申请都会在这台电脑上等待确认。",
  "自己的账号访问这台设备会直接连接。远程访问和云端助手的权限在这里设置。",
  "访问与控制",
  "关闭搜索",
  "没有匹配的任务。",
  "协作连接已断开，正在重试",
  "所有素材",
  "在 Library 中查看",
  "共 {total} 条",
  "无数据",
  "看板数据暂不可用。",
  "让 agent 配置此看板",
  "该看板尚未接线。",
  "取消点选",
  "引用插入失败，引用已保留，请重试插入。",
  "截图失败，可继续发送位置引用。",
  "无法打开此网站的 agent 对话，请重试。",
  "正在打开 agent 对话并等待输入框…",
  "添加截图",
  "点击预览位置，将坐标和截图引用放入对话输入框。",
  "点选元素",
  "等待 agent 对话输入框超时，引用已保留，请重试插入。",
  "请使用当前标签页截图，以便坐标对应预览。",
  "跨域预览仅记录点击坐标，不读取页面 DOM。",
  "重试插入",
  "任务已创建",
  "启动",
  "唤醒",
  "打开 agent 任务",
  "暂无日志",
  "暂无看板",
  "查看运行日志",
  "电脑",
  "看板",
  "网站预览",
  "让 agent 修复",
  "让 agent 写入运行说明",
  "请写入 .oceanleo/run.json 运行说明。",
  "请求失败，请重试。",
  "路径须以 / 开头，且只能在当前网站内跳转。",
  "运行日志",
  "返回预览",
  "重启",
  "预览地址尚不可用。",
  "预览路径",
  "SQL 控制台",
  "主域名",
  "仓库",
  "以下读数来自网站项目 API；没有返回的计量保持不可用。",
  "分析状态",
  "发布到 .ws.oceanleo.app",
  "域名",
  "域名已添加",
  "存储文件列表",
  "存储桶",
  "存储用量",
  "已创建回滚部署",
  "已创建恢复提交 {commit}",
  "已提交发布",
  "当前提交",
  "恢复为新提交",
  "恢复网站版本 {commit}",
  "成本记录",
  "成本记录暂不可用。",
  "技术栈",
  "未定价",
  "未绑定",
  "正在读取网站数据…",
  "此存储桶还没有文件。",
  "此网站还没有成本记录。",
  "环境",
  "环境变量引用",
  "用量与成本",
  "网站工作台",
  "访问量",
  "运行 SQL",
  "例如：一个展示作品集和联系方式的简洁网站",
  "创建网站",
  "描述你想做的网站",
  "新建网站"
];

const SOURCE_PATHS = [
  "pages/devices/DeviceSettingsDialog.tsx",
  "shell/HistoryMasterDetail.tsx",
  "shell/collab/CollabPresenceBar.tsx",
  "shell/material-library-toolbar.tsx",
  "shell/task-attachment-library-link.tsx",
  "shell/website-platform/WebsitePanelView.tsx",
  "shell/website-platform/WebsitePreviewPicker.tsx",
  "shell/website-platform/WebsitePreviewWorkbench.tsx",
  "shell/website-platform/WebsiteWorkbenchPanels.tsx",
  "shell/website-platform/create-website-entry.tsx",
];
const sorted = (keys) => [...keys].sort();
const placeholders = (text) => sorted([...text.matchAll(/\{\w+\}/g)].map((match) => match[0]));
const dictionaries = Object.fromEntries(LOCALES.map((locale) => [locale,
  Object.fromEntries(REQUESTED_KEYS.map((key) => [key, GAP[locale][key] ?? UI_MESSAGES[locale][key]])),
]));
const merged = (locale) => dictionaries[locale];

test("all 88 requested gaps still correspond to actual source copy", () => {
  assert.equal(new Set(REQUESTED_KEYS).size, 88);
  const literals = new Set();
  for (const relative of SOURCE_PATHS) {
    const source = readFileSync(new URL(`../src/${relative}`, import.meta.url), "utf8");
    const ast = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) literals.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.deepEqual(REQUESTED_KEYS.filter((key) => !literals.has(key)), []);
});

test("all 17 locales cover the exact requested set without replacing base entries", async () => {
  assert.deepEqual(sorted(Object.keys(GAP)), sorted(LOCALES));
  for (const locale of LOCALES) {
    const base = (await import(`../src/i18n/ui/messages/${locale}.ts`)).default;
    const expected = REQUESTED_KEYS.filter((key) => !base[key]);
    assert.deepEqual(sorted(Object.keys(GAP[locale])), sorted(expected), locale);
    for (const key of REQUESTED_KEYS) {
      const value = merged(locale)[key];
      assert.ok(value?.trim(), `${locale}:${key}`);
      assert.deepEqual(placeholders(value), placeholders(key), `${locale}:${key}`);
      if (locale === "zh") assert.equal(value, key);
      if (Object.hasOwn(GAP[locale], key) && UI_MESSAGES[locale][key] !== undefined) {
        assert.equal(GAP[locale][key], UI_MESSAGES[locale][key], `${locale}: conflicting existing translation: ${key}`);
      }
    }
  }
});

test("non-Chinese locales use real localized copy and preserve product and protocol words", () => {
  const sharedTechnicalWords = new Set(["Computer", "Dashboard", "Repository", "Domain"]);
  const scripts = {
    ar: /\p{Script=Arabic}/u, th: /\p{Script=Thai}/u,
    hi: /\p{Script=Devanagari}/u, ja: /[\p{Script=Hiragana}\p{Script=Katakana}]/u,
    ko: /\p{Script=Hangul}/u,
  };
  for (const locale of LOCALES) {
    const dict = merged(locale);
    for (const key of REQUESTED_KEYS) {
      const value = dict[key];
      if (!["zh", "zh-TW", "ja", "ko"].includes(locale)) {
        assert.doesNotMatch(value, /\p{Script=Han}/u, `${locale}:${key}`);
      }
      if (!["zh", "zh-TW", "en"].includes(locale)) {
        const english = merged("en")[key];
        assert.ok(value !== english || sharedTechnicalWords.has(value), `${locale} copied English: ${key}`);
      }
      for (const token of ["Agent", "Library", "LeoBay", "SQL", "DOM", ".oceanleo/run.json", ".ws.oceanleo.app"]) {
        const sourceToken = token === "Agent" ? /\bagent\b/i.test(key) : key.includes(token);
        if (sourceToken && !(token === "Agent" && locale === "zh")) assert.ok(value.includes(token), `${locale}:${key} lost ${token}`);
      }
    }
    if (scripts[locale]) {
      assert.match(dict["仅你的账号可以开启；到时间会自动关闭，也可以在这台电脑的托盘中停止。"], scripts[locale], locale);
    }
  }
  assert.equal(merged("en")["看板"], "Dashboard");
  assert.equal(merged("es")["电脑"], "Ordenador");
  assert.equal(merged("es-419")["电脑"], "Computadora");
  assert.match(merged("es-419")["允许云端助手使用这台电脑"], /esta computadora$/);
  assert.doesNotMatch(Object.values(merged("es-419")).join("\n"), /este computadora/);
  assert.equal(merged("pt-BR")["允许操作屏幕（查看、点击、输入）"], "Permitir controle da tela (visualizar, clicar, digitar)");
  assert.equal(merged("pt-PT")["允许操作屏幕（查看、点击、输入）"], "Permitir o controlo do ecrã (ver, clicar, escrever)");
});

test("real translation hook renders localized permission copy and interpolated records/commits in every locale", async () => {
  let activeLocale = "en";
  let activeDictionary = {};
  // Only context inputs are supplied; React, interpolation and lookup use real code.
  globalThis.__W6_GAP_CONTEXT = { locale: () => activeLocale, dictionary: () => activeDictionary };
  try {
    const { useUI } = await import(await compileModule("src/i18n/ui/useUI.ts", {
      "next-intl": dataModule("export function useLocale() { return globalThis.__W6_GAP_CONTEXT.locale(); }"),
      "./messages/context": dataModule("export function useUiMessages() { return globalThis.__W6_GAP_CONTEXT.dictionary(); }"),
    }));
    function Probe() {
      const tt = useUI();
      return React.createElement("section", null,
        React.createElement("p", null, tt("允许 Agent 控制此设备")),
        React.createElement("p", null, tt("共 {total} 条", { total: 27 })),
        React.createElement("p", null, tt("已创建恢复提交 {commit}", { commit: "a1b2c3" })),
        React.createElement("button", null, tt("在 Library 中查看")),
      );
    }
    for (const locale of LOCALES) {
      activeLocale = locale;
      activeDictionary = merged(locale);
      const actual = renderToStaticMarkup(React.createElement(Probe));
      const dict = activeDictionary;
      const expected = renderToStaticMarkup(React.createElement("section", null,
        React.createElement("p", null, dict["允许 Agent 控制此设备"]),
        React.createElement("p", null, dict["共 {total} 条"].replace("{total}", "27")),
        React.createElement("p", null, dict["已创建恢复提交 {commit}"].replace("{commit}", "a1b2c3")),
        React.createElement("button", null, dict["在 Library 中查看"]),
      ));
      assert.equal(actual, expected, locale);
      assert.doesNotMatch(actual, /\{(?:total|commit)\}/);
    }
  } finally {
    delete globalThis.__W6_GAP_CONTEXT;
  }
});
