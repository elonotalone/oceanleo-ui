// ============================================================================
// W3 — 首页 app 卡片的数据契约测试（2026-07-25「prompt 卡与 app 卡合二为一」）
// ----------------------------------------------------------------------------
// 覆盖三块：
//   1. `representativePrompt()` / `representativeFill()`（shell/app-catalog.ts）
//      —— 一张首页卡片要灌进输入框的那条 prompt，以及深链要预填的整套参数。
//   2. `shell/home-cards.ts` 的迁移：不再是首页内置卡来源，但导出面与老用户
//      localStorage 数据必须一字不动地保留（Playground / OperatorConsole 是活消费者）。
//   3. 四条新 UI 文案在 17 份词典里都有人工可用译文。
//
// 本文件跑在【裸 node --test】下（不带 ts-extension-loader / 额外 flag）：
//   bash scripts/agent-io-guard.sh run-light -- node --test tests/home-card-data-contract.test.mjs
// 之所以能直接 `import` 这些 .ts，是因为 app-catalog.ts / home-cards.ts / config.ts /
// messages/*.ts 全都是「运行时零依赖」的纯模块（app-catalog 的类型 import 已写成
// `import type`，整条语句在类型擦除后消失，不会把含 JSX 的 .tsx 拖进运行时）。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  representativeFill,
  representativePrompt,
} from "../src/shell/app-catalog.ts";
import {
  GENERIC_PROMPTS,
  PROMPT_LIBRARY,
  loadAllCustomPromptCards,
  loadCustomPromptCards,
  promptCardsForSite,
  saveCustomPromptCards,
} from "../src/shell/home-cards.ts";
import { LOCALES } from "../src/i18n/config.ts";

const source = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1. 代表 prompt 取值契约
// ---------------------------------------------------------------------------

const appWith = (extra) => ({ id: "x", name: "测试 app", scenes: [], ...extra });

const guideOnlyApp = (example) =>
  appWith({
    guideSections: [
      { title: "快速起手", examples: [example] },
      { title: "另一个板块", examples: [{ label: "不该被取到", prompt: "第二板块的 prompt" }] },
    ],
  });

test("representativePrompt：只有 preset → 取 preset.prompt", () => {
  const app = appWith({ preset: { prompt: "帮我做一张 [主题] 海报", set: { ratio: "16:9" } } });
  assert.equal(representativePrompt(app), "帮我做一张 [主题] 海报");
});

test("representativePrompt：只有 guideSections → 取第一个板块第一张示例卡", () => {
  const app = guideOnlyApp({ label: "第一张", prompt: "画一幅 [风格] 插画" });
  assert.equal(representativePrompt(app), "画一幅 [风格] 插画");
});

test("representativePrompt：preset 与 guideSections 同时存在 → preset 优先", () => {
  const app = appWith({
    preset: { prompt: "preset 起手式" },
    guideSections: [{ title: "灵感", examples: [{ label: "示例", prompt: "示例 prompt" }] }],
  });
  assert.equal(representativePrompt(app), "preset 起手式");
});

test("representativePrompt：两者皆空 → null（music 站 22 个 app 的真实形态）", () => {
  assert.equal(representativePrompt(appWith({})), null);
  assert.equal(representativePrompt(appWith({ preset: {} })), null);
  assert.equal(representativePrompt(appWith({ preset: { set: { ratio: "1:1" } } })), null);
  assert.equal(representativePrompt(appWith({ guideSections: [] })), null);
  assert.equal(
    representativePrompt(appWith({ guideSections: [{ title: "空板块", examples: [] }] })),
    null,
  );
});

test("representativePrompt：空白字符串不算有值，且返回值已 trim", () => {
  // 纯空白的 preset.prompt 必须【穿透】到 guideSections，而不是把空串当命中。
  assert.equal(
    representativePrompt(
      appWith({
        preset: { prompt: "   \n\t  " },
        guideSections: [{ title: "灵感", examples: [{ label: "示例", prompt: "  真正的 prompt  " }] }],
      }),
    ),
    "真正的 prompt",
  );
  // 两处都只有空白 → null（绝不允许把空串灌进首页输入框）。
  assert.equal(
    representativePrompt(
      appWith({
        preset: { prompt: "  " },
        guideSections: [{ title: "灵感", examples: [{ label: "示例", prompt: "\t\n" }] }],
      }),
    ),
    null,
  );
});

test("representativeFill：只有 preset → prompt + preset.set 原样带出", () => {
  const app = appWith({
    preset: { prompt: "preset 起手式", set: { ratio: "16:9", genMode: "fast" } },
  });
  assert.deepEqual(representativeFill(app), {
    prompt: "preset 起手式",
    set: { ratio: "16:9", genMode: "fast" },
  });
});

test("representativeFill：prompt 来自示例卡 → preset.set 作底，示例 set 覆盖同名字段", () => {
  const app = appWith({
    preset: { set: { ratio: "16:9", genMode: "fast", style: "默认" } },
    guideSections: [
      {
        title: "行业灵感",
        examples: [
          { label: "示例", prompt: "示例 prompt", set: { ratio: "1:1", extra: "示例独有" } },
        ],
      },
    ],
  });
  assert.deepEqual(representativeFill(app), {
    prompt: "示例 prompt",
    // ratio 被示例覆盖；genMode/style 留 preset 的底；extra 是示例独有。
    set: { ratio: "1:1", genMode: "fast", style: "默认", extra: "示例独有" },
  });
});

test("representativeFill：只有 guideSections 且示例无 set → 空 set，不是 undefined", () => {
  const fill = representativeFill(guideOnlyApp({ label: "第一张", prompt: "示例 prompt" }));
  assert.deepEqual(fill, { prompt: "示例 prompt", set: {} });
});

test("representativeFill：两者皆空/空白 → null（不给半套参数）", () => {
  assert.equal(representativeFill(appWith({})), null);
  assert.equal(representativeFill(appWith({ preset: { set: { ratio: "1:1" } } })), null);
  assert.equal(
    representativeFill(
      appWith({
        preset: { prompt: "   ", set: { ratio: "1:1" } },
        guideSections: [{ title: "灵感", examples: [{ label: "示例", prompt: " " }] }],
      }),
    ),
    null,
  );
});

test("representativeFill：不共享引用（调用方 mutate 不得污染 catalog 数据）", () => {
  const presetSet = { ratio: "16:9" };
  const app = appWith({ preset: { prompt: "起手式", set: presetSet } });
  const fill = representativeFill(app);
  fill.set.ratio = "被改了";
  assert.equal(presetSet.ratio, "16:9");
});

test("representativePrompt 与 representativeFill 的 prompt 永远一致", () => {
  const apps = [
    appWith({ preset: { prompt: "A" } }),
    guideOnlyApp({ label: "l", prompt: "B" }),
    appWith({ preset: { prompt: " " }, guideSections: [{ title: "t", examples: [{ label: "l", prompt: "C" }] }] }),
    appWith({}),
  ];
  for (const app of apps) {
    assert.equal(representativeFill(app)?.prompt ?? null, representativePrompt(app));
  }
});

test("两个新函数就住在 presetToOpsPatch 旁边（同一文件的数据契约区）", () => {
  const catalog = source("../src/shell/app-catalog.ts");
  assert.match(catalog, /export function presetToOpsPatch\(/);
  assert.match(catalog, /export function representativePrompt\(/);
  assert.match(catalog, /export function representativeFill\(/);
  // 类型 import 必须保持 `import type`，否则本测试文件会因为拖进 .tsx 而无法运行。
  assert.match(catalog, /^import type \{ GuideSection \} from "\.\/NavigatorGuide";$/m);
  assert.match(catalog, /^import type \{ MaterialItem \} from "\.\/MaterialLibrary";$/m);
  assert.doesNotMatch(catalog, /^import \{ type /m);
});

// ---------------------------------------------------------------------------
// 2. home-cards.ts 迁移：导出面与老用户数据不回归
// ---------------------------------------------------------------------------

test("home-cards 仍导出全部符号（Playground / OperatorConsole 是活消费者）", () => {
  assert.ok(Array.isArray(GENERIC_PROMPTS) && GENERIC_PROMPTS.length > 0);
  assert.equal(typeof PROMPT_LIBRARY, "object");
  assert.ok(Object.keys(PROMPT_LIBRARY).length > 0);
  for (const fn of [
    promptCardsForSite,
    loadCustomPromptCards,
    saveCustomPromptCards,
    loadAllCustomPromptCards,
  ]) {
    assert.equal(typeof fn, "function");
  }
});

test("两个既有消费者仍从 home-cards 取内置文案（删导出即回归）", () => {
  const operatorConsole = source("../src/shell/OperatorConsole.tsx");
  const playground = source("../src/shell/Playground.tsx");

  assert.match(operatorConsole, /import \{ promptCardsForSite \} from "\.\/home-cards";/);
  assert.match(operatorConsole, /const cards = promptCardsForSite\(id\);/);
  assert.match(playground, /GENERIC_PROMPTS,\n\s+PROMPT_LIBRARY,/);
  assert.match(playground, /loadAllCustomPromptCards/);
});

test("首页迁到 app 卡片后，PROMPT_LIBRARY 缺这些 site key 是已知且无害的", () => {
  // 既存 bug：`money` 仓传 siteId="finance" 但表键是 `money`；edu/med/travel/notebook
  // 表里根本没有条目。过去这会让这些站首页落到 GENERIC_PROMPTS 通用兜底。
  const knownMissing = ["finance", "edu", "med", "travel", "notebook"];
  for (const siteId of knownMissing) {
    assert.equal(
      PROMPT_LIBRARY[siteId],
      undefined,
      `${siteId} 若被补进 PROMPT_LIBRARY，请同时更新 home-cards.ts 文件头与本断言`,
    );
  }
  // 首页已不查这张表（改渲染 GoalApp），所以首页面的缺陷消失；对仅存的消费者
  // OperatorConsole.autoGuideForSite() 而言，回退到通用兜底本身就是设计意图：
  // promptCardsForSite 永不返回空数组 → autoGuideForSite 永不因空库返回 null。
  for (const siteId of knownMissing) {
    const cards = promptCardsForSite(siteId);
    assert.ok(cards.length > 0, `${siteId} 必须有可用兜底导航`);
    assert.deepEqual(cards, GENERIC_PROMPTS);
    // autoGuideForSite 取前 6 张卡做示例，每张都必须有可灌的 prompt。
    for (const card of cards.slice(0, 6)) {
      assert.equal(typeof card.prompt, "string");
      assert.ok(card.prompt.trim().length > 0);
      assert.ok(card.title.trim().length > 0);
    }
  }
});

test("autoGuideForSite 的兜底路径没有被改成「空库就返回 null」", () => {
  const operatorConsole = source("../src/shell/OperatorConsole.tsx");
  // 保留「id 为空 → null」的短路，但库为空的分支对上述五站不可达（promptCardsForSite
  // 总有通用兜底），这正是这些站仍有导航的原因。
  assert.match(operatorConsole, /if \(!id\) return null;/);
  assert.match(operatorConsole, /if \(!cards\.length\) return null;/);
  assert.match(operatorConsole, /cards\.slice\(0, 6\)\.map\(/);
});

test("用户自建卡 localStorage 契约：key 前缀与老数据读写不变", () => {
  const store = new Map();
  const localStorage = {
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const priorWindow = globalThis.window;
  const priorStorage = globalThis.localStorage;
  globalThis.window = { localStorage };
  globalThis.localStorage = localStorage;
  try {
    // (a) 老用户既有数据（本次改动之前写下的）必须仍能读出来。
    store.set(
      "oceanleo_home_prompts:word",
      JSON.stringify([
        { id: "u1", icon: "📝", title: "老卡片", desc: "老用户数据", prompt: "老 prompt", category: "工作" },
      ]),
    );
    const loaded = loadCustomPromptCards("word");
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].id, "u1");
    assert.equal(loaded[0].prompt, "老 prompt");
    assert.equal(loaded[0].custom, true);

    // (b) 写入用的 key 前缀不得改名。
    saveCustomPromptCards("image", [
      { id: "u2", icon: "🖼️", title: "新卡片", desc: "d", prompt: "p", category: "创作" },
    ]);
    assert.ok(store.has("oceanleo_home_prompts:image"));
    assert.equal(loadCustomPromptCards("image")[0].id, "u2");

    // (c) 没给 siteId → default 分桶（老行为）。
    saveCustomPromptCards("", [
      { id: "u3", icon: "✨", title: "无站卡片", desc: "d", prompt: "p", category: "c" },
    ]);
    assert.ok(store.has("oceanleo_home_prompts:default"));

    // (d) 跨站聚合（playground prompt 专区依赖它）按 id 去重后能看到全部站的自建卡。
    const allIds = loadAllCustomPromptCards().map((c) => c.id).sort();
    assert.deepEqual(allIds, ["u1", "u2", "u3"]);

    // (e) 脏数据不得炸（缺 prompt / 非数组 / 坏 JSON）。
    store.set("oceanleo_home_prompts:bad", "{not json");
    assert.deepEqual(loadCustomPromptCards("bad"), []);
    store.set("oceanleo_home_prompts:bad", JSON.stringify({ nope: 1 }));
    assert.deepEqual(loadCustomPromptCards("bad"), []);
    store.set("oceanleo_home_prompts:bad", JSON.stringify([{ id: "x", title: "缺 prompt" }]));
    assert.deepEqual(loadCustomPromptCards("bad"), []);
  } finally {
    globalThis.window = priorWindow;
    globalThis.localStorage = priorStorage;
  }
});

test("home-cards 文件头写清了新旧关系与保留原因", () => {
  const homeCards = source("../src/shell/home-cards.ts");
  assert.match(homeCards, /不再是首页内置卡的\n\/\/   来源|不再是首页内置卡/);
  assert.match(homeCards, /representativePrompt\(\)/);
  assert.match(homeCards, /Playground/);
  assert.match(homeCards, /autoGuideForSite/);
  assert.match(homeCards, /oceanleo_home_prompts:/);
  // 前缀常量本身不得改名。
  assert.match(homeCards, /const CUSTOM_KEY_PREFIX = "oceanleo_home_prompts:";/);
});

// ---------------------------------------------------------------------------
// 3. 17 语新词条
// ---------------------------------------------------------------------------

// 首页 app 卡片浮层 / 预览大图 lightbox 用到的四条文案。
const NEW_UI_COPY = ["生成类似", "高级编辑", "查看全部", "预览大图"];

// 派活合同 §3 还把「代表 prompt」列为 W3 产出的词条（lightbox 里代表 prompt 全文的标签），
// 一并落地，免得 W1 接线时又缺一条。
const CONTRACT_EXTRA_COPY = ["代表 prompt"];

// V1-verdict §5 的 i18n 覆盖检查器在首页 app 卡片这一面还查出一条【基线既有】缺口：
// `添加 prompt` 被 `HomeCards.tsx` tt() 了很久，却 17 份词典一条都没有 → 16 个非中文
// locale 的首页按钮露中文。不是本轮造成的回归，但就长在本轮改版的卡片区上，顺手补齐并钉住。
const PREEXISTING_GAP_COPY = ["添加 prompt"];

/** 本文件对 17 语一起施加同一套判据的全部 key。 */
const ALL_COPY = [...NEW_UI_COPY, ...CONTRACT_EXTRA_COPY, ...PREEXISTING_GAP_COPY];

// zh 是规范来源（key===值）；zh-TW 是中文变体，部分词条的繁体写法与简体源串本就完全
// 相同（如「查看全部」「代表 prompt」没有简繁差异），所以「译文必须≠中文源串」这条只对
// 15 个非中文 locale 生效。
const CHINESE_LOCALES = new Set(["zh", "zh-TW"]);

// zh-TW 里确实存在简繁差异、因此必须被改写的词条。
// 「高级编辑」→「進階編輯」不是逐字转繁：台湾软件界把 advanced 叫「進階」而非「高級」，
// 这一条是真人工本地化的证据（机器逐字转换只会得到「高級編輯」）。
const ZH_TW_MUST_DIFFER = {
  "生成类似": "生成類似",
  "高级编辑": "進階編輯",
  "预览大图": "預覽大圖",
  "添加 prompt": "新增 prompt", // 台湾用「新增」而非「添加」
};

// V1-verdict §5 的两条 WARNING：zh-TW 的这两条与简体源串逐字相同。属**语言事实**而非漏翻
// ——「查看全部」「代表」四字在繁体中写法完全一致，没有可改的字。把它固化成**白名单**：
// 若日后有人往 zh-TW 里偷懒直接抄简体，这个集合会变大并让测试变红。
const ZH_TW_SAME_AS_SOURCE = new Set(["查看全部", "代表 prompt"]);

const dictionaries = new Map();
for (const locale of LOCALES) {
  const mod = await import(`../src/i18n/ui/messages/${locale}.ts`);
  dictionaries.set(locale, mod.default);
}

test("17 个 locale 的词典都被加载到（locale 清单取自 config.ts，防漂移）", () => {
  assert.equal(LOCALES.length, 17);
  assert.equal(dictionaries.size, 17);
  for (const [locale, dict] of dictionaries) {
    assert.equal(typeof dict, "object", `${locale} 词典必须是对象`);
    assert.ok(Object.keys(dict).length > 1000, `${locale} 词典疑似没加载全`);
  }
});

test("新增/补齐的 6 条文案在 17 份词典里都存在且非空", () => {
  for (const key of ALL_COPY) {
    for (const [locale, dict] of dictionaries) {
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
    }
  }
});

test("15 个非中文 locale 的译文不得等于中文源串（禁机器占位/禁留空）", () => {
  for (const key of ALL_COPY) {
    for (const [locale, dict] of dictionaries) {
      if (CHINESE_LOCALES.has(locale)) continue;
      assert.notEqual(
        dict[key],
        key,
        `${locale} 的 "${key}" 还是中文源串（未翻译）`,
      );
    }
  }
});

test("译文里没有机器占位痕迹", () => {
  // 大小写敏感 + 词边界：西语「Ver todo」（查看全部）里的 todo 是真译文，不是占位标记。
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  for (const key of ALL_COPY) {
    for (const [locale, dict] of dictionaries) {
      const value = dict[key];
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      // 「中文残留」启发式只对**非 CJK 文字系统**的 locale 成立：ja 的「似たものを生成」、
      // ko 的汉字词都合法含 CJK 码位，拿这条去查 ja/ko 会把正确译文冤枉成未翻译
      // （V1-verdict §5 记录其检查器初版正是踩了这个坑，后改为同样口径）。
      if (!CHINESE_LOCALES.has(locale) && locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(
          value,
          /[\u4e00-\u9fff]/,
          `${locale} 的 "${key}" 残留汉字`,
        );
      }
    }
  }
});

test("zh 词典 key===值；zh-TW 对有简繁差异的词条给了繁体写法", () => {
  const zh = dictionaries.get("zh");
  for (const key of ALL_COPY) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
  }
  const zhTW = dictionaries.get("zh-TW");
  for (const [key, expected] of Object.entries(ZH_TW_MUST_DIFFER)) {
    assert.equal(zhTW[key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
    assert.notEqual(zhTW[key], key);
  }
});

test("zh-TW 与简体逐字相同的词条只有白名单里那两条（V1 的 2 条 WARNING）", () => {
  const zhTW = dictionaries.get("zh-TW");
  const same = ALL_COPY.filter((key) => zhTW[key] === key);
  assert.deepEqual(
    new Set(same),
    ZH_TW_SAME_AS_SOURCE,
    "zh-TW 出现了新的「与简体逐字相同」词条：要么它真的繁简同形（请加进白名单并说明），" +
      "要么是有人把简体直接抄进了 zh-TW（必须真翻）",
  );
});

test("「高级编辑」等新文案不会被 renamePromptTemplateTerm 改写", () => {
  const hook = source("../src/i18n/ui/useUI.ts");
  // 改写只在源串含「灵感/靈感」时才启动，且只作用在那一支。
  assert.match(hook, /const isInspirationCopy = \/灵感\|靈感\/\.test\(canonical\);/);
  assert.match(hook, /isInspirationCopy\s*\n?\s*\?\s*renamePromptTemplateTerm\(translated, locale\)/);
  for (const key of ALL_COPY) {
    assert.doesNotMatch(key, /灵感|靈感/, `"${key}" 会触发 prompt 语境改名`);
    // 另一条 canonicalize（文件库→我的库）同样不得改动这些 key，否则查表会落空。
    assert.doesNotMatch(key, /文件库|檔案庫|檔案库/);
  }
});

test("新文案的查表键就是源串本身（canonicalize 后不变，17 语真命中）", () => {
  // 复刻 useUI 的 canonicalize + 查表，确认 17 语都能真的命中而不是回退中文。
  const canonicalize = (zh) =>
    zh.replaceAll("文件库", "我的库").replaceAll("檔案庫", "我的库").replaceAll("檔案库", "我的库");
  for (const key of ALL_COPY) {
    assert.equal(canonicalize(key), key);
    for (const [locale, dict] of dictionaries) {
      const hit = dict[canonicalize(key)];
      assert.ok(hit != null && hit !== "", `${locale} 的 "${key}" 会回退中文原文`);
    }
  }
});
