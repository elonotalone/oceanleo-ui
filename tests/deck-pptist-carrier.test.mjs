/**
 * W07 判据 3/4 的判据：deck IR → PPTist JSON 载体、AIPPT 产页、正交三轴。
 *
 * 跑法（**必须原样带上 package.json `test` 脚本那串 flag**，`_COMMON.md` §7b⑫：
 * 少了 loader 整段测试会静默不注册，只是少几行绿，连红都不记）：
 *
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/deck-pptist-carrier.test.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  applyDeckPackTheme,
  deckDocumentToPptist,
  PPTIST_CARRIER_FORMAT,
  PPTIST_VIEWPORT_WIDTH,
  pptistViewportRatio,
  relayoutSlide,
} from "../src/shell/doc-editors/deck-pptist-carrier.ts";
import {
  AIPPT_CONTENT_SCHEMA,
  AIPPT_LAYOUTS,
  aipptOutlineToPptist,
  validateAipptOutline,
} from "../src/shell/doc-editors/deck-aippt-schema.ts";
import { DECK_PACKS, packById } from "../src/shell/doc-editors/deck-packs.ts";

function deckElement(overrides = {}) {
  return {
    id: "el-1",
    type: "text",
    x: 10,
    y: 20,
    width: 50,
    height: 10,
    rotation: 0,
    order: 0,
    text: "标题文字",
    ...overrides,
  };
}

function deckDoc(overrides = {}) {
  return {
    version: 2,
    title: "季度汇报",
    aspect: "16:9",
    theme: "ocean",
    masters: [],
    slides: [
      {
        id: "s1",
        title: "封面",
        body: "",
        bullets: [],
        notes: "开场白",
        layout: "title-body",
        background: "#ffffff",
        elements: [deckElement()],
      },
    ],
    ...overrides,
  };
}

// ── 坐标系（AI_PPT_SCHEMA.md 的硬约定）────────────────────────────────────

test("画布固定 1000 × 562.5；4:3 时 ratio 换成 0.75", () => {
  assert.equal(PPTIST_VIEWPORT_WIDTH, 1000);
  assert.equal(pptistViewportRatio("16:9"), 0.5625);
  assert.equal(pptistViewportRatio("4:3"), 0.75);
});

test("deck IR 的百分比换算成逻辑像素", () => {
  const out = deckDocumentToPptist(deckDoc());
  const el = out.slides[0].elements[0];
  // x=10% → 100px；y=20% → 0.2 × 562.5 = 112.5px
  assert.equal(el.left, 100);
  assert.equal(el.top, 112.5);
  assert.equal(el.width, 500);
  assert.equal(el.height, 56.25);
});

test("4:3 的纵向换算用 750 而不是 562.5", () => {
  const out = deckDocumentToPptist(deckDoc({ aspect: "4:3" }));
  assert.equal(out.slides[0].elements[0].top, 150); // 20% × 750
  assert.equal(out.viewportRatio, 0.75);
});

// ── 只读（R7：不得静默改写用户存量）──────────────────────────────────────

test("转换器只读输入：deck 文档转换前后逐字节相同", () => {
  const source = deckDoc();
  const before = JSON.stringify(source);
  deckDocumentToPptist(source, { packId: DECK_PACKS[0].id });
  assert.equal(JSON.stringify(source), before, "转换器改写了输入的 deck 文档");
});

// ── 转换失败要给原因（R7）──────────────────────────────────────────────

test("跳过的元素都要留下一条 warning，不静默丢", () => {
  const out = deckDocumentToPptist(
    deckDoc({
      slides: [
        {
          ...deckDoc().slides[0],
          elements: [
            deckElement({ id: "img-1", type: "image", src: "" }),
            deckElement({ id: "tbl-1", type: "table", rows: [] }),
            deckElement({ id: "unk-1", type: "unsupported" }),
          ],
        },
      ],
    }),
  );
  assert.equal(out.slides[0].elements.length, 0);
  assert.equal(out.warnings.length, 3);
  for (const id of ["img-1", "tbl-1", "unk-1"]) {
    assert.ok(
      out.warnings.some((w) => w.includes(id)),
      `${id} 被跳过了却没有 warning`,
    );
  }
});

test("无损转换时 warnings 是空数组（空 ≠ 没检查）", () => {
  const out = deckDocumentToPptist(deckDoc());
  assert.deepEqual(out.warnings, []);
  assert.equal(out.slides[0].elements.length, 1);
});

test("非矩形形状退化为矩形，并如实记一条原因", () => {
  const out = deckDocumentToPptist(
    deckDoc({
      slides: [
        {
          ...deckDoc().slides[0],
          elements: [deckElement({ id: "sh-1", type: "shape", shape: "ellipse" })],
        },
      ],
    }),
  );
  assert.equal(out.slides[0].elements[0].type, "shape");
  assert.ok(out.warnings.some((w) => w.includes("ellipse") && w.includes("退化")));
});

// ── 元素映射 ──────────────────────────────────────────────────────────────

test("文本转富文本时 HTML 被转义，不出注入口", () => {
  const out = deckDocumentToPptist(
    deckDoc({
      slides: [
        {
          ...deckDoc().slides[0],
          elements: [deckElement({ text: '<img src=x onerror="alert(1)">' })],
        },
      ],
    }),
  );
  const content = out.slides[0].elements[0].content;
  assert.ok(!content.includes("<img"), "原始标签没有被转义");
  assert.ok(content.includes("&lt;img"), "转义结果不对");
});

test("元素按 order 排序，PPTist 的层级就是数组顺序", () => {
  const out = deckDocumentToPptist(
    deckDoc({
      slides: [
        {
          ...deckDoc().slides[0],
          elements: [
            deckElement({ id: "back", order: 2 }),
            deckElement({ id: "front", order: 0 }),
            deckElement({ id: "mid", order: 1 }),
          ],
        },
      ],
    }),
  );
  assert.deepEqual(
    out.slides[0].elements.map((e) => e.id),
    ["front", "mid", "back"],
  );
});

test("deck 的 notes 落到 PPTist 的 remark（不是它的 notes）", () => {
  const out = deckDocumentToPptist(deckDoc());
  assert.equal(out.slides[0].remark, "开场白");
});

// ── 正交（判据 4；R9；规范 §7 判据 7）─────────────────────────────────────

test("换皮不动结构：套主题后 slides 与未套主题的 base 逐字节相同", () => {
  const base = deckDocumentToPptist(deckDoc());
  const baseSlides = JSON.stringify(base.slides);
  const a = applyDeckPackTheme(base, packById(DECK_PACKS[0].id));
  const b = applyDeckPackTheme(base, packById(DECK_PACKS[1].id));

  // ⚠️ 必须与**未套主题的 base** 比，不能拿 a 与 b 互比：
  // 两个变体都过同一个函数，错误改动会同时作用在两边而互相抵消
  // （反面验证①第一版就是这么跑出 0 红的，_COMMON.md §7b⑨ 同族）。
  assert.equal(JSON.stringify(a.slides), baseSlides, "套主题动了结构");
  assert.equal(JSON.stringify(b.slides), baseSlides, "套主题动了结构");
  assert.notEqual(
    JSON.stringify(a.theme),
    JSON.stringify(b.theme),
    "换了 pack 但主题没变 ⇒ 这条判据在空转",
  );
});

test("换结构不动皮：换版式后 theme 逐字节相同", () => {
  const themed = applyDeckPackTheme(
    deckDocumentToPptist(deckDoc()),
    packById(DECK_PACKS[0].id),
  );
  const relaid = relayoutSlide(themed, "s1", "section-header");

  assert.equal(JSON.stringify(relaid.theme), JSON.stringify(themed.theme), "换版式动了皮");
  assert.notEqual(
    relaid.slides[0].type,
    themed.slides[0].type,
    "换了版式但页面类型没变 ⇒ 这条判据在空转",
  );
});

test("pack 的调色板逐项进 themeColors，且都带 #", () => {
  const pack = packById(DECK_PACKS[0].id);
  const out = applyDeckPackTheme(deckDocumentToPptist(deckDoc()), pack);
  assert.equal(out.theme.themeColors.length, 6);
  for (const color of out.theme.themeColors) {
    assert.match(color, /^#[0-9A-Fa-f]{6}$/, `themeColors 里出现了不带 # 的值：${color}`);
  }
  assert.equal(out.theme.themeColors[0], `#${pack.palette.accent1}`);
});

// ── AIPPT（判据 4）────────────────────────────────────────────────────────

test("交给模型的 schema 禁止额外字段，且 kind 是闭集", () => {
  assert.equal(AIPPT_CONTENT_SCHEMA.additionalProperties, false);
  const item = AIPPT_CONTENT_SCHEMA.properties.slides.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(item.properties.kind.enum, [
    "cover",
    "contents",
    "transition",
    "content",
    "end",
  ]);
});

test("schema 里没有任何几何或颜色字段 —— 版式与主题不归模型", () => {
  const props = AIPPT_CONTENT_SCHEMA.properties.slides.items.properties;
  for (const banned of ["left", "top", "width", "height", "color", "fontSize", "rotate"]) {
    assert.ok(!(banned in props), `内容 schema 里出现了 ${banned}，正交被打破`);
  }
  // 正例：确认这份 schema 真有字段可查（否则上面的「都不存在」是空断言）。
  assert.ok("title" in props && "bullets" in props);
});

test("大纲校验：不合法要说清哪里不合法", () => {
  assert.equal(validateAipptOutline(null).ok, false);
  assert.match(validateAipptOutline({}).reason, /title/);
  assert.match(validateAipptOutline({ title: "x" }).reason, /slides/);
  assert.match(
    validateAipptOutline({ title: "x", slides: [{ kind: "bogus", title: "t" }] }).reason,
    /kind/,
  );
  assert.match(
    validateAipptOutline({ title: "x", slides: [{ kind: "cover" }] }).reason,
    /title/,
  );
  assert.equal(
    validateAipptOutline({ title: "x", slides: [{ kind: "cover", title: "t" }] }).ok,
    true,
  );
});

test("模型只给内容，程序摆出坐标", () => {
  const out = aipptOutlineToPptist({
    title: "年度总结",
    slides: [
      { kind: "cover", title: "2026 年度总结", subtitle: "增长与效率", notes: "开场 30 秒" },
      { kind: "content", title: "三条主线", bullets: ["收入", "成本", "效率"] },
      { kind: "end", title: "谢谢" },
    ],
  });

  assert.equal(out.format, PPTIST_CARRIER_FORMAT);
  assert.equal(out.slides.length, 3);
  assert.equal(out.slides[0].type, "cover");
  assert.equal(out.slides[0].elements[0].left, AIPPT_LAYOUTS.cover.title.left);
  assert.equal(out.slides[0].elements[0].top, AIPPT_LAYOUTS.cover.title.top);
  assert.equal(out.slides[0].remark, "开场 30 秒");
  // 正文页：标题 + 要点两个元素
  assert.equal(out.slides[1].elements.length, 2);
  assert.ok(out.slides[1].elements[1].content.includes("收入"));
});

test("同一份大纲配不同 pack，slides 逐字节相同 —— 正交的可演示形态", () => {
  const outline = {
    title: "年度总结",
    slides: [
      { kind: "cover", title: "2026", subtitle: "增长" },
      { kind: "content", title: "主线", bullets: ["A", "B"] },
    ],
  };
  const bare = aipptOutlineToPptist(outline);
  const a = aipptOutlineToPptist(outline, { packId: DECK_PACKS[0].id });
  const b = aipptOutlineToPptist(outline, { packId: DECK_PACKS[3].id });

  // 同上：与未套主题的 bare 比，不拿 a、b 互比。
  assert.equal(JSON.stringify(a.slides), JSON.stringify(bare.slides));
  assert.equal(JSON.stringify(b.slides), JSON.stringify(bare.slides));
  assert.notEqual(JSON.stringify(a.theme), JSON.stringify(b.theme));
});

test("AIPPT 产出的元素不写死颜色，否则主题顶不掉它", () => {
  const out = aipptOutlineToPptist(
    { title: "t", slides: [{ kind: "cover", title: "标题" }] },
    { packId: DECK_PACKS[0].id },
  );
  // 元素级 defaultColor 必须是出厂值，主题色只能出现在 theme 上。
  assert.equal(out.slides[0].elements[0].defaultColor, "#333333");
  assert.notEqual(out.theme.fontColor, "#333333");
});

// ── 许可红线（§10 第 1 条）────────────────────────────────────────────────

test("两份载体文件里没有从 PPTist 搬来的实现代码", () => {
  // AGPL 红线的一道本地闸：搬运通常会连带把它的 import 别名 `@/` 与
  // Vue/Pinia 的痕迹带进来。这里判的是「本仓文件里不该出现的东西」。
  for (const path of [
    "src/shell/doc-editors/deck-pptist-carrier.ts",
    "src/shell/doc-editors/deck-aippt-schema.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.ok(!/from ['"]@\/(types|store|hooks|configs)\//.test(source), `${path} 出现 PPTist 的 @/ import`);
    assert.ok(!/defineStore|storeToRefs|from ['"]vue['"]/.test(source), `${path} 出现 Vue/Pinia 痕迹`);
    // 正例：确认确实读到了文件内容（§6：零命中先验工具）。
    assert.ok(source.includes("PptistDocument"), `${path} 没读到预期内容，上面的零命中不算数`);
  }
});
