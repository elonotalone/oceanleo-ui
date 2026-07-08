"use client";

// <I18nProvider>：薄封装 next-intl 的 NextIntlClientProvider，供各站 root layout
// 包住 children。messages/locale 由 next-intl 的请求作用域自动注入（各站
// next.config 已用 createNextIntlPlugin 包裹），因此这里无需手动传 props——
// next-intl 会从 server 端 getRequestConfig 的结果填充 client 上下文。
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

export interface I18nProviderProps {
  children: ReactNode;
  // 可选：在极少数手动场景（如 Storybook / 测试）显式注入。正常各站不用传。
  locale?: string;
  messages?: Record<string, unknown>;
}

export function I18nProvider({ children, locale, messages }: I18nProviderProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      // client 侧兜底：与 server 端 createI18nRequest 同款——缺 key / 格式错误时静默
      // （已有中文底座兜底），且缺失文案回退成 key 的【最后一段】而非完整 "ns.key"。
      // 杜绝界面出现 raw key（如侧栏「nav.explore」）；有真实翻译时不受影响。
      onError={() => {
        /* 吞掉 MISSING_MESSAGE 等噪音；中文底座已保证有意义文案 */
      }}
      getMessageFallback={({ key }: { key: string; namespace?: string }) =>
        key.split(".").pop() || key
      }
    >
      {children}
    </NextIntlClientProvider>
  );
}
