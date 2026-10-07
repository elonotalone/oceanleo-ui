"use client";

// 未登录且非境内时 MessagesHost 渲染它：同款浮窗（复用 MessagesLayout 外框），里面只有 Bay 视图。
// 顶上的图标行：「聊天」点了先登录（登录后由 Messages 浮窗接手），「Bay」是当前视图。
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { usePathname } from "next/navigation";
import { useUI } from "../../../i18n/ui/useUI";
import { hostState, useMessagesHost } from "../../messages/host-state";
import { MessagesLayout } from "../../messages/MessagesLayout";
import { BayAuthHost } from "./bay-auth-host";
import { BayIcon } from "./bay-icons";
import { attachBayDeepLinks, closeBayOverlay, requireBayLogin, useBayEnabled, useBayHasDetail, useBayOverlayOpen } from "./bay-state";
import { BayView } from "./BayView";

const tabSvg = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "h-5 w-5",
  "aria-hidden": true,
};

function GuestTabs() {
  const tt = useUI();
  return (
    <div role="tablist" aria-label={tt("消息")} data-im-icon-tabs className="flex shrink-0 items-center border-b border-black/10 dark:border-white/10">
      <button
        type="button"
        role="tab"
        aria-selected={false}
        aria-label={tt("聊天")}
        title={tt("登录后可以聊天")}
        data-view="inbox"
        onClick={() => requireBayLogin()}
        className="relative flex flex-1 items-center justify-center py-3 text-black/45 dark:text-white/45"
      >
        <svg {...tabSvg}>
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M8.5 9.5h7M8.5 12.5h4.5" />
        </svg>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={false}
        aria-label={tt("联系人")}
        title={tt("登录后可以聊天")}
        data-view="people"
        onClick={() => requireBayLogin()}
        className="relative flex flex-1 items-center justify-center py-3 text-black/45 dark:text-white/45"
      >
        <svg {...tabSvg}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 19c.6-3.2 2.9-4.8 5.5-4.8s4.9 1.6 5.5 4.8M16 11.2a3 3 0 1 0 0-6M17.5 14.6c1.8.5 3 1.9 3.5 4.4" />
        </svg>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected
        aria-label="Bay"
        title="OceanLeo Bay"
        data-view="bay"
        className="relative flex flex-1 items-center justify-center py-3"
      >
        <BayIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

type LayoutProps = ComponentProps<typeof MessagesLayout>;
type OverlayOffset = { x: number; y: number };

const EXIT_FALLBACK_MS = 450;

export function BayGuestHost() {
  const enabled = useBayEnabled();
  const open = useBayOverlayOpen();
  const snap = useMessagesHost();
  const hasDetail = useBayHasDetail();
  const pathname = usePathname() || "/";
  const pathRef = useRef(pathname);
  const [shown, setShown] = useState(open);
  const [overlayState, setOverlayState] = useState<"open" | "closed">(open ? "open" : "closed");

  useEffect(() => (enabled ? attachBayDeepLinks() : undefined), [enabled]);

  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    closeBayOverlay();
  }, [pathname]);

  useEffect(() => {
    if (open) {
      setShown(true);
      const frame = window.requestAnimationFrame(() => setOverlayState("open"));
      return () => window.cancelAnimationFrame(frame);
    }
    setOverlayState("closed");
    const timer = window.setTimeout(() => setShown(false), EXIT_FALLBACK_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const host = hostState();
    host.syncViewport();
    const onResize = () => host.syncViewport();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  if (!enabled) return null;
  const host = hostState();
  const layout = snap.layout === "full" ? "docked" : snap.layout;
  // 外框只依赖 MessagesLayout 已提交的 props；拖动位置与开合动画两项是新版外框才认的，旧版忽略。
  const extras = {
    overlayOffset: (snap as { overlayOffset?: OverlayOffset | null }).overlayOffset ?? null,
    onOverlayOffset: (offset: OverlayOffset) =>
      (host as { setOverlayOffset?: (value: OverlayOffset) => void }).setOverlayOffset?.(offset),
    overlayState,
    onExitComplete: () => {
      if (!open) setShown(false);
    },
  };
  const props = {
    layout,
    dockWidth: snap.dockWidth,
    onDockWidth: (width: number) => host.setDockWidth(width),
    onClose: closeBayOverlay,
    list: (
      <div className="flex min-h-0 flex-1 flex-col" data-bay-guest>
        <GuestTabs />
        <div data-im-view-body className="flex min-h-0 flex-1 flex-col">
          <BayView part="list" layout={layout} />
        </div>
      </div>
    ),
    detail: <BayView part="detail" layout={layout} />,
    showDetail: hasDetail,
    ...extras,
  } as LayoutProps;

  return (
    <>
      {shown ? <MessagesLayout {...props} /> : null}
      <BayAuthHost />
    </>
  );
}
