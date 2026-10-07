// W04：「去 LeoXX 处理」的跨站链接、作品只读预览链接、「我的库」作品列表。网络与域名一律打桩。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const domainStub = dataModule(`
  export const asked = [];
  export function currentFamilySubsiteOrigin(label) {
    asked.push(label);
    return ["slide", "3d", "design", "e-commerce"].includes(label) ? "https://" + label + ".oceanleo.test" : undefined;
  }
  export function portalHref(path) { return "https://oceanleo.test" + path; }
`);
const stateStub = dataModule(`
  export function bayHrefOnSite(site, target) {
    return "https://" + site + ".oceanleo.test/bay?bay=" + target.kind + ":" + (target.id ?? "");
  }
`);
const agentStub = dataModule(`
  export const calls = [];
  export async function listTasks(...args) {
    calls.push(args);
    return globalThis.__tasksReply ?? { ok: true, data: { items: [] } };
  }
  export async function authed() { return { ok: false, status: 401 }; }
`);

const domain = await import(domainStub);
const agent = await import(agentStub);
const links = await import(
  await compileModule("src/shell/bay/needs/need-links.ts", {
    "../../../contracts/domain-family": domainStub,
    "../shell/bay-state": stateStub,
  })
);
const library = await import(await compileModule("src/lib/bay/library.ts", { "../agent": agentStub }));

test("去处理：当前就在那个站时不给链接；异站给那个站 /bay 的深链", () => {
  const target = { kind: "demand", id: "d1" };
  assert.equal(links.handlingHref("ppt", "ppt", target), null);
  assert.equal(links.handlingHref(" PPT ", "ppt", target), null, "大小写与空白不影响判同站");
  assert.equal(links.handlingHref("oceanleo", "ppt", target), "https://ppt.oceanleo.test/bay?bay=demand:d1");
  assert.equal(links.handlingHref("design", "oceanleo", target), "https://oceanleo.oceanleo.test/bay?bay=demand:d1");
  assert.equal(links.handlingHref("ppt", "", target), null);
  assert.equal(links.handlingHref("ppt", null, target), null);
});

test("作品只读预览：站 key 先换子域名（ppt→slide、threed→3d），家族里没有那个站就不给链接", () => {
  domain.asked.length = 0;
  assert.equal(
    links.workPreviewHref({ site_key: "ppt", preview_url: "/history?task=t1&view=readonly" }),
    "https://slide.oceanleo.test/history?task=t1&view=readonly",
  );
  assert.equal(links.workPreviewHref({ site_key: "threed", preview_url: "/w/1" }), "https://3d.oceanleo.test/w/1");
  assert.equal(links.workPreviewHref({ site_key: "ecommerce", preview_url: "/w/1" }), "https://e-commerce.oceanleo.test/w/1");
  assert.deepEqual(domain.asked, ["slide", "3d", "e-commerce"], "从不拿站 key 直接拼域名");
  assert.equal(links.workPreviewHref({ site_key: "video", preview_url: "/w/1" }), null);
  assert.equal(links.workPreviewHref({ site_key: "oceanleo", preview_url: "/w/1" }), "https://oceanleo.test/w/1");
  assert.equal(links.workPreviewHref({ site_key: "ppt", preview_url: null }), null);
});

test("作品只读预览：只认站内相对路径，协议、//host、反斜杠、空白一律不认", () => {
  for (const bad of ["https://evil.test/x", "//evil.test/x", "javascript:alert(1)", "/a\\b", "/a b", " ", "", "x/y", 42]) {
    assert.equal(links.workPreviewHref({ site_key: "ppt", preview_url: bad }), null, String(bad));
  }
  assert.equal(links.safeSitePath("/ok?x=1#h"), "/ok?x=1#h");
});

test("参考链接只放行 http(s)", () => {
  assert.equal(links.safeHttpLink("https://a.test/x"), "https://a.test/x");
  assert.equal(links.safeHttpLink(" http://a.test "), "http://a.test/");
  assert.equal(links.safeHttpLink("javascript:alert(1)"), null);
  assert.equal(links.safeHttpLink("ftp://a.test"), null);
  assert.equal(links.safeHttpLink("https://"), null);
  assert.equal(links.safeHttpLink(null), null);
});

test("我的库：列自己的全部任务（含放进项目的），给出 attached_work 要的任务 id 与所在站", async () => {
  globalThis.__tasksReply = {
    ok: true,
    data: {
      items: [
        { id: "t1", title: " 路演稿 ", site_id: "PPT", status: "done", created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" },
        { id: "", title: "没有 id 的不要" },
        { id: "t2", title: "", site_id: "", status: "running", created_at: null },
      ],
    },
  };
  const works = await library.listLibraryWorks({ limit: 500 });
  assert.deepEqual(agent.calls.at(-1), [100, undefined, false, "all", "all"]);
  assert.deepEqual(works, [
    { kind: "task", id: "t1", site_key: "ppt", title: "路演稿", status: "done", created_at: "2026-10-02T00:00:00Z" },
    { kind: "task", id: "t2", site_key: "oceanleo", title: "", status: "running", created_at: null },
  ]);
  assert.deepEqual(library.libraryWorkRef(works[0]), { kind: "task", id: "t1", site_key: "ppt", title: "路演稿" });
  assert.deepEqual(library.filterLibraryWorks(works, "路演").map((w) => w.id), ["t1"]);
  assert.deepEqual(library.filterLibraryWorks(works, "  ").map((w) => w.id), ["t1", "t2"]);
  delete globalThis.__tasksReply;
});

test("我的库：读失败时抛出带中文原文的错误", async () => {
  globalThis.__tasksReply = { ok: false, status: 503, error: "" };
  await assert.rejects(() => library.listLibraryWorks(), (error) => {
    assert.equal(error.message, "没能读到你的作品，请稍后再试。");
    assert.equal(error.status, 503);
    return true;
  });
  delete globalThis.__tasksReply;
});
