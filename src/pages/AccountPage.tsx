"use client";

// ============================================================================
// @oceanleo/ui — 统一「账户」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 全家桶 36 个 consumer 的单一事实源。各站 account/page.tsx 只需把它包进自己的
// <AppShell> / <SiteShell>。2026-09-21 起内部渲染 SettingsHub，默认 tab=account；
// 组织内容只在组织栏出现。props 签名保持不变。
// ============================================================================

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { SettingsHub, type SettingsSection } from "./settings/SettingsHub";

export interface AccountMenuItem {
  label: string;
  href: string;
  desc: string;
  /**
   * 外链（如子站的「插件与连接器」指向主站）。true 时用原生 <a> 新窗打开，
   * 不走 next/link 的 SPA 预取——跨站预取只会 404。
   */
  external?: boolean;
  /**
   * 就地展开的面板，而不是跳走。共享包没有路由——路由长在 36 个消费站各自的仓里，
   * 所以新增的账号页内容只能这样才在今天真的点得开。
   */
  expands?: "security";
}

export interface AccountPageProps {
  /** 账户菜单项（默认 通用 / AI 模型 / Cost / 账户设置 / 插件与连接器）。 */
  menuItems?: AccountMenuItem[];
  /** 仅为可测：不传就取 `window.location.href`。 */
  currentHref?: string;
  /** 额外统计卡片（如主站的「任务数」）。每项 {value,label}，排在内置格子之后。 */
  extraStats?: { value: ReactNode; label: string }[];
  /**
   * 是否显示内置第三格「近 30 天请求」。默认 true（与 32 站分叉一致）。
   * 主站用 extraStats 放「任务数」占第三格时传 false，避免挤成四格。
   */
  showRequestStat?: boolean;
  /** 用户卡片里的计划标签，默认「免费计划」；传 null 隐藏。 */
  planLabel?: string | null;
  /** 菜单下方的额外区块（如主站的「记忆」）。进入设置中心「数据与组织」分组。 */
  extraSections?: ReactNode;
  /**
   * 未登录时点「登录」的回调。**不传时就地打开共享 AuthDialog**，
   * 绝不跳首页——传入自定义实现时也不得退化成跳转。
   */
  onSignInClick?: () => void;
  /** 登录成功后的回调（默认刷新当前页，让全站进入登录态）。 */
  onSignedIn?: () => void;
  /** 退出后跳转（默认刷新当前页）。 */
  onSignedOut?: () => void;
}

export function AccountPage({
  menuItems,
  extraStats = [],
  showRequestStat = true,
  planLabel,
  extraSections,
  onSignInClick,
  onSignedIn,
  onSignedOut,
  currentHref,
}: AccountPageProps) {
  const tt = useUI();
  const extras: SettingsSection[] = extraSections
    ? [{ id: "extras", group: "data", label: tt("更多"), render: () => extraSections }]
    : [];
  return (
    <SettingsHub
      defaultTab="account"
      menu={menuItems}
      extraStats={extraStats}
      showRequestStat={showRequestStat}
      planLabel={planLabel}
      extraSections={extras}
      onSignInClick={onSignInClick}
      onSignedIn={onSignedIn}
      onSignedOut={onSignedOut}
      currentHref={currentHref}
      guestPrompt="auth"
    />
  );
}
