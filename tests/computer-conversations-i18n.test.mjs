// 电脑对话（Device 菜单下钻、原生对话流、命令行 / 终端、分范围设置、任务页对话错误）的译文覆盖判据。
//
// `tt()` 未命中会原样回退成中文，所以中文站永远看不出缺口；这条测试替英文等 16 个语种把关：
//   1. 下列文件里每一条 `tt("中文")` / `tt(\`中文\`)` 字面量，在每个语种的运行时词典（load.ts）
//      和总表（index.ts）里都有译文，译文不是中文原文，插值占位符一个不丢；
//   2. 非宿主文件里不经 `tt("…")` 直接写、而是先存成中文常量再 `tt(x)` 的文案同样有译文；
//   3. computer-task-workspace-copy.ts 里每一条源文案都还有人用（W2/W3 那批死 key 不许回来）。

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";
import { COMPUTER_TASK_WORKSPACE_SOURCE } from "../src/i18n/ui/messages/computer-task-workspace-copy.ts";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const TRANSLATED = LOCALES.filter((locale) => locale !== "zh");
const HAN = /[一-鿿]/;
/** 这两个语种的正字法本来就用汉字（日文「保存」「停止」与中文同形是对的）。 */
const HAN_SCRIPT = new Set(["zh-TW", "ja"]);

/** 只扫 tt 字面量的宿主文件（其中还有大量非界面中文，如提示词、日志）。 */
const HOST_FILES = ["src/shell/AgentChat.tsx", "src/shell/AgentTranscriptBubble.tsx"];
/** 每一条中文字面量都要有译文的文件 / 目录。 */
const STRICT_ENTRIES = [
  "src/shell/native-thread",
  "src/shell/cloud-computer/native-surface",
  "src/shell/cloud-computer/ConversationBar.tsx",
  "src/shell/cloud-computer/ComputerDock.tsx",
  "src/shell/cloud-computer/computer-task-import.tsx",
  "src/shell/cloud-computer/terminal-card/AppearancePanel.tsx",
  "src/shell/cloud-computer/terminal-card/CliSettingsPanel.tsx",
  "src/shell/cloud-computer/terminal-card/panel-skin.ts",
  "src/shell/LeoComposer.tsx",
  "src/lib/computer-task-api.ts",
];
/** 只在门户首页（/root/projects/oceanleo/app/_components/home-content.tsx）用到的 key。 */
const PORTAL_ONLY = new Set(["发给电脑上的程序时，请进入对话后再添加附件。"]);

function walk(target) {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target).flatMap((name) => walk(path.join(target, name)));
}

function filesOf(entries) {
  return entries
    .flatMap((entry) => walk(path.join(ROOT, entry)))
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => path.relative(ROOT, file));
}

function collect(files, { everyLiteral }) {
  const keys = new Map();
  const add = (text, file) => {
    if (!HAN.test(text)) return;
    if (!keys.has(text)) keys.set(text, new Set());
    keys.get(text).add(file);
  };
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(path.join(ROOT, file), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node) => {
      const literal = ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
      if (everyLiteral && literal) add(node.text, file);
      if (
        !everyLiteral &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "tt" &&
        node.arguments[0] &&
        (ts.isStringLiteral(node.arguments[0]) ||
          ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
      ) {
        add(node.arguments[0].text, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return keys;
}

const STRICT_FILES = filesOf(STRICT_ENTRIES);
const TT_KEYS = collect([...HOST_FILES, ...STRICT_FILES], { everyLiteral: false });
const LITERAL_KEYS = collect(STRICT_FILES, { everyLiteral: true });

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

async function problems(keys) {
  const runtime = Object.fromEntries(
    await Promise.all(TRANSLATED.map(async (locale) => [locale, await loadUiMessages(locale)])),
  );
  const found = [];
  for (const [key, files] of keys) {
    for (const locale of TRANSLATED) {
      for (const [where, dictionary] of [
        ["load.ts", runtime[locale]],
        ["index.ts", UI_MESSAGES[locale]],
      ]) {
        const value = dictionary[key];
        const at = `${locale}/${where}: ${key} (${[...files].join(", ")})`;
        if (!value) found.push(`缺译文 ${at}`);
        else if (!HAN_SCRIPT.has(locale) && HAN.test(value)) found.push(`译文里还有中文 ${at} → ${value}`);
        else if (placeholders(value).join() !== placeholders(key).join())
          found.push(`占位符不一致 ${at} → ${value}`);
      }
    }
  }
  return found;
}

test("电脑对话相关文件里的 tt() 字面量在 16 个语种里都有译文", async () => {
  assert.ok(TT_KEYS.size > 150, `取样疑似失效：只找到 ${TT_KEYS.size} 条 tt() 字面量`);
  assert.deepEqual(await problems(TT_KEYS), []);
});

test("Device 菜单 / 原生对话 / 终端文件里先存成常量再 tt(x) 的中文同样有译文", async () => {
  assert.ok(LITERAL_KEYS.size > TT_KEYS.size / 2, `取样疑似失效：只找到 ${LITERAL_KEYS.size} 条中文字面量`);
  assert.deepEqual(await problems(LITERAL_KEYS), []);
});

test("英文站上的 Device 菜单与原生对话没有内部用语", () => {
  const en = UI_MESSAGES.en;
  for (const key of Object.values(COMPUTER_TASK_WORKSPACE_SOURCE)) {
    assert.doesNotMatch(en[key], /\bACP\b|\bCLI\b|graphical|independent session|\bConversation sync/i, key);
  }
});

test("computer-task-workspace-copy 里没有已经没人用的 key", () => {
  const sources = walk(path.join(ROOT, "src"))
    .filter((file) => /\.tsx?$/.test(file) && !file.includes(`${path.sep}i18n${path.sep}ui${path.sep}messages${path.sep}`))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
  const unused = Object.values(COMPUTER_TASK_WORKSPACE_SOURCE).filter(
    (key) =>
      !PORTAL_ONLY.has(key) &&
      !sources.includes(`"${key}"`) &&
      !sources.includes(`'${key}'`) &&
      !sources.includes(`\`${key}\``),
  );
  assert.deepEqual(unused, [], "这些 key 已经不在 src 里了，从 copy 文件里删掉");
});
