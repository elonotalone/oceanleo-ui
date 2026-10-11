import assert from "node:assert/strict";
import test from "node:test";

import {
  draftFromApp,
  draftProblems,
  embedNote,
  liveHostedSites,
  patchFromDraft,
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
});

test("patchFromDraft 只带改过的字段", () => {
  const app = mine();
  const draft = draftFromApp(app);
  assert.deepEqual(patchFromDraft(draft, app), {});
  assert.deepEqual(patchFromDraft({ ...draft, title: "New" }, app), { title: "New" });
  assert.deepEqual(patchFromDraft({ ...draft, summary: "Next" }, app), { summary: "Next" });
  assert.deepEqual(patchFromDraft({ ...draft, description: "More" }, app), { description: "More" });
  assert.deepEqual(patchFromDraft({ ...draft, category: "design" }, app), { category: "design" });
  assert.deepEqual(patchFromDraft({ ...draft, embedMode: "link" }, app), { embed_mode: "link" });
});

test("patchFromDraft 空封面转 null", () => {
  const app = mine();
  const draft = { ...draftFromApp(app), coverUrl: "" };
  assert.deepEqual(patchFromDraft(draft, app), { cover_url: null });
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

test("draftProblems 每一条", () => {
  assert.deepEqual(draftProblems({ title: "", summary: "s", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }), ["请填写名称"]);
  assert.ok(draftProblems({ title: "x".repeat(81), summary: "s", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("名称不能超过 80 个字"));
  assert.ok(draftProblems({ title: "T", summary: "", description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("请写一句话简介"));
  assert.ok(draftProblems({ title: "T", summary: "s".repeat(201), description: "", coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("一句话简介不能超过 200 个字"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "d".repeat(4001), coverUrl: "", category: "website", embedMode: "embed", url: "" }).includes("详细介绍不能超过 4000 个字"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "http://x", category: "website", embedMode: "embed", url: "" }).includes("封面图需要是 https 开头的图片地址"));
  assert.ok(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "", category: "", embedMode: "embed", url: "" }).includes("请选择一个站点类目"));
  assert.deepEqual(draftProblems({ title: "T", summary: "s", description: "", coverUrl: "https://x", category: "website", embedMode: "embed", url: "" }), []);
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
