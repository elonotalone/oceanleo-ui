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

test("MessagesHost：未登录海外开 BayGuestHost；talent 会话走 DealConversationView", () => {
  const text = src("shell/messages/MessagesHost.tsx");
  assert.match(text, /if \(!enabled\) return bayEnabledHere\(\) \? <BayGuestHost \/> : null;/);
  assert.match(text, /<LeoChatTabs/);
  assert.match(text, /state\.view === "bay"/);
  assert.match(text, /<BayView part="list"/);
  assert.match(text, /<BayView part="detail"/);
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /data-leochat-open-page/);
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

test("nav-source：门户侧栏是 LeoChat 整页，不再占 Bay/消息行", () => {
  const text = src("shell/nav-source/index.ts");
  assert.match(text, /id: "leochat"/);
  assert.match(text, /href: "\/leochat"/);
  assert.match(text, /labelKey: "LeoChat"/);
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
