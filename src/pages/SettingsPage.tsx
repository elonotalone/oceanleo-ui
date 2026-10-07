"use client";

// ============================================================================
// @oceanleo/ui — 统一「设置」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 2026-09-21 起变薄：渲染 SettingsHub。站点 extraSections 进「数据与团队」。
// 旧「知识库」入口已并入个性化；/settings/knowledge 走 settings-tabs 别名。
// ============================================================================

import type { ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import { SettingsHub, type SettingsSection } from "./settings/SettingsHub";

export interface SettingsPageProps {
  /** 站点特有的额外区块。排在数据分组。 */
  extraSections?: ReactNode;
}

export function SettingsPage({ extraSections }: SettingsPageProps) {
  const tt = useUI();
  const extras: SettingsSection[] = extraSections
    ? [
        {
          id: "extras",
          group: "data",
          label: tt("更多"),
          render: () => extraSections,
        },
      ]
    : [];
  return (
    <div data-settings-center>
      <SettingsHub defaultTab="general" extraSections={extras} guestPrompt="notice" />
    </div>
  );
}
