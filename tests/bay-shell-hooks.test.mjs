// W03 契约 §1.5 插桩：断言工作区里的钩子已在。干净 HEAD 上会红；不提交，父 agent 整合时一并进库。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, "src", rel), "utf8");

test("host-state：MessagesView 与深链认 bay", () => {
  const text = src("shell/messages/host-state.ts");
  assert.match(text, /export type MessagesView = (?:"[^"]+" \| )+"bay"/);
  assert.match(text, /MESSAGES_VIEWS: readonly MessagesView\[\] = \[[^\]]*"[^"]+", "bay"/);
  assert.match(text, /raw === "bay"/);
});

test("MessagesHost：未登录海外开 BayGuestHost；图标行有 Bay；talent 会话走 DealConversationView", () => {
  const text = src("shell/messages/MessagesHost.tsx");
  assert.match(text, /if \(!enabled\) return bayEnabledHere\(\) \? <BayGuestHost \/> : null;/);
  assert.match(text, /\{ id: "bay", label: "Bay" \}/);
  assert.match(text, /state\.view === "bay"/);
  assert.match(text, /<BayView part="list"/);
  assert.match(text, /<BayView part="detail"/);
  // 去 /bay 整页的入口在 Bay 视图自己的那一行里（不依赖浮窗顶栏有没有放大键）。
  const list = src("shell/bay/shell/BayList.tsx");
  assert.match(list, /href=\{bayPageHref\(\)\}/);
  assert.match(list, /data-bay-action="open-page"/);
  assert.match(text, /<DealConversationView/);
  assert.match(text, /threadId=\{state\.conversationId\.replace\(\/\^talent:\/, ""\)\}/);
  assert.doesNotMatch(text, /TalentConversationView/);
});

test("SidebarAccountCluster：铃铛后有 BayNavIcon", () => {
  const text = src("shell/account/SidebarAccountCluster.tsx");
  assert.match(text, /<NotificationBell className="leo-tap-target-inner" \/>/);
  assert.match(text, /<BayNavIcon className="leo-tap-target-inner" \/>/);
});

test("AppShell：账号行上方有叫真人，窄栏是 compact，顶栏没有", () => {
  const text = src("shell/AppShell.tsx");
  assert.match(text, /<CallHumanButton siteKey=\{shellSiteKey \|\| "oceanleo"\} \/>/);
  assert.match(text, /<CallHumanButton siteKey=\{shellSiteKey \|\| "oceanleo"\} compact \/>/);
  const topbar = text.slice(text.indexOf('if (layout === "topbar")'));
  assert.doesNotMatch(topbar, /CallHumanButton/);
});

test("MessageItem：talent_order 卡渲染 BayOrderCard", () => {
  const text = src("shell/messages/conversation/MessageItem.tsx");
  assert.match(text, /talent_order/);
  assert.match(text, /<BayOrderCard/);
  assert.match(text, /compact/);
});

test("nav-source：门户 talent 行改成站内 /bay", () => {
  const text = src("shell/nav-source/index.ts");
  assert.match(text, /id: "bay"/);
  assert.match(text, /href: "\/bay"/);
  assert.match(text, /labelKey: "OceanLeo Bay"/);
  assert.match(text, /iconId: "bay"/);
  assert.doesNotMatch(text, /id: "talent"/);
});

test("shell/index：导出 bay", () => {
  const text = src("shell/index.ts");
  assert.match(text, /export \* from "\.\/bay";/);
});

test("i18n 总表与 load 登记了 bay-copy", () => {
  const index = src("i18n/ui/messages/index.ts");
  const load = src("i18n/ui/messages/load.ts");
  assert.match(index, /import \{ BAY_MESSAGES \} from "\.\/bay-copy"/);
  assert.match(index, /\.\.\.BAY_MESSAGES\.zh,/);
  assert.match(index, /\.\.\.BAY_MESSAGES\["es-419"\],/);
  assert.match(load, /import\("\.\/bay-copy"\)/);
  assert.match(load, /\.\.\.bay\.BAY_MESSAGES\[locale\]/);
});
