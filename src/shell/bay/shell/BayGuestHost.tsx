"use client";

// 未登录且非境内时 MessagesHost 渲染它：同款浮窗（复用 MessagesLayout 外框），里面只有 Bay 视图。
// 栏目标签：聊天/联系人点了先登录，LeoBay 是当前视图。
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { usePathname, useRouter } from "next/navigation";
import { hostState, useMessagesHost } from "../../messages/host-state";
import { MessagesLayout } from "../../messages/MessagesLayout";
import { LeoChatTabs } from "../../leochat/LeoChatTabs";
import { leoChatPageHref } from "../../leochat/leochat-links";
import { BayAuthHost } from "./bay-auth-host";
import { formatBayParam } from "./bay-links";
import { attachBayDeepLinks, closeBayOverlay, requireBayLogin, useBayEnabled, useBayHasDetail, useBayOverlayOpen, useBayState } from "./bay-state";
import { BayView } from "./BayView";

type LayoutProps = ComponentProps<typeof MessagesLayout>;
type OverlayOffset = { x: number; y: number };

const EXIT_FALLBACK_MS = 450;

export function BayGuestHost() {
  const enabled = useBayEnabled();
  const open = useBayOverlayOpen();
  const snap = useMessagesHost();
  const hasDetail = useBayHasDetail();
  const bay = useBayState();
  const router = useRouter();
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
  const bayParam = bay.current.kind === "feed" ? null : formatBayParam(bay.current);
  const pageHref = leoChatPageHref({ tab: "bay", bay: bayParam });
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
    title: "LeoChat",
    pageHref,
    onOpenPage: () => router.push(pageHref),
    list: (
      <div className="flex min-h-0 flex-1 flex-col" data-bay-guest>
        <LeoChatTabs
          active="bay"
          onSelect={() => undefined}
          locked={["inbox", "people"]}
          onLocked={() => requireBayLogin()}
        />
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
