// 大卡片（多模板详情浮层）= `TemplateShowcase` 的行为契约（合同 §0.4 / §3.1，W3，2026-07-27）。
// 覆盖：
//   ① 左上主预览 + 左下缩略图条（≥2 份才出，0/1 份不出）+ 右侧标题/说明/标签的分栏版式；
//   ② 右侧按钮**恰好三个**「预览&编辑」「生成类似」「更多」，顺序定死，且**没有下载**；
//   ③ 两条深链 helper 的输出逐字符正确：
//        `workspaceTemplatePreviewHref` → /workspace/<appId>?tab=materials&item=…&mode=preview
//        （`tab` 的取值归接口 A 定义，见 `W2-interface-A.md`：官方模板素材固定
//         `materials`，`mine` 留给用户自有 artifact；`library` 作为历史别名归一化到 mine）
//        `exploreAppHref`               → /bay?kind=asset&app=…（LeoBay 的素材栏）
//   ④ **切换模板时右侧信息与按钮目标同步跟随选中项**（本组件最易回归处，jsdom 真点击）；
//   ⑤ 无模板 / 无代表 prompt 的 app 上按钮如何降级（「更多」几乎恒在，是唯一去处）；
//   ⑥ 自带遮罩 / Esc / 打开即聚焦必须保留，且不得改用 `../ui` 的 portal <Modal>；
//   ⑥b **条件 portal**（问题 1）：SSR / 首帧内联渲染（静态断言拿得到内容），mount 后
//      `createPortal(document.body)` 逃出调用方的 transform 祖先，`fixed inset-0` 才真满屏；
//   ⑥c **主预览不裁切**（问题 3）：硬比例 16/10 + object-cover 已废除，容器按素材真实
//      宽高比（元数据 → 图片自然尺寸）自适应，图片 object-contain；缩略图条仍 object-cover；
//   ⑦ 本文件的每条中文文案在 17 语词典里都有译文；已废除的两个旧按钮名 17 语全部清干净；
//   ⑧ 下载四档错误文案的词条**仍在** 17 语词典里（大卡片删了下载按钮，但 W5 的探索页
//      素材卡要复用同一套下载体验——删词条会让那边 16 个 locale 齐刷刷露中文）。
// 组件源码经 tests/helpers/module-bench.mjs 编出来再导入。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

// tt() 未命中词典时回退中文原文，测试里直接用恒等翻译。
const uiStubUrl = dataModule("export function useUI(){ return (zh) => zh; }");
const reactUrl = pathToFileURL(require.resolve("react")).href;
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);
// `react-dom` 接真包：条件 portal 必须由**同一个** react-dom 实例创建，替身做不到
// 「portal 出去的节点仍属于同一棵 React 树」这件事。
const OVERRIDES = {
  "../i18n/ui/useUI": uiStubUrl,
  "react-dom": reactDomUrl,
  "next/link": linkStubUrl,
};
const controllerUrl = await compileModule("src/shell/site-catalog-controller.ts", OVERRIDES);
const {
  workspaceTemplatePreviewHref,
  exploreAppHref,
  resolveSiteCatalogRoute,
  catalogCanonicalRedirect,
} = await import(controllerUrl);

// `TemplateMaterial` 形状（合同 §3）。两份模板的每个字段都刻意取不同值，
// 这样「右侧没跟着切」的实现会被下面的 doesNotMatch 抓住。
const TPL_A = {
  id: "poster-a",
  title: "夏季促销海报",
  summary: "3:4 竖版促销主视觉，主体居中、下方留文案区。",
  tags: ["促销", "竖版"],
  previewUrl: "tpl-material/image-poster-1",
  artifactId: "art-a",
  artifactType: "single_file_image",
};
const TPL_B = {
  id: "poster-b",
  title: "新品发布长图",
  summary: "9:16 长图，顶部产品特写、底部参数表。",
  tags: ["新品", "长图"],
  previewUrl: "tpl-material/image-poster-2",
  artifactId: "art-b",
  artifactType: "single_file_image",
  downloadUrl: "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/tpl/poster-b.psd",
};

const BASE = {
  appId: "poster",
  title: "海报生成",
  fallbackIcon: "🖼️",
  accent: "#6366f1",
  prompt: "生成一张 [活动] 宣传海报，风格 [风格]。",
  fillHref: "/workspace/poster?fill=preset",
  onClose() {},
};

/** 渲染出来的 `data-showcase-action` 取值，按 DOM 顺序。 */
function actionsOf(html) {
  return [...html.matchAll(/data-showcase-action="([^"]+)"/g)].map(([, name]) => name);
}

// ————————————————————————————————————————————————————————————————
// 1. 深链 helper（合同 §3.1 锁死的形状；W4 的库预览页与 W5 的探索页按它解析）
// ————————————————————————————————————————————————————————————————

test("workspaceTemplatePreviewHref 的输出逐字符锁死", () => {
  assert.equal(
    workspaceTemplatePreviewHref("poster", "art-a"),
    "/workspace/poster?tab=materials&item=art-a&mode=preview",
  );
  // 参数顺序也是契约的一部分：tab → item → mode。app 在路径段，不在 query。
  assert.deepEqual(
    [...new URL(workspaceTemplatePreviewHref("poster", "art-a"), "https://x").searchParams.keys()],
    ["tab", "item", "mode"],
  );
  // `mode=preview` 是本轮的产品要害：落点必须是**只读预览**，不是编辑器。
  assert.match(workspaceTemplatePreviewHref("poster", "art-a"), /mode=preview/);
  assert.doesNotMatch(workspaceTemplatePreviewHref("poster", "art-a"), /open=(advanced|template)/);
  assert.doesNotMatch(workspaceTemplatePreviewHref("poster", "art-a"), /[?&]app=/);

  // 需要转义的 id 走 URL 编码，不裸拼。
  assert.equal(
    workspaceTemplatePreviewHref("图片 生成", "art/b"),
    "/workspace/%E5%9B%BE%E7%89%87%20%E7%94%9F%E6%88%90?tab=materials&item=art%2Fb&mode=preview",
  );

  // 缺 artifact 就拼不出只读落点：退回该 app 的 canonical 地址，绝不产出半截深链。
  assert.equal(workspaceTemplatePreviewHref("poster", ""), "/workspace/poster");
  assert.equal(workspaceTemplatePreviewHref("", ""), "/workspace");
  assert.doesNotMatch(workspaceTemplatePreviewHref("poster", ""), /mode=preview/);
  // 缺 app、有 artifact：**不产出**预览深链（V5 残余 R-3 的修正）。
  // 本文件上一版这里写的是「预览页仍能开（app 只是锚点）」——那个判断是错的：库预览面板
  // 挂在 app 操作台的右栏里，没有 app 时右栏根本不挂载，那条链接看着像预览链接、点进去
  // 静静地什么都不发生。宁可退回目录（用户至少落在正常页面上），也不产出注定落不了地的链接。
  // 「缺锚点」的完整行为（生产侧与消费侧都必须出声）由
  // `tests/catalog-preview-deeplink.test.mjs` 的 ①②③ 三条钉死。
  assert.equal(workspaceTemplatePreviewHref("", "art-a"), "/workspace");
  assert.doesNotMatch(workspaceTemplatePreviewHref("", "art-a"), /mode=preview/);

  // 站点可自定义 canonicalBasePath。
  assert.equal(
    workspaceTemplatePreviewHref("poster", "art-a", { canonicalBasePath: "/studio" }),
    "/studio/poster?tab=materials&item=art-a&mode=preview",
  );
});

test("exploreAppHref 的输出逐字符锁死", () => {
  // 素材只在 LeoBay 的「素材」栏里展示（原「探索」页并到了那里）：落点是 /bay?kind=asset，可带 app 锚点。
  assert.equal(exploreAppHref("poster"), "/bay?kind=asset&app=poster");
  assert.equal(exploreAppHref("3d-model"), "/bay?kind=asset&app=3d-model");
  assert.equal(exploreAppHref("图片生成"), "/bay?kind=asset&app=%E5%9B%BE%E7%89%87%E7%94%9F%E6%88%90");
  // 空 appId 退回不带锚点的素材栏，不产出 `&app=`。
  assert.equal(exploreAppHref(""), "/bay?kind=asset");
  assert.equal(exploreAppHref("   "), "/bay?kind=asset");
  // 调用方传旧地址（locale 前缀站的 /ja/explore）也落到同一张页：/ja/bay。
  assert.equal(exploreAppHref("poster", { basePath: "/ja/explore" }), "/ja/bay?kind=asset&app=poster");
  assert.equal(exploreAppHref("poster", { basePath: "/ja/explore/" }), "/ja/bay?kind=asset&app=poster");
});

// ————————————————————————————————————————————————————————————————
// 1b. **方向性端到端**：产链接的人 → 解析链接的人（V5 判定书 §2 的 BLOCKER-1）
//
// 上一版这里只有「helper 的输出逐字符正确」，两条 helper 各自都绿，接缝却是断的：
// 库深链带 `mode=preview`，而 `mode` 同时是 legacy app 深链键（`legacyQueryKeys` 默认
// `["fn","mode"]`），于是 `preview` 被当成 app id，全站预览落点渲染成
// 「这个 App 不存在或已下线 / preview」。**单独测每一端永远是绿的**，只有把 A 的输出
// 真喂给 B 才抓得到。所以下面这几条一律走「helper 产出 → 路由解析器消费」的真实方向。
// ————————————————————————————————————————————————————————————————

/** 把 helper 产出的 href 拆成路由解析器的入参，中途不手写任何字面量。 */
function routeStateFor(href, knownAppIds) {
  const url = new URL(href, "https://image.oceanleo.com");
  return resolveSiteCatalogRoute({
    pathname: url.pathname,
    search: url.search,
    knownAppIds: new Set(knownAppIds),
  });
}

test("方向性：预览深链喂进 resolveSiteCatalogRoute 后仍指向同一个 app", () => {
  const appId = "animal-model";
  const artifactId = "4b3f256f-0b3a-4a1e-9f22-7c9a5b1d8e40";
  const href = workspaceTemplatePreviewHref(appId, artifactId);
  const state = routeStateFor(href, [appId, "poster"]);

  // 判定书点名的两条。
  assert.equal(state.activeAppId, appId);
  assert.equal(state.invalidAppId, "");
  // 以及事故现场的那三个中间量：`preview` 不许再被当成 app id。
  assert.equal(state.legacyAppId, "");
  assert.equal(state.requestedAppId, appId);
  assert.equal(state.pathAppId, appId);
  assert.equal(state.queryAppId, "");
});

test("方向性：17 种 app id 形态逐个走完 helper → 路由解析器", () => {
  // 真实站点的 app id 形态（含连字符、数字、非 ASCII），逐个证明接缝通。
  for (const appId of [
    "animal-model", "poster", "3d-model", "ppt", "resume2", "law-brief",
    "图片生成", "a", "app.with.dot", "app_underscore",
  ]) {
    const href = workspaceTemplatePreviewHref(appId, "art-1");
    const state = routeStateFor(href, [appId]);
    assert.equal(state.activeAppId, appId, `${appId}: activeAppId 不对（href=${href}）`);
    assert.equal(state.invalidAppId, "", `${appId}: 被判成了不存在的 app`);
  }
});

test("方向性：app 真的不存在时才报「不存在」，且报的是 app 不是 preview", () => {
  const href = workspaceTemplatePreviewHref("ghost-app", "art-1");
  const state = routeStateFor(href, ["poster"]);
  assert.equal(state.invalidAppId, "ghost-app");
  assert.notEqual(state.invalidAppId, "preview", "又把 mode 当成 app id 了");
  assert.equal(state.activeAppId, "");
});

test("方向性：新预览深链已经是 canonical 路径，不再经过目录页", () => {
  const appId = "animal-model";
  const href = workspaceTemplatePreviewHref(appId, "art-1");
  const url = new URL(href, "https://image.oceanleo.com");
  const state = routeStateFor(href, [appId]);
  const redirect = catalogCanonicalRedirect(state, url.pathname, url.search);

  assert.equal(href, "/workspace/animal-model?tab=materials&item=art-1&mode=preview");
  assert.equal(redirect, null);
  assert.equal(state.pathAppId, appId);
  assert.doesNotMatch(href, /[?&]app=/);
});

test("方向性：旧 /workspace?app= 书签仍规范化到路径段且保住 mode=preview", () => {
  const search = "?tab=materials&item=art-1&mode=preview&app=animal-model";
  const state = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search,
    knownAppIds: new Set(["animal-model"]),
  });
  const redirect = catalogCanonicalRedirect(state, "/workspace", search);
  assert.equal(redirect, "/workspace/animal-model?tab=materials&item=art-1&mode=preview");
  assert.doesNotMatch(redirect, /[?&]app=/);
  const after = new URL(redirect, "https://image.oceanleo.com");
  const settled = routeStateFor(redirect, ["animal-model"]);
  assert.equal(settled.activeAppId, "animal-model");
  assert.equal(catalogCanonicalRedirect(settled, after.pathname, after.search), null);
});

test("回归护栏：老式 ?mode=<appId> / ?fn=<appId> 深链一个都不许坏", () => {
  // 库深链的结构特征（tab=library / item=）不在时，`mode` 仍是 legacy app id。
  const legacy = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?mode=poster",
    knownAppIds: new Set(["poster"]),
  });
  assert.equal(legacy.legacyAppId, "poster");
  assert.equal(legacy.activeAppId, "poster");

  const fn = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?fn=poster",
    knownAppIds: new Set(["poster"]),
  });
  assert.equal(fn.activeAppId, "poster");

  // 极端情形：某个站真有一个叫 `preview` 的 app，它的老式链接照样能开。
  const appNamedPreview = resolveSiteCatalogRoute({
    pathname: "/workspace",
    search: "?mode=preview",
    knownAppIds: new Set(["preview"]),
  });
  assert.equal(appNamedPreview.activeAppId, "preview");
  assert.equal(appNamedPreview.invalidAppId, "");

  // 路径段永远优先于 query。
  const pathWins = resolveSiteCatalogRoute({
    pathname: "/workspace/poster",
    search: "?tab=library&item=art-1&mode=preview&app=animal-model",
    knownAppIds: new Set(["poster", "animal-model"]),
  });
  assert.equal(pathWins.activeAppId, "poster");
  assert.equal(pathWins.queryAppId, "");
});

// ————————————————————————————————————————————————————————————————
// 4. 17 语判据（i18n 词典是 W3 独占目录）
// ————————————————————————————————————————————————————————————————

const LOCALES = [
  "zh", "zh-TW", "en", "de", "es", "es-419", "fr", "it", "pt-BR",
  "pt-PT", "ja", "ko", "ar", "th", "tr", "vi", "hi",
];
const CHINESE_LOCALES = new Set(["zh", "zh-TW"]);

/** 本轮新增的五条（大卡片两颗按钮 + 探索页三段式分区名）。 */
const W3_NEW_COPY = ["预览&编辑", "更多", "此 app", "本站素材", "更多素材"];

/**
 * 下载四档错误文案 + 下载态文案：大卡片已删掉下载按钮，但这些词条**必须留在词典里**
 * ——W5 的探索页素材卡与库详情页要复用同一套下载体验。删掉会让 16 个 locale 露中文。
 */
const RETAINED_DOWNLOAD_COPY = [
  "下载",
  "登录后下载",
  "下载中…",
  "请先登录后再下载。",
  "今日下载次数已达上限，请明天再试。",
  "这份模板素材不存在或已下线。",
];

/** 本轮全站废除的两个旧按钮名：17 份词典里一条都不许留。 */
const RETIRED_COPY = ["编辑模板", "高级编辑"];

/**
 * V1 判据 21 / 判据 10 的补课：W4、W5 的调用点 + 那条已下架功能的旧名。
 *
 * 这批词条的失败形态是**静默**的——`tt()` 未命中就回退中文原文，不报错、不炸编译、
 * 测试全绿，只有 16 个非中文 locale 的用户看得见。所以必须由测试逐格钉住，
 * 且要同时钉「源码里那个调用点还活着」：词条补了而调用点改了串，等于白补。
 */
const V1_GAP_COPY = {
  // 2026-08-05（W25）：路径从 `material-library-view.tsx` 更正过来。`7fb8325`
  // （2026-07-28）把那排分区 tab 整段搬进了工具条，词条表没跟着改，于是
  // 「调用点还活着」每次全量都红了 8 天（`verdicts/W22-red-list.md` 第 9 条）。
  // 调用点是活的（`material-library-toolbar.tsx:131` 的 `tt("素材分区")`），只是搬了家。
  "素材分区": "src/shell/material-library-toolbar.tsx",
  "搜索本站素材": "src/shell/material-library-presentation.ts",
  "本站暂无可编辑素材": "src/shell/material-library-presentation.ts",
  "正在准备预览…": "src/shell/library-viewer-first-paint.tsx",
  "这份素材缺少 source 授权，暂时无法创建你自己的副本；官方原件不会被改动。":
    "src/shell/artifact-client.ts",
  "登录后才能编辑素材：需要先确认你的账号，才能把改动保存成你自己的副本。":
    "src/shell/artifact-client.ts",
  // 2026-08-05（W27）：`PENDING_I18N` 那一格补完译文后归队。`2ce8a49` 改了这句
  // 提示的后半句（「更多素材」按 D1 下线），17 份词典当时一份都没跟上，16 个非中文
  // locale 静默露中文；译文已逐语补齐，旧串一并从词典清掉。
  "这里只显示本站已登记的素材；可换一个分区或关键词。":
    "src/shell/material-library-presentation.ts",
};

/**
 * 欠着译文的词条登记表。**这张表只减不增**：下面的预算锁住它，补完译文就把那一格
 * 挪回 `V1_GAP_COPY` 并把预算改小。
 *
 * 由来（W25 2026-08-05）：`2ce8a49` 改了「本站空态」那句提示的后半句
 * （「更多素材」那一层按 D1 下线了），17 份词典一份都没跟上，这句提示因此在 16 个
 * 非中文 locale 上静默回退中文原文 —— 不报错、不炸编译，只有用户看得见，
 * 正是这一族测试要抓的失败形态。W25 当时按红线 §2.3 不动别人的词典，登记在此。
 *
 * 2026-08-05（W27）译文已逐语补齐（17 份全部改成新串、旧串一并清掉），
 * 那一格已归队 `V1_GAP_COPY`，表清空、预算归零。**下一位不许往这张表里塞新缺口**：
 * 预算是 0，新增一格当场红。
 */
const PENDING_I18N = [];

/** 今天真实欠着的 i18n 缺口数。只许改小。 */
const PENDING_I18N_BUDGET = 0;

/**
 * 一条源串今天在 `src/` 里的实际落点（词典目录不算 —— 那是译文，不是调用点）。
 * 只在断言失败时调用，用来把「搬家了」和「彻底没了」当场区分开。
 */
async function locateCopy(key) {
  const entries = await readdir(resolve("src"), {
    recursive: true,
    withFileTypes: true,
  });
  const hits = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const path = join(entry.parentPath ?? entry.path, entry.name);
    if (path.includes(join("i18n", "ui", "messages"))) continue;
    if ((await readFile(path, "utf8")).includes(key)) {
      hits.push(path.slice(path.indexOf("src")));
    }
  }
  return hits;
}

/** zh-TW 必须真本地化而不是逐字转繁的那几条。 */
const ZH_TW_MUST_DIFFER = {
  "预览&编辑": "預覽&編輯",
};

/**
 * zh-TW 与简体逐字相同的那几条：属**语言事实**（「更多」「素材」「此」在繁体中写法完全
 * 一致，没有可改的字），固化成白名单——日后有人往 zh-TW 里偷懒抄简体，这个集合会变大。
 */
const ZH_TW_SAME_AS_SOURCE = new Set(["更多", "此 app", "本站素材", "更多素材"]);

const uiDictionaries = new Map();
for (const locale of LOCALES) {
  const mod = await import(`../src/i18n/ui/messages/${locale}.ts`);
  uiDictionaries.set(locale, mod.default);
}

test("W3 新增的五条词条：17 语齐备，zh 是 key===值，15 个非中文 locale 真的翻了", () => {
  const zh = uiDictionaries.get("zh");
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  for (const key of W3_NEW_COPY) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
    for (const [locale, dict] of uiDictionaries) {
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      if (CHINESE_LOCALES.has(locale)) continue;
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      // 汉字残留启发式对 ja/ko 不成立（它们的正确译文本就含 CJK 码位）。
      if (locale !== "ja" && locale !== "ko") {
        assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
      }
    }
  }
});

test("W3 新增词条的 zh-TW：该改的改了，逐字相同的那几条是语言事实", () => {
  const zhTW = uiDictionaries.get("zh-TW");
  for (const [key, expected] of Object.entries(ZH_TW_MUST_DIFFER)) {
    assert.equal(zhTW[key], expected, `zh-TW 的 "${key}" 应为「${expected}」`);
  }
  const same = W3_NEW_COPY.filter((key) => zhTW[key] === key);
  assert.deepEqual(
    new Set(same),
    ZH_TW_SAME_AS_SOURCE,
    "zh-TW 出现了新的「与简体逐字相同」词条：要么它真的繁简同形（请加进白名单并说明），" +
      "要么是有人把简体直接抄进了 zh-TW（必须真翻）",
  );
});

test("下载四档错误文案仍在 17 语词典里（W5 的探索页素材卡要复用）", () => {
  for (const key of RETAINED_DOWNLOAD_COPY) {
    for (const [locale, dict] of uiDictionaries) {
      assert.equal(typeof dict[key], "string", `${locale} 丢了要复用的下载词条 "${key}"`);
      assert.notEqual(dict[key].trim(), "", `${locale} 的 "${key}" 是空串`);
    }
  }
});

test("已废除的两个旧按钮名：17 份词典里一条都不剩", () => {
  for (const key of RETIRED_COPY) {
    for (const [locale, dict] of uiDictionaries) {
      assert.equal(
        Object.prototype.hasOwnProperty.call(dict, key),
        false,
        `${locale} 词典仍留着已废除的 "${key}"`,
      );
    }
  }
});

test("V1 判据 21/10 的 8 条补课词条：17 语逐格齐备（136 格）", () => {
  const placeholder = /\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|\?\?\?|机翻|待翻译|[Uu]ntranslated/;
  const cjkOk = new Set(["zh", "zh-TW", "ja", "ko"]);
  const zh = uiDictionaries.get("zh");
  let cells = 0;

  for (const key of Object.keys(V1_GAP_COPY)) {
    assert.equal(zh[key], key, `zh 的 "${key}" 必须 key===值`);
    for (const [locale, dict] of uiDictionaries) {
      cells += 1;
      const value = dict[key];
      assert.equal(typeof value, "string", `${locale} 缺 "${key}"`);
      assert.notEqual(value.trim(), "", `${locale} 的 "${key}" 是空串`);
      assert.doesNotMatch(value, placeholder, `${locale} 的 "${key}" 像占位`);
      if (cjkOk.has(locale)) continue;
      // 这一条正是本次 FAIL 的形态：词典没有 → tt() 静默回退中文原文。
      assert.notEqual(value, key, `${locale} 的 "${key}" 还是中文源串（未翻译）`);
      assert.doesNotMatch(value, /[\u4e00-\u9fff]/, `${locale} 的 "${key}" 残留汉字`);
    }
    // zh-TW 这 8 条都存在简繁差异，照抄简体即漏翻。
    assert.notEqual(
      uiDictionaries.get("zh-TW")[key],
      zh[key],
      `zh-TW 的 "${key}" 照抄了简体`,
    );
  }
  assert.equal(cells, 8 * 17, "应当覆盖 136 格");
});

/**
 * 逐格判，不在第一条就抛 —— 原来这里用 `assert.ok` 一条一条抛，
 * 「素材分区」那条红把后面「更多素材」那条红整整挡了 8 天没人看见。
 * 失败消息里直接把源串今天在 `src/` 的实际落点报出来，搬了家的下次是一行改完的事，
 * 不用再从头查一遍 git 历史。
 */
test("那 8 条词条的调用点还活着（词条补了而源串改了 = 白补）", async () => {
  const broken = [];
  for (const [key, file] of Object.entries(V1_GAP_COPY)) {
    const source = await readFile(resolve(file), "utf8");
    if (source.includes(key)) continue;
    broken.push(`${file} 里找不到源串 "${key.slice(0, 24)}…"，实际落点：${
      (await locateCopy(key)).join(" / ") || "src/ 里已经完全没有这个串（文案被改写或下线）"
    }`);
  }
  assert.deepEqual(broken, [], "词条与调用点已经对不上");
});

test("欠着的 i18n 缺口：只减不增，且每一条都还真的欠着", async () => {
  assert.equal(
    PENDING_I18N.length,
    PENDING_I18N_BUDGET,
    "PENDING_I18N 与预算对不上：补完译文要把两边一起改小，新增缺口不许往这张表里塞",
  );
  const zh = uiDictionaries.get("zh");
  for (const gap of PENDING_I18N) {
    assert.ok(gap.reason.length >= 10, `"${gap.live.slice(0, 16)}…" 的登记理由太短`);
    // 登记必须是真的：源码里那句新文案还在，且词典里确实还没有它。
    const source = await readFile(resolve(gap.file), "utf8");
    assert.ok(
      source.includes(gap.live),
      `${gap.file} 里已经没有 "${gap.live.slice(0, 20)}…"：这条登记过期了，该删或该改`,
    );
    assert.equal(
      typeof zh[gap.live],
      "undefined",
      `词典已经补上 "${gap.live.slice(0, 20)}…" 了：把它挪回 V1_GAP_COPY 并把预算改小`,
    );
    // 旧串确实已经从源码里退役 —— 否则这就不是「改了文案」，是两句并存。
    assert.equal(
      source.includes(gap.retired),
      false,
      `${gap.file} 里旧串还在，新旧两句并存，这条登记的定性不成立`,
    );
  }
});

test("新词条不会被 renamePromptTemplateTerm 改写", async () => {
  const hook = await readFile(resolve("src/i18n/ui/useUI.ts"), "utf8");
  // 改写只在源串含「灵感/靈感」时才启动，且只作用在那一支。
  assert.match(hook, /const isInspirationCopy = \/灵感\|靈感\/\.test\(canonical\);/);
  for (const key of W3_NEW_COPY) {
    assert.doesNotMatch(key, /灵感|靈感/, `"${key}" 会触发 prompt 语境改名`);
    // 另一条 canonicalize（文件库→我的库）同样不得改动这些 key，否则查表会落空。
    assert.doesNotMatch(key, /文件库|檔案庫|檔案库/);
  }
});
