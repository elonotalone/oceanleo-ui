"use client";

import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import {
  attachBayDeepLinks,
  closeBayOverlay,
  openBay,
  useBayEnabled,
  useBayOverlayOpen,
  useBaySignedIn,
} from "../bay/shell/bay-state";
import { closeMessages, openMessages, useMessagesHost } from "../messages/host-state";
import { useImUnread } from "../messages/realtime/hooks";
import { useBayNeedsAction } from "./leochat-store";
import { leoChatPageMounted } from "./page-presence";

export function LeoChatButton({ className = "" }: { className?: string }) {
  const tt = useUI();
  const imOn = useImEnabled();
  const bayOn = useBayEnabled();
  const signedIn = useBaySignedIn();
  const unread = useImUnread();
  const bayCount = useBayNeedsAction(bayOn && signedIn);
  const messagesOpen = useMessagesHost().open;
  const bayOpen = useBayOverlayOpen();
  const count = (imOn ? unread?.total ?? 0 : 0) + bayCount;

  useEffect(() => (bayOn ? attachBayDeepLinks() : undefined), [bayOn]);

  if (!imOn && !bayOn) return null;

  const label = count > 0 ? tt("LeoChat：{n} 条新消息或待办", { n: count }) : "LeoChat";

  const onClick = () => {
    if (leoChatPageMounted()) return;
    if (imOn) {
      if (messagesOpen) closeMessages();
      else openMessages();
      return;
    }
    if (bayOpen) closeBayOverlay();
    else openBay({ kind: "feed" });
  };

  return (
    <div className={`relative ${className}`} data-leochat-button>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="leo-tap-target relative flex items-center justify-center rounded-lg text-neutral-500 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-100 hover:text-neutral-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4.2 3.4a.6.6 0 0 1-1-.47V16h-.3A2.5 2.5 0 0 1 4 13.5z" />
          <path d="M8.5 9.5h7M8.5 12.5h4.5" />
        </svg>
        {count > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
    </div>
  );
}
