// W03 契约 §1.5 插桩：断言工作区里的钩子已在。干净 HEAD 上会红；不提交，父 agent 整合时一并进库。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const src = (rel) => readFileSync(join(REPO, "src", rel), "utf8");

test("host-state：MessagesView 与深链不认 bay", () => {
  const text = src("shell/messages/host-state.ts");
  assert.match(text, /export type MessagesView = "inbox" \| "people"/);
  assert.match(text, /MESSAGES_VIEWS: readonly MessagesView\[\] = \["inbox", "people"\]/);
  assert.doesNotMatch(text, /raw === "bay"/);
  assert.doesNotMatch(text, /view === "bay"/);
});

test("MessagesHost：不可用时只渲染登录框宿主；talent 会话走 DealConversationView", () => {
  const text = src("shell/messages/MessagesHost.tsx");
  assert.match(text, /if \(!enabled\) return <BayAuthHost \/>;/);
  assert.match(text, /<LeoChatTabs/);
  assert.doesNotMatch(text, /state\.view === "bay"/);
  assert.doesNotMatch(text, /<BayView/);
  assert.doesNotMatch(text, /BayGuestHost/);
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.doesNotMatch(layout, /data-leochat-open-page/);
  assert.match(layout, /onToggleExpand/);
  assert.match(text, /<DealConversationView/);
  assert.match(text, /threadId=\{state\.conversationId\.replace\(\/\^talent:\/, ""\)\}/);
  assert.doesNotMatch(text, /TalentConversationView/);
});

test("SidebarAccountCluster：铃铛后有 LeoChatButton，没有 BayNavIcon", () => {
  const text = src("shell/account/SidebarAccountCluster.tsx");
  assert.match(text, /<NotificationBell className="leo-tap-target-inner" \/>/);
  assert.match(text, /<LeoChatButton className="leo-tap-target-inner" \/>/);
  assert.doesNotMatch(text, /<BayNavIcon/);
});

test("AppShell：不再出现 CallHumanButton", () => {
  const text = src("shell/AppShell.tsx");
  assert.doesNotMatch(text, /CallHumanButton/);
});

test("MessageItem：talent_order 卡渲染 BayOrderCard", () => {
  const text = src("shell/messages/conversation/MessageItem.tsx");
  assert.match(text, /talent_order/);
  assert.match(text, /<BayOrderCard/);
  assert.match(text, /compact/);
});

test("nav-source：侧栏是 LeoBay（原探索位），没有 leochat、没有 explore", () => {
  const text = src("shell/nav-source/index.ts");
  assert.match(text, /id: "bay"/);
  assert.match(text, /href: "\/bay"/);
  assert.match(text, /labelKey: "LeoBay"/);
  assert.doesNotMatch(text, /href: "\/leochat"/);
  assert.doesNotMatch(text, /href: "\/explore"/);
  assert.doesNotMatch(text, /labelKey: "OceanLeo Bay"/);
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
