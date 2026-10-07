// W07（oceanleo-bay）：「我的订单」的分组、买卖身份切换、搜索、排序（纯函数），以及订单页「去 <产品名> 打开」按钮。
// 网络整个是桩；域名家族是桩（可以让它拿不到域名）。覆盖：
// - 作品链接对 ppt、threed 拼出正确子域名，按钮字里的产品名来自 baySiteName；
// - 拿不到域名、站 key 不被 baySiteName 认识（哪怕域名家族肯给一个 origin）、路径不安全：都不给链接；
// - 买家与卖家按每单里的身份分开；四组的条数与默认打开哪一组；搜索只认标题与对方；最近有动静的在前。
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const httpStub = dataModule(`
  export class BayApiError extends Error {
    constructor(message, status, code = null) { super(message); this.status = status; this.code = code; }
  }
  export const bayGet = async () => ({});
  export const bayPost = async () => ({});
  export const bayPatch = async () => ({});
  export const bayDelete = async () => ({});
`);
const familyStub = dataModule(`
  // 域名家族肯给任何标签一个 origin（真实现也是这样）：认不认站 key 不是它的事。
  export function currentFamilySubsiteOrigin(label) {
    if ((globalThis.__w07ModelMissing ?? []).includes(label)) return undefined;
    return "https://" + label + ".oceanleo.com";
  }
`);
const links = await import(
  await compileModule("src/shell/bay/orders/order-links.ts", {
    "../../../contracts/domain-family": familyStub,
    "../../../lib/bay/http": httpStub,
  })
);
const model = await import(
  await compileModule("src/shell/bay/orders/my-orders-model.ts", { "../../../lib/bay/http": httpStub })
);

const tt = (zh, vars) => (vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh);

const CLOSED = { enabled: false, buyer_ready: false };
const READY = { enabled: true, buyer_ready: true };

function order(extra = {}) {
  return {
    id: "k1",
    buyer_user_id: "buyer-1",
    seller_user_id: "seller-1",
    title: "一套品牌 Logo",
    engagement_kind: "fixed",
    total_fen: 30000,
    currency: "USD",
    status: "active",
    payment_state: "disabled",
    my_role: "buyer",
    seller: { user_id: "seller-1", display_name: "Mia", handle: "mia" },
    buyer: { user_id: "buyer-1", display_name: "Leo", handle: "leo" },
    milestones: [],
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...extra,
  };
}

test("作品链接按钮：ppt 去 LeoSlides、threed 去 Leo3D，地址拼对子域名", () => {
  globalThis.__w07ModelMissing = [];
  const ppt = links.bayOrderWorkLink({ site_key: "ppt", open_path: "/editor?task=w1" }, tt);
  assert.deepEqual(ppt, { href: "https://slide.oceanleo.com/editor?task=w1", siteName: "LeoSlides", label: "去 LeoSlides 打开" });
  const threed = links.bayOrderWorkLink({ site_key: "threed", open_path: "/studio/w2" }, tt);
  assert.deepEqual(threed, { href: "https://3d.oceanleo.com/studio/w2", siteName: "Leo3D", label: "去 Leo3D 打开" });
  const ecommerce = links.bayOrderWorkLink({ site_key: "ecommerce", open_path: "/w3" }, tt);
  assert.equal(ecommerce.href, "https://e-commerce.oceanleo.com/w3", "站 key 与子域名不同的第三处");
  assert.equal(ecommerce.label, "去 LeoStudio 打开");
});

test("作品链接按钮：aitools 的名字按界面语言显示（不是品牌名）", () => {
  globalThis.__w07ModelMissing = [];
  const translate = (zh, vars) => {
    const table = { "AI 工具导航": "AI Tools Directory", "去 {site} 打开": "Open in {site}" };
    return tt(table[zh] ?? zh, vars);
  };
  const link = links.bayOrderWorkLink({ site_key: "aitools", open_path: "/w" }, translate);
  assert.equal(link.siteName, "AI Tools Directory");
  assert.equal(link.label, "Open in AI Tools Directory");
});

test("作品链接按钮：拿不到域名、站 key 不认识、路径不安全：都不给链接", () => {
  globalThis.__w07ModelMissing = ["slide"];
  assert.equal(links.bayOrderWorkLink({ site_key: "ppt", open_path: "/editor?task=w1" }, tt), null, "拿不到域名");
  assert.equal(links.bayOrderWorkHref({ site_key: "ppt", open_path: "/editor?task=w1" }), null);
  globalThis.__w07ModelMissing = [];
  // 域名家族对 newsite 肯给 origin，但 baySiteName 不认识它：不给链接，也不自己造产品名。
  assert.equal(links.bayOrderWorkHref({ site_key: "newsite", open_path: "/w" }), null, "站 key 不认识");
  assert.equal(links.bayOrderWorkLink({ site_key: "newsite", open_path: "/w" }, tt), null);
  assert.equal(links.bayOrderWorkLink({ site_key: "oceanleo", open_path: "/w" }, tt), null, "门户不是子站");
  assert.equal(links.bayOrderWorkLink({ site_key: "ppt", open_path: "//evil.example.com/w" }, tt), null);
  assert.equal(links.bayOrderWorkLink({ site_key: "ppt", open_path: "https://evil.example.com/w" }, tt), null);
  assert.equal(links.bayOrderWorkLink(null, tt), null);
  assert.equal(links.bayOrderWorkLink(undefined, tt), null);
});

test("我的订单：同一个人按每单里的身份分成买家和卖家，不按账号分", () => {
  const items = [
    order({ id: "a", my_role: "buyer" }),
    order({ id: "b", my_role: "seller" }),
    order({ id: "c", my_role: "buyer" }),
    order({ id: "d", my_role: null }),
  ];
  assert.deepEqual(model.ordersForRole(items, "buyer").map((item) => item.id), ["a", "c"]);
  assert.deepEqual(model.ordersForRole(items, "seller").map((item) => item.id), ["b"]);
  assert.equal(model.defaultOrderRole(items), "buyer");
  assert.equal(model.defaultOrderRole([order({ my_role: "seller" })]), "seller", "只卖过：默认看卖家");
  assert.equal(model.defaultOrderRole([]), "buyer");
});

test("我的订单：四组的条数与默认打开哪一组", () => {
  assert.deepEqual(model.MY_ORDER_GROUPS, ["active", "todo", "done", "cancelled"]);
  const items = [
    order({ id: "1", status: "delivered" }), // 买家：待验收 → 待我处理
    order({ id: "2", status: "active" }), // 买家：等对方交付 → 进行中
    order({ id: "3", status: "completed" }),
    order({ id: "4", status: "completed" }),
    order({ id: "5", status: "cancelled" }),
  ];
  assert.deepEqual(model.countOrderGroups(items, CLOSED), { active: 1, todo: 1, done: 2, cancelled: 1 });
  assert.equal(model.defaultOrderGroup({ active: 1, todo: 1, done: 2, cancelled: 1 }), "todo");
  assert.equal(model.defaultOrderGroup({ active: 1, todo: 0, done: 2, cancelled: 1 }), "active");
  assert.equal(model.defaultOrderGroup({ active: 0, todo: 0, done: 2, cancelled: 1 }), "done");
  assert.equal(model.defaultOrderGroup({ active: 0, todo: 0, done: 0, cancelled: 1 }), "cancelled");
  assert.equal(model.defaultOrderGroup({ active: 0, todo: 0, done: 0, cancelled: 0 }), "active", "一单都没有：停在进行中，显示空状态");
});

test("我的订单：付款没就绪时不把「去付款」算成待我处理；就绪才算", () => {
  const unpaid = order({ id: "p", status: "active", payment_state: "unfunded" });
  assert.equal(model.countOrderGroups([unpaid], { enabled: true, buyer_ready: false }).todo, 0, "付款没开放：不催买家");
  assert.equal(model.countOrderGroups([unpaid], CLOSED).todo, 0);
  assert.equal(model.countOrderGroups([unpaid], READY).todo, 1);
});

test("我的订单：搜索只认标题与对方的名字、账号，最近有动静的在前", () => {
  const a = order({ id: "a", title: "品牌 Logo", updated_at: "2026-10-02T00:00:00Z" });
  const b = order({ id: "b", title: "PPT 美化", updated_at: "2026-10-05T00:00:00Z", seller: { user_id: "s2", display_name: "", handle: "zed" } });
  const c = order({ id: "c", title: "三维建模", updated_at: "", created_at: "2026-10-03T00:00:00Z" });
  assert.equal(model.matchesOrderQuery(a, ""), true);
  assert.equal(model.matchesOrderQuery(a, "  logo "), true, "不分大小写、去掉两头空白");
  assert.equal(model.matchesOrderQuery(a, "mia"), true, "买家搜对方（卖家）的名字");
  assert.equal(model.matchesOrderQuery(a, "leo"), false, "自己的名字不算");
  assert.equal(model.matchesOrderQuery(b, "zed"), true, "对方没写名字：认账号");
  assert.equal(model.matchesOrderQuery({ ...a, my_role: "seller" }, "leo"), true, "卖家搜对方（买家）");
  assert.deepEqual(model.sortMyOrders([a, b, c]).map((item) => item.id), ["b", "c", "a"]);
  const shown = model.visibleMyOrders([a, b, c, order({ id: "x", status: "completed" })], { role: "buyer", group: "active", gate: CLOSED });
  assert.deepEqual(shown.map((item) => item.id), ["b", "c", "a"]);
  assert.deepEqual(model.visibleMyOrders([a, b, c], { role: "buyer", group: "active", query: "ppt", gate: CLOSED }).map((item) => item.id), ["b"]);
  assert.deepEqual(model.visibleMyOrders([a, b, c], { role: "seller", group: "active", gate: CLOSED }), [], "没有以卖家身份的单");
});
