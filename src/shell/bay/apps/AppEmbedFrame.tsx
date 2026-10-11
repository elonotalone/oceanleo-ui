"use client";

// 作品页内窗口。不注入脚本、不 postMessage、不听 message。
// sandbox 在 iframe 上写成字面量（跨仓扫描器要能静态读出它的值），并由源码级断言锁成与
// app-embed.ts 的 BAY_APP_FRAME_SANDBOX 逐字相同：改一处不改另一处会变红。
import { useEffect, useRef, useState, type ReactElement } from "react";

import { useUI } from "../../../i18n/ui/useUI";

// 不给 iframe 加 loading="lazy"：窗口在屏幕下方时浏览器会推迟加载，10 秒的计时会把它误判成没加载出来。
const LOAD_MS = 10_000;

export function AppEmbedFrame(props: {
  src: string;
  host: string;
  title: string;
  onOpenExternal: () => void;
  onReady?: () => void;
}): ReactElement {
  const tt = useUI();
  const { src, host, title, onOpenExternal, onReady } = props;
  const [frameKey, setFrameKey] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setTimedOut(false);
    const timer = window.setTimeout(() => {
      if (!loadedRef.current) setTimedOut(true);
    }, LOAD_MS);
    return () => window.clearTimeout(timer);
  }, [frameKey, src]);

  function remount() {
    setFrameKey((value) => value + 1);
  }

  function handleLoad() {
    loadedRef.current = true;
    setTimedOut(false);
    onReady?.();
  }

  return (
    <div data-bay-app-frame className="overflow-hidden rounded-xl border border-neutral-200">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[11px] text-neutral-500">
        <span className="shrink-0 font-medium text-neutral-700">{host}</span>
        <span className="min-w-0 flex-1 truncate text-center">{tt("这是创作者提供的内容，请不要在里面输入你的 OceanLeo 密码")}</span>
        <span className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={remount} className="text-neutral-600 hover:text-neutral-900 hover:underline">
            {tt("重新加载")}
          </button>
          <button type="button" onClick={onOpenExternal} className="text-neutral-600 hover:text-neutral-900 hover:underline">
            {tt("在新窗口打开")}
          </button>
        </span>
      </div>
      {timedOut ? (
        <div data-bay-app-fallback="timeout" className="grid min-h-[32rem] place-items-center bg-neutral-50 px-4 py-10 text-center">
          <div>
            <p className="text-[14px] font-medium text-neutral-800">{tt("页内窗口没有加载出来")}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={remount}
                className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-700 hover:bg-neutral-50"
              >
                {tt("再试一次")}
              </button>
              <button
                type="button"
                onClick={onOpenExternal}
                className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-neutral-800"
              >
                {tt("打开网站")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <iframe
          key={frameKey}
          src={src}
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          allow=""
          title={title}
          onLoad={handleLoad}
          className="min-h-[32rem] w-full border-0 bg-white"
        />
      )}
    </div>
  );
}
