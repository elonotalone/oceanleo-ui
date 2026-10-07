// 消息浮层 DOM 契约：悬浮圆角、标题栏拖拽、行内 z-index、切页不卸。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", "src", rel), "utf8");

test("MessagesLayout：悬浮圆角版面，四角同一半径，溢出裁切而不是贴边抹平", () => {
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /overlayBox/);
  assert.match(layout, /overflow-hidden/);
  assert.match(layout, /MESSAGES_OVERLAY_RADIUS_PX|borderRadius/);
  assert.doesNotMatch(
    layout,
    /top:\s*0,\s*right:\s*0,\s*bottom:\s*0/,
    "桌面不得再贴视口四边，否则底角被抹成直角",
  );
  assert.doesNotMatch(layout, /inset-0/, "全屏贴边会丢掉圆角");
});

test("MessagesLayout：层级用行内 zIndex，不靠 Tailwind 任意值（消费站 CSS 扫不到会丢）", () => {
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /zIndex:\s*MESSAGES_OVERLAY_Z/);
  assert.doesNotMatch(layout, /z-\[999\]/);
  assert.match(layout, /createPortal\(node,\s*document\.body\)/);
  assert.match(layout, /isolation:\s*["']isolate["']/);
});

test("MessagesLayout：标题行按编辑栏的按下即拖；关闭/放大键不拖", () => {
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /data-im-drag-handle/);
  assert.match(layout, /data-im-no-drag/);
  assert.match(layout, /dragStartThreshold/);
  assert.match(layout, /onPointerDown/);
  assert.match(layout, /setPointerCapture/);
  assert.match(layout, /select-none/);
  assert.match(layout, /lostpointercapture/);
  assert.match(layout, /onDragStart/);
  assert.match(layout, /handle\.setPointerCapture/);
  assert.match(layout, /pointerType === "mouse" && next\.buttons === 0/);
  assert.match(layout, /if \(moveDragRef\.current\) finishMoveDrag\(null, false\)/);
});

test("MessagesHost：卸载监听时不能把已经打开的浮层关掉（切页会重挂外壳）", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  const effect = host.slice(host.indexOf("host.setEnabled(true)"));
  const block = effect.slice(0, 400);
  assert.match(block, /host\.attach\(\)/);
  assert.doesNotMatch(
    block,
    /setEnabled\(false\)/,
    "cleanup 里 setEnabled(false) 会在切页重挂时把浮层关掉",
  );
  assert.match(host, /overlayOffset/);
  assert.match(host, /setOverlayOffset/);
});

test("MessagesNavIcon：不用 SVG url(#id) 渐变，View Transition 复制 DOM 时图标不会空白", () => {
  const icon = src("shell/messages/MessagesNavIcon.tsx");
  assert.doesNotMatch(icon, /url\(#/);
  assert.doesNotMatch(icon, /linearGradient/);
  assert.doesNotMatch(icon, /id="lgi-messages"/);
});

test("MessagesHost：切页关掉浮层；四个视图是图标页签，聊天页才有新建", () => {
  const host = src("shell/messages/MessagesHost.tsx");
  assert.match(host, /usePathname/);
  assert.match(host, /if \(hostState\(\)\.getSnapshot\(\)\.open\) closeMessages\(\)/);
  assert.match(host, /data-im-icon-tabs/);
  assert.match(host, /<ViewTabIcon view=\{tab\.id\} \/>/);
  assert.match(host, /aria-label=\{tt\(tab\.label\)\}/);
  assert.match(host, /label: "聊天"/);
  assert.doesNotMatch(host, /label: "收件箱"/);
  assert.doesNotMatch(host, /headerTrailing/);
  assert.doesNotMatch(host, /ImPlusIcon/);
  const tabRow = host.slice(host.indexOf("data-im-icon-tabs"), host.indexOf("data-im-view-body"));
  assert.doesNotMatch(tabRow, /ImPlusIcon/);
  assert.doesNotMatch(tabRow, /新建聊天/);
  assert.doesNotMatch(host, />\s*\{tt\(tab\.label\)\}\s*</);
  assert.doesNotMatch(host, /onSearch=\{\(\) => setView\("search"\)\}/);
  assert.doesNotMatch(host, /onPeople=\{\(\) => setView\("people"\)\}/);
  assert.doesNotMatch(host, /onSettings=\{\(\) => setView\("settings"\)\}/);

  const inbox = src("shell/messages/Inbox.tsx");
  assert.match(inbox, /onNew/);
  assert.match(inbox, /新建聊天/);
  assert.match(inbox, /ImPlusIcon/);
  assert.doesNotMatch(inbox, /onSearch/);
  assert.doesNotMatch(inbox, /onPeople/);
  assert.doesNotMatch(inbox, /onSettings/);
  assert.doesNotMatch(inbox, /搜索消息/);
  assert.doesNotMatch(inbox, /消息设置/);

  const settings = src("shell/messages/SettingsView.tsx");
  assert.doesNotMatch(settings, /onBack/);
  assert.doesNotMatch(settings, /tt\("消息设置"\)/);

  const people = src("shell/messages/people/PeopleView.tsx");
  assert.doesNotMatch(people, /tt\("通讯录"\)/);
});

test("MessagesLayout：开窗从左下长出来，进会话是推入，关掉会收走", () => {
  const layout = src("shell/messages/MessagesLayout.tsx");
  assert.match(layout, /ensureMessagesSurfaceStyles/);
  assert.match(layout, /data-im-overlay-state/);
  assert.match(layout, /data-im-panes/);
  assert.match(layout, /data-im-pane="detail"/);
  assert.match(layout, /ImCloseIcon/);
  assert.doesNotMatch(layout, /[✕⤢⤡]/);
  assert.doesNotMatch(layout, /headerTrailing/);
  assert.match(layout, /el\.style\.left/);
  assert.match(layout, /data-im-dragging/);
  const surface = src("shell/messages/messages-surface.tsx");
  assert.match(surface, /--leo-dur-4/);
  assert.match(surface, /transform-origin: 0% 100%/);
  assert.match(surface, /im-msg-own/);
  assert.match(surface, /user-select:\s*none/);
  assert.doesNotMatch(surface, /top var\(--leo-dur/);
  assert.doesNotMatch(surface, /left var\(--leo-dur/);
});

test("通知铃铛在消息可用时打开消息浮层，不另开通知面板", () => {
  const bell = src("shell/account/NotificationBell.tsx");
  assert.match(bell, /openMessages\(\)/);
  assert.match(bell, /if \(imOn\) \{/);
  assert.match(bell, /open=\{open && !imOn\}/);
});
