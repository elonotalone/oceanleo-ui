"use client";

// 旧 /api/guide 子页。厂商逐步教程已撤到帮助中心通用文，这里只指路。

import { useUI } from "../i18n/ui/useUI";
import { HELP_BYOK_ARTICLE_PATH, helpCenterUrl } from "../lib/help-url";

export function ApiGuidePage({ variant = "page" }: { variant?: "page" | "section" } = {}) {
  const tt = useUI();
  const href = helpCenterUrl({
    host: typeof window !== "undefined" ? window.location.host : undefined,
    path: HELP_BYOK_ARTICLE_PATH,
    from: "api-guide",
  });
  const link = (
    <a
      data-byok-help=""
      href={href}
      className="inline-block text-[13px] font-medium text-neutral-800 underline underline-offset-2"
    >
      {tt("怎么自己带密钥")}
    </a>
  );
  if (variant === "section") {
    return (
      <div className="space-y-3" data-api-guide="">
        {link}
      </div>
    );
  }
  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{tt("怎么自己带密钥")}</h1>
      <div className="mx-auto mt-6 max-w-3xl" data-api-guide="">
        {link}
      </div>
    </div>
  );
}
