import assert from "node:assert/strict";
import test from "node:test";

import {
  draftFromApp,
  draftProblems,
  embedNote,
  liveHostedSites,
  mergeCreatedDraft,
  parseAppPriceFen,
  patchFromDraft,
  pricingFromDraft,
  statusLabel,
} from "../src/shell/bay/apps/app-editor-model.ts";

function mine(extra = {}) {
  return {
    id: "a1",
    owner_id: "u1",
    title: "Demo",
    summary: "A short line",
    description: "Longer text",
    cover_url: "https://cdn.example/cover.png",
    category: "website",
    posted_site: "oceanleo",
    source_kind: "external",
    hosted_site_id: null,
    url: "https://example.com/app",
    url_host: "example.com",
    embed_mode: "embed",
    embed_ok: true,
    price_model: "free",
    price_fen: 0,
    trial_days: 0,
    status: "draft",
    view_count: 0,
    open_count: 0,
    published_at: null,
    updated_at: null,
    verified_at: null,
    verified: false,
    moderation_hidden: false,
    created_at: null,
    ...extra,
  };
}

test("draftFromApp 把空封面和空类目收成空串", () => {
  const draft = draftFromApp(mine({ cover_url: null, category: null, embed_mode: "link" }));
  assert.equal(draft.coverUrl, "");
  assert.equal(draft.category, "");
  assert.equal(draft.embedMode, "link");
  assert.equal(draft.url, "https://example.com/app");
  assert.equal(draft.priceModel, "free");
  assert.equal(draft.price, "");
  assert.equal(draft.customTerms, "");
  assert.equal(draft.audience.mode, "public");
  assert.equal(draft.deadlineAt, "");
});

test("draftFromApp 读回自定义条款、找谁、截止日期", () => {
  const draft = draftFromApp(
    mine({
      custom_terms: "不得转售原文件",
      audience_mode: "group",
      audience_handle: null,
      audience_member_ids: ["u2", "u3"],
      deadline_at: "2026-12-01T23:59:59.000Z",
    }),
  );
  assert.equal(draft.customTerms, "不得转售原文件");
  assert.equal(draft.audience.mode, "group");
  assert.deepEqual(
    draft.audience.members.map((row) => row.userId),
    ["u2", "u3"],
  );
  // 截止时间存绝对时刻（ISO）；纯日期的老值才按当地当天结束。
  assert.equal(draft.deadlineAt, "2026-12-01T23:59:59.000Z");
});

test("patchFromDraft 只带改过的字段", () => {
  const app = mine();
  const draft = draftFromApp(app);
  assert.deepEqual(patchFromDraft(draft, app), {});
  assert.deepEqual(patchFromDraft({ ...draft, title: "New" }, app), { title: "New" });
  assert.deepEqual(patchFromDraft({ ...draft, summary: "Next" }, app), { summary: "Next" });
  assert.deepEqual(patchFromDraft({ ...draft, description: "More" }, app), { description: "More" });
  assert.deepEqual(patchFromDraft({ ...draft, category: "design" }, app), { category: "design" });
  assert.deepEqual(patchFromDraft({ ...draft, embedMode: "link" }, app), {});
});

test("patchFromDraft 空封面转 null", () => {
  const app = mine();
  const draft = { ...draftFromApp(app), coverUrl: "", galleryUrls: [] };
  assert.deepEqual(patchFromDraft(draft, app), { cover_url: null, gallery_urls: [] });
});

test("patchFromDraft hosted 不带 url", () => {
  const app = mine({ source_kind: "hosted", hosted_site_id: "s1" });
  const draft = { ...draftFromApp(app), url: "https://other.example/" };
  assert.deepEqual(patchFromDraft(draft, app), {});
});

test("patchFromDraft external 只在改过时带 url", () => {
  const app = mine();
  const same = draftFromApp(app);
  assert.equal("url" in patchFromDraft(same, app), false);
  assert.deepEqual(patchFromDraft({ ...same, url: "https://other.example/" }, app), { url: "https://other.example/" });
});

test("patchFromDraft 写入自定义条款、找谁、截止日期", () => {
  const app = mine();
  const draft = draftFromApp(app);
  assert.deepEqual(patchFromDraft({ ...draft, customTerms: "不得转售原文件" }, app), { custom_terms: "不得转售原文件" });
  assert.deepEqual(patchFromDraft({ ...draft, audience: { mode: "invited", handle: "alice", members: [] } }, app), {
    audience_mode: "invited",
    audience_handle: "alice",
  });
  assert.deepEqual(
    patchFromDraft({ ...draft, audience: { mode: "group", handle: "", members: [{ userId: "u2", name: "Bob" }] } }, app),
    { audience_mode: "group", audience_member_ids: ["u2"] },
  );
  const withDeadline = patchFromDraft({ ...draft, deadlineAt: "2026-12-01" }, app);
  assert.equal(withDeadline.deadline_at, new Date("2026-12-01T23:59:59").toISOString());
  const invited = mine({ audience_mode: "invited", audience_handle: "alice" });
  const invitedDraft = draftFromApp(invited);
  assert.deepEqual(patchFromDraft({ ...invitedDraft, audience: { mode: "public", handle: "alice", members: [] } }, invited), {
    audience_mode: "public",
    audience_handle: null,
  });
});

test("draftProblems 每一条", () => {
  assert.deepEqual(draftProblems({ title: "", summary: "s", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }), ["请填写标题", "至少一张预览图"]);
  assert.ok(draftProblems({ title: "x".repeat(81), summary: "s", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("标题不能超过 80 个字"));
  assert.equal(draftProblems({ title: "T", summary: "", description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "" }).includes("请写一句话简介"), false);
  assert.ok(draftProblems({ title: "T", summary: "", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("至少一张预览图"));
  assert.ok(draftProblems({ title: "T", summary: "s".repeat(201), description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "" }).includes("一句话简介不能超过 200 个字"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "d".repeat(4001), coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("详细介绍不能超过 4000 个字"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "http://x", category: "website", embedMode: "embed", url: "" }).includes("封面图需要是 https 开头的图片地址"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "", category: "", embedMode: "embed", url: "" }).includes("请选择一个站点类目"));
  assert.deepEqual(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "" }), []);
  assert.deepEqual(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "", endpointId: "" }), []);
  const ok = { title: "T", summary: "s", description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "" };
  assert.ok(draftProblems({ ...ok, audience: { mode: "invited", handle: "", members: [] } }).includes("请选择要给谁看"));
  assert.ok(draftProblems({ ...ok, audience: { mode: "group", handle: "", members: [] } }).includes("请选择要给谁看"));
  assert.deepEqual(draftProblems({ ...ok, audience: { mode: "invited", handle: "alice", members: [] } }), []);
  assert.deepEqual(draftProblems({ ...ok, audience: { mode: "group", handle: "", members: [{ userId: "u2", name: "Bob" }] } }), []);
  assert.deepEqual(draftProblems({ ...ok, deadlineAt: "2026-12-01" }), []);
  assert.equal(draftProblems({ ...ok, priceModel: "one_time", price: "" }).includes("价格不是合法金额"), false);
  assert.ok(draftProblems({ ...ok, priceModel: "subscription", price: "abc" }).includes("价格不是合法金额"));
  assert.deepEqual(draftProblems({ ...ok, priceModel: "one_time", price: "9" }), []);
  assert.deepEqual(draftProblems({ ...ok, priceModel: "free", price: "" }), []);
});

test("mergeCreatedDraft 保留本页已填、用网关补来源", () => {
  const row = mine({ title: "From site", summary: "", url: "https://created.example/" });
  const current = {
    title: "Local title",
    summary: "Local summary",
    description: "",
    coverUrl: "https://cdn.example/local.png",
    galleryUrls: ["https://cdn.example/local.png"],
    category: "",
    embedMode: "embed",
    url: "",
    endpointId: "",
    priceModel: "one_time",
    price: "9",
  };
  const merged = mergeCreatedDraft(row, current);
  assert.equal(merged.title, "Local title");
  assert.equal(merged.summary, "Local summary");
  assert.equal(merged.coverUrl, "https://cdn.example/local.png");
  assert.equal(merged.url, "https://created.example/");
  assert.equal(merged.priceModel, "one_time");
  assert.equal(merged.price, "9");
});

test("draftFromApp / pricingFromDraft 读回并只在改过时报计价", () => {
  const paid = mine({ price_model: "subscription", price_fen: 1200, trial_days: 7 });
  const draft = draftFromApp(paid);
  assert.equal(draft.priceModel, "subscription");
  assert.equal(draft.price, "12");
  assert.equal(pricingFromDraft(draft, paid), null);
  assert.deepEqual(pricingFromDraft({ ...draft, priceModel: "free", price: "" }, paid), {
    price_model: "free",
    price_fen: 0,
    trial_days: 0,
  });
  assert.deepEqual(pricingFromDraft({ ...draft, price: "20" }, paid), {
    price_model: "subscription",
    price_fen: 2000,
    trial_days: 7,
  });
  assert.equal(pricingFromDraft({ ...draft, priceModel: "one_time", price: "" }, paid), null);
  assert.equal(parseAppPriceFen(""), 0);
  assert.equal(parseAppPriceFen("9.9"), 990);
  assert.equal(parseAppPriceFen("-1"), null);
});

test("statusLabel 四种", () => {
  assert.equal(statusLabel({ status: "draft", moderation_hidden: true }), "已被平台隐藏");
  assert.equal(statusLabel({ status: "published", moderation_hidden: true }), "已被平台隐藏");
  assert.equal(statusLabel({ status: "draft", moderation_hidden: false }), "草稿");
  assert.equal(statusLabel({ status: "published", moderation_hidden: false }), "已上架");
  assert.equal(statusLabel({ status: "offline", moderation_hidden: false }), "已下架");
});

test("embedNote 三种", () => {
  assert.equal(embedNote({ embed_ok: true }), "这个网站可以在页内窗口里显示");
  assert.equal(embedNote({ embed_ok: false }), '这个网站不允许被嵌入，访客会看到"打开网站"按钮');
  assert.equal(embedNote({ embed_ok: null }), "还没检测");
});

test("liveHostedSites 只留 live", () => {
  const rows = [
    { id: "1", slug: "a", url: "https://a", title: "A", status: "live", file_count: 1, bytes: 1, published_at: null, updated_at: "" },
    { id: "2", slug: "b", url: "https://b", title: "B", status: "offline", file_count: 1, bytes: 1, published_at: null, updated_at: "" },
  ];
  assert.deepEqual(liveHostedSites(rows).map((row) => row.id), ["1"]);
});
