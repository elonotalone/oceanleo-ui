// 分组这件事真的到了货架上（`tasks/W05.md` P3/P4/P5 的装配层）。
//
// `material-catalog-group.test.mjs` 守的是分组算法本身；这一份守的是**它被接上了**：
//   ① `useMaterialLibraryFacets` 出的是卡不是行——同一个标题不再连着出现四五次；
//   ② 卡内长出「换一个版本」的一排格子，可键盘聚焦、有 aria-label，
//      文案说的是**版本**而不是皮肤/风格（`02-arbitration.md` A1，写错 V1 判红）；
//   ③ 没有 `group:` 的行（PPT / 老网站行）卡里不长任何东西；
//   ④ 筛选面板**行业与子类在前、页数与外观收到「标签」后面**，数字按组不按行；
//   ⑤ 其它站（`enabled:false`）拿回的还是原来那个数组引用，一个字没动。
//
// 仓里没有 DOM 环境，所以这里只做静态渲染断言；「点一下换封面」那一段的行为判据在
// `material-catalog-group.test.mjs`（`perCard` 那几条）。

import assert from "node:assert/strict";
import test from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const OVERRIDES = {
  // 真 `useUI` 会去拿 locale 上下文；这里只要它把中文原文与占位符还回来，
  // 断言才能直接读到「用户会看到的那句话」。
  "../i18n/ui/useUI": dataModule(`
    export function useUI(){
      return (zh, vars) =>
        String(zh).replace(/\\{(\\w+)\\}/g, (whole, key) =>
          vars && vars[key] != null ? String(vars[key]) : whole,
        );
    }
  `),
};

const { useMaterialLibraryFacets } = await import(
  await compileModule("src/shell/material-library-facet-filter.tsx", OVERRIDES)
);

function templateRow({ id, title, group, sub, shape, skin, cover }) {
  return {
    id,
    title,
    kind: "image",
    thumbUrl: `https://assets.example/${id}.webp`,
    keywords: [
      "金融/地产/商业服务",
      "industry:business",
      `sub:${sub}`,
      `shape:${shape}`,
      `skin:${skin}`,
      `tpl:${id}`,
      `group:${group}`,
      ...(cover ? ["groupcover:1"] : []),
    ],
  };
}

/** 财务会计 5 页：三版，封面 paper。三版过去在货架上是三张同名卡。 */
const ACCOUNTING_S5 = [
  { skin: "glass", cover: false },
  { skin: "paper", cover: true },
  { skin: "navy", cover: false },
].map(({ skin, cover }) =>
  templateRow({
    id: `acct-s5-${skin}`,
    title: "财务会计专业服务站",
    group: "agency-accounting-s5",
    sub: "accounting",
    shape: "s5",
    skin,
    cover,
  }),
);

const ACCOUNTING_S6 = [
  { skin: "paper", cover: true },
  { skin: "neon", cover: false },
].map(({ skin, cover }) =>
  templateRow({
    id: `acct-s6-${skin}`,
    title: "财务会计专业服务站",
    group: "agency-accounting-s6",
    sub: "accounting",
    shape: "s6",
    skin,
    cover,
  }),
);

/** 只有一版的组：卡里不该长切换条。 */
const LAW_S4 = [
  templateRow({
    id: "law-s4-sand",
    title: "律师事务所形象站",
    group: "agency-law-s4",
    sub: "law",
    shape: "s4",
    skin: "sand",
    cover: true,
  }),
];

const PPT_ROW = {
  id: "ppt-quarterly",
  title: "季度汇报模板",
  kind: "ppt",
  thumbUrl: "https://assets.example/ppt.webp",
  keywords: ["季度", "汇报"],
};

const LEGACY_ROW = {
  id: "legacy-site",
  title: "老版通用企业站",
  kind: "image",
  thumbUrl: "https://assets.example/legacy.webp",
  keywords: ["通用行业", "industry:general", "sub:enterprise", "shape:s3", "skin:bento"],
};

const SHELF = [...ACCOUNTING_S5, ...ACCOUNTING_S6, ...LAW_S4, PPT_ROW, LEGACY_ROW];

/** 渲染一次，把 hook 的返回值抓出来，顺带拿到筛选面板的静态标记。 */
function mountShelf(entries = SHELF, { enabled = true } = {}) {
  let shelf = null;
  function Probe() {
    shelf = useMaterialLibraryFacets(entries, {
      enabled,
      scopeKey: "site:website",
    });
    return createElement("div", null, shelf.control);
  }
  const markup = renderToStaticMarkup(createElement(Probe));
  return { shelf, markup };
}

function actionsMarkup(shelf, entry) {
  const node = shelf.entryActions?.(entry);
  return node ? renderToStaticMarkup(node) : "";
}

test("货架出的是卡不是行：同一个标题不再连着出现几次", () => {
  const { shelf } = mountShelf();
  // 8 行 → 3 张分组卡 + 2 张未分组卡。
  assert.equal(shelf.entries.length, 5);
  const titles = shelf.entries.map((entry) => entry.title);
  assert.deepEqual(titles, [
    "财务会计专业服务站 · 5页",
    "财务会计专业服务站 · 6页",
    "律师事务所形象站 · 4页",
    "季度汇报模板",
    "老版通用企业站 · 3页 · 便当",
  ]);
  assert.equal(new Set(titles).size, titles.length);
  // 卡面默认是组封面那一行，点开落到它。
  assert.deepEqual(
    shelf.entries.slice(0, 3).map((entry) => entry.id),
    ["acct-s5-paper", "acct-s6-paper", "law-s4-sand"],
  );
});

test("卡内长出「换一个版本」：可聚焦、有 aria-label、默认选中组封面", () => {
  const { shelf } = mountShelf();
  const markup = actionsMarkup(shelf, shelf.entries[0]);
  // 三版三个格子，序号从 1 起。
  assert.equal(markup.match(/<button/g).length, 3);
  assert.match(markup, /aria-label="看第 1 个版本，共 3 个"/);
  assert.match(markup, /aria-label="看第 3 个版本，共 3 个"/);
  assert.match(markup, /aria-label="换一个版本"/);
  // 默认选中的是第一格（组封面），且只有一格被按下。
  assert.equal(markup.match(/aria-pressed="true"/g).length, 1);
  assert.match(
    markup,
    /aria-pressed="true"[^>]*aria-label="看第 1 个版本，共 3 个"/,
  );
  // 原生 button 天然可键盘聚焦，另外要看得见聚焦环。
  assert.match(markup, /focus-visible:ring-2/);
  assert.doesNotMatch(markup, /tabindex="-1"/i);
});

test("卡内文案说的是版本，不是皮肤/风格（A1）", () => {
  const { shelf } = mountShelf();
  const markup = actionsMarkup(shelf, shelf.entries[0]);
  assert.match(markup, /版本/);
  for (const forbidden of ["皮肤", "风格", "配色", "外观"]) {
    assert.ok(
      !markup.includes(forbidden),
      `卡内切换是「换一个版本」，不许出现「${forbidden}」，实际标记：${markup}`,
    );
  }
  // 皮肤名同样不许当成这一版的名字出现在按钮上。
  for (const skinLabel of ["素白", "深蓝", "玻璃"]) {
    assert.ok(!markup.includes(skinLabel), `按钮上不该写皮肤名「${skinLabel}」`);
  }
});

test("只有一版的组、以及没有 group: 的旧行，卡里什么都不长", () => {
  const { shelf } = mountShelf();
  const [, , law, ppt, legacy] = shelf.entries;
  assert.equal(shelf.entryActions(law), null);
  assert.equal(shelf.entryActions(ppt), null);
  assert.equal(shelf.entryActions(legacy), null);
});

test("筛选面板：行业与子类在前，页数与外观收到「标签」后面", () => {
  const { markup } = mountShelf();
  const industryAt = markup.indexOf("全部行业");
  const tagsAt = markup.indexOf("标签");
  const shapeAt = markup.indexOf("全部页数");
  const skinAt = markup.indexOf("全部外观");
  assert.ok(industryAt >= 0 && tagsAt >= 0 && shapeAt >= 0 && skinAt >= 0);
  assert.ok(
    industryAt < tagsAt && tagsAt < shapeAt && shapeAt < skinAt,
    `轴要在标签前面，实际次序：行业 ${industryAt} / 标签 ${tagsAt} / ` +
      `页数 ${shapeAt} / 外观 ${skinAt}`,
  );
  // 子类只在选了行业之后出现，这一条与今天一致。
  assert.ok(!markup.includes("全部子类"));
});

test("筛选项的数字按组数，不是行数", () => {
  const { markup } = mountShelf();
  // 金融/地产/商业服务：5 行财务会计 + 1 行律师 = 6 行，但只有 3 组。
  assert.match(markup, /金融\/地产\/商业服务 \(3\)/);
  // 页数：5 页 1 组、6 页 1 组、4 页 1 组、3 页是那条未归组的老行。
  assert.match(markup, /5页 \(1\)/);
  assert.match(markup, /6页 \(1\)/);
  // 外观是标签：paper 在两组里各有一版，所以它回答「有 2 件能做成素白」。
  assert.match(markup, /素白 \(2\)/);
});

test("其它站不受影响：拿回的还是原来那个数组引用", () => {
  const { shelf, markup } = mountShelf(SHELF, { enabled: false });
  assert.equal(shelf.entries, SHELF);
  assert.equal(shelf.active, false);
  assert.equal(shelf.control, null);
  assert.equal(shelf.entryActions, undefined);
  assert.equal(markup, "<div></div>");
});
