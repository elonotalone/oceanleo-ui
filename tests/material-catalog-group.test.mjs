// 货架按「行业 × 内容」出卡、风格收进卡里（`tasks/W05.md`）的契约。
// 守五件事：
//   ① 带 `group:` 的多行收成一张卡，卡面是 `groupcover:1` 那一行；
//   ② **没有 `group:` 的旧行逐字不变**——PPT / 图片 / 音频的货架不许被这一波动到；
//   ③ 卡片标题不再带皮肤（皮肤是卡内的切换），但**保留页数**，
//      因为分组键含 shape，同一子类的 5 页版与 6 页版是两组两张卡；
//   ④ 同一个标题不许在货架上出现两次——这就是这一波要消掉的毛病本身；
//   ⑤ 筛选项的数字按组数，不是行数。

import assert from "node:assert/strict";
import test from "node:test";

import {
  MATERIAL_INDUSTRY_SUB_LABELS,
  MATERIAL_SHAPE_LABELS,
  MATERIAL_SHAPE_ORDER,
  MATERIAL_SKIN_LABELS,
  MATERIAL_SKIN_ORDER,
  materialFacetRecords,
} from "../src/shell/material-library-facets.ts";
import {
  materialCatalogActiveRecord,
  materialCatalogActiveSkin,
  materialCatalogCardMatches,
  materialCatalogCardSkins,
  materialCatalogCards,
  materialCatalogEntries,
  materialCatalogFacetOptions,
  materialCatalogSkinChips,
} from "../src/shell/material-catalog-group.ts";

/**
 * `W01` 落盘前的自造 fixture，形状照合同接口 B：
 * `group:<appId>-<sub>-<shape>` + 每组恰一行 `groupcover:1` + `skin:<键>`。
 */
function templateRow({ id, title, group, sub, shape, skin, cover }) {
  return {
    id,
    title,
    kind: "image",
    thumbUrl: `https://assets.example/${id}.webp`,
    keywords: [
      // 中文展示词与机读键在同一个数组里并列，与上架脚本
      // `oceanleo-asset-website-templates-materialize.mjs:528-543` 的写法一致。
      "金融/地产/商业服务",
      "website-source",
      "industry:business",
      `sub:${sub}`,
      `shape:${shape}`,
      `skin:${skin}`,
      `group:${group}`,
      ...(cover ? ["groupcover:1"] : []),
    ],
  };
}

/** 财务会计 5 页：三张皮，封面是 paper。 */
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

/** 同一个子类的 6 页版：**基础标题与 5 页版一模一样**，靠页数区分。 */
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

/** 只有一张皮的组：卡内不该长出切换条。 */
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

/** 别的品类：没有任何 facet，必须逐字不变、原样单独成卡。 */
const PPT_ROW = {
  id: "ppt-quarterly",
  title: "季度汇报模板",
  kind: "ppt",
  thumbUrl: "https://assets.example/ppt.webp",
  keywords: ["季度", "汇报"],
};

/** 还没被 `W01` 归组的老网站行：带 shape/skin，没有 group，行为必须与今天一致。 */
const LEGACY_ROW = {
  id: "legacy-site",
  title: "老版通用企业站",
  kind: "image",
  thumbUrl: "https://assets.example/legacy.webp",
  keywords: [
    "通用行业",
    "industry:general",
    "sub:enterprise",
    "shape:s3",
    "skin:bento",
  ],
};

const SHELF = [
  ...ACCOUNTING_S5,
  ...ACCOUNTING_S6,
  ...LAW_S4,
  PPT_ROW,
  LEGACY_ROW,
];

function shelfCards(entries = SHELF) {
  return materialCatalogCards(materialFacetRecords(entries));
}

test("同一 group 的多行收成一张卡，卡面是 groupcover:1 那一行", () => {
  const cards = shelfCards();
  // 6 行网站模板 → 3 张分组卡；另外两行没有 group，各自单独成卡。
  assert.equal(cards.length, 5);
  const [accountingS5, accountingS6, law] = cards;
  assert.equal(accountingS5.groupKey, "agency-accounting-s5");
  assert.equal(accountingS5.grouped, true);
  assert.equal(accountingS5.cover.entry.id, "acct-s5-paper");
  assert.equal(accountingS6.cover.entry.id, "acct-s6-paper");
  assert.equal(law.cover.entry.id, "law-s4-sand");
  // 组的位置按第一次出现，货架既有排序不被打乱（glass 是 5 页组的第一行）。
  assert.deepEqual(
    cards.map((card) => card.key),
    [
      "group:agency-accounting-s5",
      "group:agency-accounting-s6",
      "group:agency-law-s4",
      "row:6:ppt-quarterly",
      "row:7:legacy-site",
    ],
  );
});

test("组内皮肤按声明序挂在卡上，默认选中组封面", () => {
  const [accountingS5] = shelfCards();
  assert.deepEqual(materialCatalogCardSkins(accountingS5), [
    "paper",
    "navy",
    "glass",
  ]);
  for (const skin of materialCatalogCardSkins(accountingS5)) {
    assert.ok(MATERIAL_SKIN_ORDER.includes(skin));
  }
  assert.equal(materialCatalogActiveSkin(accountingS5), "paper");
  assert.equal(
    materialCatalogActiveRecord(accountingS5).entry.id,
    "acct-s5-paper",
  );
});

test("卡内换皮肤，封面图与点开落点跟着换", () => {
  const [accountingS5] = shelfCards();
  const choice = { perCard: { "agency-accounting-s5": "navy" } };
  const picked = materialCatalogActiveRecord(accountingS5, choice);
  assert.equal(picked.entry.id, "acct-s5-navy");
  assert.equal(picked.entry.thumbUrl, "https://assets.example/acct-s5-navy.webp");
  // 别的组不受这张卡的选择影响。
  const [, accountingS6] = shelfCards();
  assert.equal(materialCatalogActiveSkin(accountingS6, choice), "paper");
});

test("只有一张皮的组不长切换条；多张皮的组给出该组实有的那几种", () => {
  const [accountingS5, , law] = shelfCards();
  assert.deepEqual(materialCatalogSkinChips(law), []);
  const chips = materialCatalogSkinChips(accountingS5);
  assert.deepEqual(
    chips.map((chip) => chip.skin),
    ["paper", "navy", "glass"],
  );
  assert.deepEqual(
    chips.map((chip) => chip.label),
    ["素白", "深蓝", "玻璃"],
  );
  for (const chip of chips) {
    assert.equal(chip.label, MATERIAL_SKIN_LABELS[chip.skin]);
  }
  assert.deepEqual(
    chips.filter((chip) => chip.selected).map((chip) => chip.skin),
    ["paper"],
  );
  assert.deepEqual(
    chips.filter((chip) => chip.cover).map((chip) => chip.skin),
    ["paper"],
  );
});

test("分组卡标题不再带皮肤，页数保留", () => {
  const entries = materialCatalogEntries(shelfCards());
  assert.equal(entries[0].title, "财务会计专业服务站 · 5页");
  assert.equal(entries[1].title, "财务会计专业服务站 · 6页");
  assert.equal(entries[2].title, "律师事务所形象站 · 4页");
  // 只约束分组卡：未归组的老行照旧带皮肤名（见下一条回归断言）。
  for (const entry of entries.slice(0, 3)) {
    for (const label of Object.values(MATERIAL_SKIN_LABELS)) {
      assert.ok(
        !entry.title.includes(label),
        `分组之后标题里不该再有皮肤名，实际拿到「${entry.title}」`,
      );
    }
  }
  // 换皮肤只换封面，不换标题——标题一变，同一件东西看起来又成了两件。
  const swapped = materialCatalogEntries(shelfCards(), {
    perCard: { "agency-accounting-s5": "glass" },
  });
  assert.equal(swapped[0].title, entries[0].title);
  assert.equal(swapped[0].id, "acct-s5-glass");
});

test("没有 group: 的旧行逐字不变", () => {
  const cards = shelfCards();
  const [, , , ppt, legacy] = cards;
  assert.equal(ppt.grouped, false);
  assert.deepEqual(ppt.variants, []);
  assert.equal(legacy.grouped, false);
  assert.deepEqual(legacy.variants, []);
  const entries = materialCatalogEntries(cards);
  // PPT 行没有任何 facet：连对象都不换，标题一个字不改。
  assert.equal(entries[3], PPT_ROW);
  assert.equal(entries[3].title, "季度汇报模板");
  // 未归组的老网站行仍然带「页数 · 皮肤」，与今天逐字一致。
  assert.equal(
    entries[4].title,
    `老版通用企业站 · ${MATERIAL_SHAPE_LABELS.s3} · ${MATERIAL_SKIN_LABELS.bento}`,
  );
});

test("同一个标题不会在货架上出现两次", () => {
  const titles = materialCatalogEntries(shelfCards()).map(
    (entry) => entry.title,
  );
  assert.equal(new Set(titles).size, titles.length);
});

test("页数也撞车时补子类名，仍撞就补组键", () => {
  // 两个不同 app 的同名同页数模板：光靠页数区分不开。
  const twins = ["agency-accounting-s5", "studio-accounting-s5"].map((group) =>
    templateRow({
      id: `${group}-paper`,
      title: "财务会计专业服务站",
      group,
      sub: "accounting",
      shape: "s5",
      skin: "paper",
      cover: true,
    }),
  );
  const titles = materialCatalogEntries(shelfCards(twins)).map(
    (entry) => entry.title,
  );
  assert.equal(new Set(titles).size, 2);
  for (const title of titles) {
    assert.ok(title.startsWith("财务会计专业服务站 · 5页"));
  }
  // 子类名（财务会计）已经在标题里了，补它是废话，所以直接收敛到唯一的组键。
  assert.ok(MATERIAL_INDUSTRY_SUB_LABELS.accounting === "财务会计");
  assert.deepEqual(titles, [
    "财务会计专业服务站 · 5页 · agency-accounting-s5",
    "财务会计专业服务站 · 5页 · studio-accounting-s5",
  ]);
});

test("筛选项的数字按组数，不是行数", () => {
  const cards = shelfCards();
  const subs = materialCatalogFacetOptions(
    cards,
    "sub",
    MATERIAL_INDUSTRY_SUB_LABELS,
  );
  const accounting = subs.find((option) => option.value === "accounting");
  // 财务会计有 5 行（3 + 2），但只有 2 组 —— 数字必须是 2。
  assert.equal(accounting.count, 2);
  const shapes = materialCatalogFacetOptions(
    cards,
    "shape",
    MATERIAL_SHAPE_LABELS,
    MATERIAL_SHAPE_ORDER,
  );
  assert.deepEqual(
    shapes.map((option) => [option.value, option.count]),
    [
      ["s3", 1],
      ["s4", 1],
      ["s5", 1],
      ["s6", 1],
    ],
  );
});

test("风格标签的数字是「有多少件能做成这个风格」", () => {
  const skins = materialCatalogFacetOptions(
    shelfCards(),
    "skin",
    MATERIAL_SKIN_LABELS,
    MATERIAL_SKIN_ORDER,
  );
  assert.deepEqual(
    skins.map((option) => [option.value, option.count]),
    [
      // paper 在 5 页组与 6 页组各一件；navy/glass 只在 5 页组；neon 只在 6 页组。
      ["paper", 2],
      ["bento", 1],
      ["neon", 1],
      ["sand", 1],
      ["navy", 1],
      ["glass", 1],
    ],
  );
});

test("选中风格不筛掉分组卡，只把有这张皮的组切过去", () => {
  const cards = shelfCards();
  const selection = { industry: "", sub: "", shape: "", skin: "navy" };
  const visible = cards.filter((card) =>
    materialCatalogCardMatches(card, selection),
  );
  // 三张分组卡一张都没少；未归组的行按今天的行为被筛掉（老网站行是 bento，
  // PPT 行根本没有 skin —— 这两种都与 `materialFacetRecordMatches` 今天的判断一致）。
  assert.deepEqual(
    visible.map((card) => card.key),
    [
      "group:agency-accounting-s5",
      "group:agency-accounting-s6",
      "group:agency-law-s4",
    ],
  );
  const entries = materialCatalogEntries(visible, { skin: "navy" });
  // 有 navy 的组切过去了，没有的组保持自己的组封面。
  assert.equal(entries[0].id, "acct-s5-navy");
  assert.equal(entries[1].id, "acct-s6-paper");
  assert.equal(entries[2].id, "law-s4-sand");
});

test("行业与子类照常筛掉整组", () => {
  const cards = shelfCards();
  const visible = cards.filter((card) =>
    materialCatalogCardMatches(card, {
      industry: "business",
      sub: "accounting",
      shape: "",
      skin: "",
    }),
  );
  assert.deepEqual(
    visible.map((card) => card.groupKey),
    ["agency-accounting-s5", "agency-accounting-s6"],
  );
});

test("组封面标签缺失时退回组内第一行，不整屏空掉", () => {
  const headless = ["glass", "navy"].map((skin) =>
    templateRow({
      id: `headless-${skin}`,
      title: "没写封面的模板",
      group: "agency-loan-s5",
      sub: "loan",
      shape: "s5",
      skin,
      cover: false,
    }),
  );
  const [card] = shelfCards(headless);
  assert.equal(card.cover.entry.id, "headless-glass");
  assert.equal(materialCatalogActiveSkin(card), "glass");
});
