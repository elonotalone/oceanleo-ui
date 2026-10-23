// LeoBay 主页版面文档：纯函数。不碰 React / DOM / 网络。
import assert from "node:assert/strict";
import test from "node:test";

import {
  BAY_PAGE_MAX_BLOCKS,
  BAY_PAGE_TEMPLATES,
  BAY_PAGE_TONES,
  applyPageTemplate,
  accentInk,
  defaultPageDoc,
  insertBlock,
  moveBlock,
  newBlock,
  normalizePageDoc,
  pageCopyFromDoc,
  pageThemeVars,
  syncHeroName,
  patchBlock,
  patchTheme,
  removeBlock,
  safePageUrl,
  samePageDoc,
} from "../src/lib/bay/page-doc.ts";
import { LOCALES } from "../src/i18n/config.ts";
import { UI_FOLLOWUP_PROFILE_MESSAGES } from "../src/i18n/ui/messages/ui-followup-profile-copy.ts";

function doc(blocks, theme = {}) {
  return {
    version: 1,
    theme: {
      accent: "#0ea5e9",
      tone: "light",
      font: "sans",
      cover_url: "",
      cover_style: "gradient",
      ...theme,
    },
    blocks,
  };
}

test("normalizePageDoc：丢掉不认识的块类型", () => {
  const out = normalizePageDoc(
    doc([
      { id: "hero", type: "hero", title: "你好" },
      { id: "x", type: "html" },
      { id: "y", type: "script" },
      { id: "text", type: "text", body: "一段" },
    ]),
  );
  assert.equal(out.blocks.length, 2);
  assert.deepEqual(
    out.blocks.map((block) => block.type),
    ["hero", "text"],
  );
});

test("normalizePageDoc：丢掉 javascript: 与 http:// 地址", () => {
  const out = normalizePageDoc(
    doc(
      [
        {
          id: "gallery",
          type: "gallery",
          images: [
            { url: "javascript:alert(1)", caption: "x" },
            { url: "http://evil.example/a.png", caption: "y" },
            { url: "https://cdn.example/ok.png", caption: "z" },
          ],
        },
        {
          id: "links",
          type: "links",
          links: [
            { label: "坏", url: "javascript:void(0)" },
            { label: "好", url: "https://oceanleo.com/x" },
          ],
        },
      ],
      { cover_url: "http://cdn.example/cover.png", cover_style: "image" },
    ),
  );
  assert.deepEqual(
    out.blocks.find((block) => block.id === "gallery").images.map((image) => image.url),
    ["https://cdn.example/ok.png"],
  );
  assert.deepEqual(
    out.blocks.find((block) => block.id === "links").links.map((link) => link.url),
    ["https://oceanleo.com/x"],
  );
  assert.equal(out.theme.cover_url, "");
  assert.equal(out.theme.cover_style, "gradient");
});

test("normalizePageDoc：超过 30 个的块丢掉后面的", () => {
  const blocks = Array.from({ length: 40 }, (_, index) => ({ id: `b${index}`, type: "text", title: String(index) }));
  const out = normalizePageDoc(doc(blocks));
  assert.equal(out.blocks.length, BAY_PAGE_MAX_BLOCKS);
  assert.equal(out.blocks[0].id, "b0");
  assert.equal(out.blocks.at(-1).id, "b29");
});

test("normalizePageDoc：重复的 id 给后面的块换新 id", () => {
  const out = normalizePageDoc(
    doc([
      { id: "same", type: "hero", title: "一" },
      { id: "same", type: "text", title: "二" },
    ]),
  );
  assert.equal(out.blocks.length, 2);
  assert.equal(out.blocks[0].id, "same");
  assert.notEqual(out.blocks[1].id, "same");
  assert.match(out.blocks[1].id, /^[A-Za-z0-9_-]{1,40}$/);
});

test("normalizePageDoc：不是 version 1 或没有 blocks 就返回 null", () => {
  assert.equal(normalizePageDoc(null), null);
  assert.equal(normalizePageDoc({ version: 2, theme: {}, blocks: [] }), null);
  assert.equal(normalizePageDoc({ version: 1, theme: {} }), null);
});

test("defaultPageDoc：有名字就用名字", () => {
  const named = defaultPageDoc({ display_name: "林七", headline: "做海报" });
  assert.equal(named.blocks[0].type, "hero");
  assert.equal(named.blocks[0].title, "林七");
  assert.equal(named.blocks[0].subtitle, "做海报");
  const unnamed = defaultPageDoc({ display_name: "  " });
  assert.equal(unnamed.blocks[0].title, "你好，我是……");
});

test("moveBlock：上移下移；到头不动", () => {
  const start = doc([
    { id: "a", type: "text", title: "A" },
    { id: "b", type: "text", title: "B" },
    { id: "c", type: "text", title: "C" },
  ]);
  assert.deepEqual(
    moveBlock(start, "b", -1).blocks.map((block) => block.id),
    ["b", "a", "c"],
  );
  assert.deepEqual(
    moveBlock(start, "b", 1).blocks.map((block) => block.id),
    ["a", "c", "b"],
  );
  assert.equal(moveBlock(start, "a", -1), start);
  assert.equal(moveBlock(start, "c", 1), start);
});

test("removeBlock：删掉指定块；没有这个 id 就原样返回", () => {
  const start = doc([
    { id: "a", type: "text" },
    { id: "b", type: "text" },
  ]);
  assert.deepEqual(
    removeBlock(start, "a").blocks.map((block) => block.id),
    ["b"],
  );
  assert.equal(removeBlock(start, "nope"), start);
});

test("patchBlock：改内容但 id 和 type 不许改", () => {
  const start = doc([{ id: "a", type: "text", title: "旧", body: "x" }]);
  const next = patchBlock(start, "a", { title: "新", type: "hero", id: "hacked", body: "y" });
  assert.equal(next.blocks[0].title, "新");
  assert.equal(next.blocks[0].body, "y");
  assert.equal(next.blocks[0].id, "a");
  assert.equal(next.blocks[0].type, "text");
});

test("insertBlock：插到指定块后面；满 30 不加", () => {
  const start = doc([{ id: "a", type: "text" }]);
  const inserted = insertBlock(start, { id: "b", type: "quote", body: "一句话" }, "a");
  assert.deepEqual(
    inserted.blocks.map((block) => block.id),
    ["a", "b"],
  );
  const full = doc(Array.from({ length: 30 }, (_, index) => ({ id: `b${index}`, type: "text" })));
  assert.equal(insertBlock(full, newBlock("text")), full);
});

test("patchTheme：只改给的字段", () => {
  const start = defaultPageDoc({ display_name: "林七" });
  const next = patchTheme(start, { tone: "ocean", accent: "#111111" });
  assert.equal(next.theme.tone, "ocean");
  assert.equal(next.theme.accent, "#111111");
  assert.equal(next.theme.font, "sans");
  assert.equal(next.blocks, start.blocks);
});

test("accentInk：深色主色给白字、浅色给黑字", () => {
  assert.equal(accentInk("#111111"), "#ffffff");
  assert.equal(accentInk("#0ea5e9"), "#ffffff");
  assert.equal(accentInk("#eab308"), "#111113");
  assert.equal(accentInk("#ffffff"), "#111113");
});

test("safePageUrl：只放行 https，空串与超长丢掉", () => {
  assert.equal(safePageUrl("https://cdn.example/a.png"), "https://cdn.example/a.png");
  assert.equal(safePageUrl("HTTP://cdn.example/a.png"), "");
  assert.equal(safePageUrl("javascript:alert(1)"), "");
  assert.equal(safePageUrl("  "), "");
  assert.equal(safePageUrl("https://" + "a".repeat(1024)), "");
  assert.equal(safePageUrl(12), "");
});

test("pageThemeVars：六种底色都给齐 9 个变量", () => {
  const keys = ["--bp-bg", "--bp-surface", "--bp-fg", "--bp-muted", "--bp-border", "--bp-accent", "--bp-accent-ink", "--bp-accent-soft", "--bp-font"];
  for (const tone of BAY_PAGE_TONES) {
    const vars = pageThemeVars({ accent: "#0ea5e9", tone, font: "sans", cover_url: "", cover_style: "none" });
    assert.deepEqual(Object.keys(vars).sort(), [...keys].sort(), tone);
    for (const key of keys) assert.ok(vars[key], `${tone} ${key}`);
  }
});

test("defaultPageDoc：有简介就加一段文字；没有就不加", () => {
  const withBio = defaultPageDoc({ display_name: "林七", bio: "只做品牌" });
  assert.ok(withBio.blocks.some((block) => block.type === "text" && block.body === "只做品牌"));
  const noBio = defaultPageDoc({ display_name: "林七" });
  assert.equal(
    noBio.blocks.some((block) => block.type === "text"),
    false,
  );
});

test("normalizePageDoc：丢掉不认识的顶层键和非法主色", () => {
  const out = normalizePageDoc({
    version: 1,
    extra: true,
    theme: { accent: "red", tone: "ocean", font: "mono", cover_url: "https://cdn.example/c.png", cover_style: "image", splash: 1 },
    blocks: [{ id: "quote-1", type: "quote", body: "一句话", by: "客人" }],
  });
  assert.equal(out.theme.tone, "ocean");
  assert.equal(out.theme.font, "mono");
  assert.equal(out.theme.cover_style, "image");
  assert.equal(out.theme.cover_url, "https://cdn.example/c.png");
  assert.match(out.theme.accent, /^#[0-9a-fA-F]{6}$/);
  assert.notEqual(out.theme.accent, "red");
  assert.equal("extra" in out, false);
  assert.equal("splash" in out.theme, false);
  assert.equal(out.blocks[0].type, "quote");
  assert.equal(out.blocks[0].body, "一句话");
});

test("pageCopyFromDoc：开场副标题是一句话介绍，第一段文字是简介", () => {
  const out = pageCopyFromDoc(
    defaultPageDoc({ display_name: "Leo", headline: "十年品牌", bio: "只做品牌" }),
  );
  assert.equal(out.headline, "十年品牌");
  assert.equal(out.bio, "只做品牌");
});

test("syncHeroName：大标题还是旧名字时跟着改，写成别的句子就不动", () => {
  const start = defaultPageDoc({ display_name: "Leo", headline: "十年品牌" });
  const renamed = syncHeroName(start, "Leo", "Leo Chen");
  assert.equal(renamed.blocks[0].title, "Leo Chen");
  assert.equal(renamed.blocks[0].subtitle, "十年品牌");
  const custom = patchBlock(start, start.blocks[0].id, { title: "你好，我是设计师" });
  assert.equal(syncHeroName(custom, "Leo", "Leo Chen").blocks[0].title, "你好，我是设计师");
  assert.equal(syncHeroName(start, "Leo", "Leo"), start);
});

test("page templates preserve existing section identities, copy, uploaded images and version-1 persistence", () => {
  const original = doc([
    { id: "custom-links", type: "links", title: "My links", links: [{ label: "Work", url: "https://example.com/work" }] },
    { id: "custom-gallery", type: "gallery", title: "Real photos", images: [{ url: "https://cdn.example/real.png", caption: "Mine" }] },
    { id: "custom-hero", type: "hero", title: "A custom introduction", subtitle: "A real headline" },
    { id: "custom-about", type: "text", title: "Story", body: "Written by the owner" },
    { id: "custom-quote", type: "quote", body: "A second voice", by: "Me" },
  ], { cover_url: "https://cdn.example/cover.png", cover_style: "image" });
  for (const template of BAY_PAGE_TEMPLATES) {
    const next = applyPageTemplate(original, template.id);
    assert.equal(next.version, 1);
    for (const block of original.blocks) assert.deepEqual(next.blocks.find((item) => item.id === block.id), block);
    assert.equal(next.theme.cover_url, original.theme.cover_url);
    assert.equal(next.theme.cover_style, template.id === "minimal" ? "none" : "image");
    assert.equal(next.blocks.at(-1).type, "contact");
    assert.deepEqual(normalizePageDoc(JSON.parse(JSON.stringify(next))), next);
  }
  assert.equal(original.blocks.length, 5);
  assert.equal(original.theme.tone, "light");
});

test("page templates never exceed 30 sections or replace a full page's content", () => {
  for (const count of [27, 28, 29, 30]) {
    const original = doc(Array.from({ length: count }, (_, index) => ({ id: `text-${index}`, type: "text", title: `Section ${index}`, body: `Body ${index}` })));
    for (const template of BAY_PAGE_TEMPLATES) {
      const next = applyPageTemplate(original, template.id);
      assert.ok(next.blocks.length <= BAY_PAGE_MAX_BLOCKS);
      for (const block of original.blocks) assert.deepEqual(next.blocks.find((item) => item.id === block.id), block);
      assert.equal(new Set(next.blocks.map((block) => block.id)).size, next.blocks.length);
    }
  }
});

test("returning to the original section order or theme is clean again", () => {
  const original = defaultPageDoc({ display_name: "Leo", bio: "A true story" });
  const id = original.blocks[0].id;
  const moved = moveBlock(original, id, 1);
  assert.equal(samePageDoc(original, moved), false);
  assert.equal(samePageDoc(original, moveBlock(moved, id, -1)), true);
  const colored = patchTheme(original, { accent: "#ef4444" });
  assert.equal(samePageDoc(original, patchTheme(colored, { accent: original.theme.accent })), true);
});

test("all profile builder copy is registered as complete dictionaries for all 17 locales", () => {
  const keys = Object.keys(UI_FOLLOWUP_PROFILE_MESSAGES.zh);
  assert.equal(keys.length, 28);
  for (const locale of LOCALES) {
    const messages = UI_FOLLOWUP_PROFILE_MESSAGES[locale];
    assert.deepEqual(Object.keys(messages), keys);
    for (const key of keys) assert.ok(typeof messages[key] === "string" && messages[key].trim(), `${locale}: ${key}`);
  }
});
