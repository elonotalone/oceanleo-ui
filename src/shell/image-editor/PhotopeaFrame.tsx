"use client";

import { useEffect, useRef } from "react";
import type { PhotopeaLaunchOptions } from "./photopea-bridge";
import type { PhotopeaSession } from "./photopea-session";

/** React owns only the positioning anchor. The session owns the real iframe. */
export function PhotopeaFrame({ documentDataUrl, theme, session }: PhotopeaLaunchOptions & {
  session: PhotopeaSession;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const launch = useRef({ documentDataUrl, theme });
  launch.current = { documentDataUrl, theme };
  useEffect(() => {
    if (!anchor.current) return;
    return session.attach(anchor.current, launch.current);
  }, [session]);
  return <div ref={anchor} className="h-full min-h-[280px] w-full" data-testid="image-photopea-anchor" />;
}
