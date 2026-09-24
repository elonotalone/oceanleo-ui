import { useEffect, useState } from "react";
import { ttfvClock } from "./ttfv";

type Translate = (zh: string, vars?: Record<string, string | number>) => string;

export function thinkingLabel(
  tt: Translate,
  seconds: number,
  chars: number | null,
): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  if (chars !== null && chars > 0) {
    return tt("正在思考… 已想 {chars} 字 · {seconds} 秒", {
      chars,
      seconds: safeSeconds,
    });
  }
  return tt("正在思考 · {seconds} 秒", { seconds: safeSeconds });
}

/** 读秒只在本轮还没出字、且记过按下发送时走；没有发送记录就保持原来的转圈文案。 */
export function useThinkingSeconds(active: boolean, sentAt: number | null): number {
  const [now, setNow] = useState(ttfvClock);
  useEffect(() => {
    if (!active || sentAt === null) return;
    setNow(ttfvClock());
    const timer = setInterval(() => setNow(ttfvClock()), 250);
    return () => clearInterval(timer);
  }, [active, sentAt]);
  if (sentAt === null) return 0;
  return Math.max(0, Math.floor((now - sentAt) / 1000));
}
