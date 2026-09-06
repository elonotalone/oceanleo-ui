// 选段分享 / 长图 / 文档 / 回放页的**译文覆盖**判据。
//
// 为什么要有这条测试：这批文案有一部分印在用户对外分享物上（长图页眉、页脚标语、
// 「完整表格见原对话」、回放页标题）。少一条译文，英文用户分享出去的那张图上就印着中文，
// 而 `useUI()` 的回退规则（未命中 → 原样返回中文）让这种缺口在中文站完全看不出来。
//
// 判的三件事：
//   1. 四个目录里每一条 `tt("中文")` 都在 16 个非中文词典里有键（历史缺口白名单只能变短）；
//   2. 不写在调用处、而是先当中文常量存下来再过 `tt()` 的那批（HTTP 失败文案、throw、
//      回放工具名）同样有译文；
//   3. 印在长图上的页眉与标语，过一遍真排版引擎后**不被截掉**（tagline 只给两行）。

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { LOCALES } from "../src/i18n/config.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { SHARE_COPY_SOURCE } from "../src/i18n/ui/messages/share-copy-base.ts";
import { markdownToShareBlocks } from "../src/shell/share/share-blocks.ts";
import { shareFailureMessage } from "../src/shell/share/share-client.ts";
import {
  SHARE_CARD_WIDTH,
  layoutShareCard,
} from "../src/shell/share/share-layout.ts";

const TRANSLATED_LOCALES = LOCALES.filter((locale) => locale !== "zh");
const SHELL = fileURLToPath(new URL("../src/shell/", import.meta.url));
const SCANNED = ["share", "replay", "AgentChat.tsx", "AgentTranscriptBubble.tsx"];

/**
 * 开波之前就缺译文的 key（`AgentChat` / `AgentTranscriptBubble` 的成员、分支、确认那几套）。
 * 这一波只补自己新加的文案，不顺手翻历史缺口——但历史缺口也不许再长：
 * 这张表只能变短，新加的中文一律要有译文。
 */
const PRE_EXISTING_GAPS = new Set([
  "@ 某个成员：只让 TA 处理",
  "@ 谁（可多选）",
  "云端浏览器",
  "从这里重新开始",
  "分支已创建，但工作会话暂未同步；本次任务仍会继续运行。",
  "创建分支失败",
  "到此停止",
  "在右侧打开",
  "如需调整，可在确认前补充说明",
  "实时预览已就绪",
  "将从所选消息之前创建新分支；原对话保持不变。",
  "已处理的确认",
  "当前会话为只读状态。",
  "成员",
  "暂无成员",
  "组织",
  "请确认后继续。",
  "需要你确认",
]);

function sourceFiles() {
  const walk = (target) => {
    if (statSync(target).isFile()) return [target];
    return readdirSync(target).flatMap((name) => walk(path.join(target, name)));
  };
  return SCANNED.flatMap((entry) => walk(path.join(SHELL, entry))).filter((file) =>
    /\.tsx?$/.test(file),
  );
}

const SOURCES = new Map(
  sourceFiles().map((file) => [path.relative(SHELL, file), readFileSync(file, "utf8")]),
);

function sourceOf(relativePath) {
  const found = SOURCES.get(relativePath);
  assert.ok(found, `扫描面里没有 ${relativePath}，判据的取样范围漂了`);
  return found;
}

/** 需要译文的 key：含汉字的才算（`tt("…")` 那种纯标点不需要翻译）。 */
function needsTranslation(key) {
  return /[\u4e00-\u9fff]/.test(key);
}

function ttLiterals() {
  const keys = new Map();
  for (const [file, source] of SOURCES) {
    for (const match of source.matchAll(/\btt\(\s*"((?:[^"\\]|\\.)*)"/g)) {
      const key = JSON.parse(`"${match[1]}"`);
      if (!needsTranslation(key)) continue;
      if (!keys.has(key)) keys.set(key, new Set());
      keys.get(key).add(file);
    }
  }
  return keys;
}

function missingLocales(key) {
  return TRANSLATED_LOCALES.filter((locale) => !UI_MESSAGES[locale][key]);
}

function reportMissing(keys) {
  return keys
    .map((key) => `${key} → 缺 ${missingLocales(key).join(",")}`)
    .sort();
}

// ---------------------------------------------------------------------------
// 1 调用处写死的 tt("中文")
// ---------------------------------------------------------------------------

test("四个目录里的 tt() 字面量在每个语种词典里都有键", () => {
  const keys = [...ttLiterals().keys()];
  assert.ok(keys.length > 80, `取样疑似失效：只找到 ${keys.length} 条 tt() 字面量`);

  const uncovered = keys.filter(
    (key) => missingLocales(key).length > 0 && !PRE_EXISTING_GAPS.has(key),
  );
  assert.deepEqual(
    reportMissing(uncovered),
    [],
    "有新文案没补译文（英文站会原样露出中文）",
  );
});

test("历史缺口白名单只能变短，不许攒垃圾", () => {
  const referenced = new Set(ttLiterals().keys());
  const stale = [...PRE_EXISTING_GAPS].filter((key) => !referenced.has(key));
  assert.deepEqual(stale, [], "白名单里的 key 已经不在源码里了，请删掉这几行");

  const alreadyTranslated = [...PRE_EXISTING_GAPS].filter(
    (key) => missingLocales(key).length === 0,
  );
  assert.deepEqual(
    alreadyTranslated,
    [],
    "这些 key 已经补齐译文了，请从白名单里删掉，别再给下一次留豁免",
  );
});

test("本波新增的每一条文案 17 语种齐全，且插值占位符不丢", () => {
  for (const key of Object.values(SHARE_COPY_SOURCE)) {
    assert.equal(
      UI_MESSAGES.zh[key],
      key,
      `中文站 key 必须等于值（中文原文即 key）：${key}`,
    );
    const placeholders = [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const locale of TRANSLATED_LOCALES) {
      const value = UI_MESSAGES[locale][key];
      assert.ok(value, `${locale} 缺译文：${key}`);
      // 繁体与日文不查这条：「共 {n} 步」简繁同形、「回答」中日同形，一样才是对的。
      if (locale !== "zh-TW" && locale !== "ja") {
        assert.notEqual(
          value,
          key,
          `${locale} 的「译文」和中文原文一样，等于没译：${key}`,
        );
      }
      assert.deepEqual(
        [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        placeholders,
        `${locale} 的译文丢了插值占位符：${key}`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2 不写在调用处、经 tt() 间接翻译的中文常量
// ---------------------------------------------------------------------------

test("分享链接的 HTTP 失败文案每一条都有译文", () => {
  // useShareMode 的 catch 是 tt(error.message)，所以这些返回值就是词典 key。
  const messages = [0, 401, 403, 404, 405, 429, 500, 503]
    .map((status) => shareFailureMessage(status, ""))
    // HTTP 号码兜底那条把状态码拼进了句子，做不成词典 key；它只在未知状态时出现。
    .filter((message) => !/HTTP/.test(message));
  assert.ok(messages.length >= 7, "取样失效：拿不到 HTTP 失败文案");
  assert.deepEqual(reportMissing(messages.filter((m) => missingLocales(m).length)), []);
});

test("share/** 抛出的中文错误每一条都有译文", () => {
  const thrown = [];
  for (const [file, source] of SOURCES) {
    if (!file.startsWith("share/")) continue;
    for (const match of source.matchAll(
      /throw new (?:Error|ShareLinkError)\(\s*"((?:[^"\\]|\\.)*)"/g,
    )) {
      const message = JSON.parse(`"${match[1]}"`);
      if (needsTranslation(message)) thrown.push(message);
    }
  }
  assert.ok(thrown.length >= 5, `取样失效：只找到 ${thrown.length} 条 throw 文案`);
  assert.deepEqual(reportMissing(thrown.filter((m) => missingLocales(m).length)), []);
});

test("回放页的工具名每一条都有译文", () => {
  const source = sourceOf(path.join("replay", "replay-model.ts"));
  const table = source.match(
    /const REPLAY_TOOL_LABELS: Record<string, string> = \{([\s\S]*?)\n\};/,
  );
  assert.ok(table, "REPLAY_TOOL_LABELS 的形状变了，判据取样失效");
  const labels = [...table[1].matchAll(/:\s*"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => JSON.parse(`"${match[1]}"`))
    .filter(needsTranslation);
  assert.ok(labels.length >= 20, `取样失效：只找到 ${labels.length} 个工具名`);
  assert.deepEqual(reportMissing(labels.filter((m) => missingLocales(m).length)), []);
});

// ---------------------------------------------------------------------------
// 3 印在长图上的字：过真排版引擎，确认没被截掉
// ---------------------------------------------------------------------------

/** 宽度模型：汉字/假名/韩文按 1 em，其余按 0.58 em（比真实拉丁字面宽，偏保守）。 */
const WIDE_CHAR =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/;

const measure = {
  measureText: (text, font) =>
    [...String(text)].reduce(
      (width, char) => width + font.size * (WIDE_CHAR.test(char) ? 1 : 0.58),
      0,
    ),
  measureMath: (tex, display) => ({
    width: Math.min(600, tex.length * 9),
    height: display ? 46 : 20,
  }),
  imageSize: () => ({ width: 1200, height: 800 }),
};

function translatorFor(locale) {
  const dictionary = UI_MESSAGES[locale];
  return (zh, vars) => {
    const hit = dictionary[zh];
    const text = hit != null && hit !== "" ? hit : zh;
    return vars
      ? text.replace(/\{(\w+)\}/g, (whole, name) =>
          name in vars ? String(vars[name]) : whole,
        )
      : text;
  };
}

function squeeze(text) {
  return text.replace(/\s+/g, "");
}

function drawnText(page, fontSize) {
  return page.items
    .filter((item) => item.kind === "text" && item.font.size === fontSize)
    .map((item) => item.text)
    .join("");
}

test("长图卡片上的页眉与标语在每个语种都完整画出，没被版式截掉", () => {
  // shareCardLabels()（ShareCard.tsx）就是用这三条 key 组页眉/页脚，先钉住这个对应关系，
  // 免得组件换了 key 而这条判据还在测老的。
  const cardSource = sourceOf("share/ShareCard.tsx");
  for (const key of [
    SHARE_COPY_SOURCE.cardTitle,
    SHARE_COPY_SOURCE.cardTagline,
    SHARE_COPY_SOURCE.tableTruncated,
  ]) {
    assert.ok(
      cardSource.includes(`tt("${key}")`),
      `ShareCard 不再用 tt("${key}") 组卡片文案，判据取样失效`,
    );
  }

  const conversation = (tt) => [
    {
      role: "user",
      speaker: tt("我"),
      blocks: markdownToShareBlocks("帮我算个同比"),
    },
    {
      role: "assistant",
      speaker: "OceanLeo",
      blocks: markdownToShareBlocks("同比增长 12%。"),
    },
  ];

  for (const locale of LOCALES) {
    const tt = translatorFor(locale);
    const labels = {
      title: tt(SHARE_COPY_SOURCE.cardTitle),
      subtitle: "2026-08-20",
      brand: "Generated by OceanLeo",
      tagline: tt(SHARE_COPY_SOURCE.cardTagline),
      linkText: "https://oceanleo.com/share/abc123",
      tableTruncated: tt(SHARE_COPY_SOURCE.tableTruncated),
      pageIndicator: "{index}/{total}",
    };
    const result = layoutShareCard(conversation(tt), labels, measure);
    assert.equal(result.width, SHARE_CARD_WIDTH, `${locale}: 卡片宽度被撑变了`);
    assert.equal(result.pages.length, 1, `${locale}: 这么短的对话不该分片`);

    const page = result.pages[0];
    assert.equal(
      squeeze(drawnText(page, 24)),
      squeeze(labels.title),
      `${locale}: 页眉标题被截掉了（标题最多三行）`,
    );
    assert.equal(
      squeeze(drawnText(page, 12.5)),
      squeeze(labels.tagline),
      `${locale}: 页脚标语被截掉了（标语只给两行，换句更短的说法）`,
    );
  }
});
