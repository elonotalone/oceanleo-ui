"use client";

// ============================================================================
// @oceanleo/ui — 统一「设置」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 2026-09-21 起变薄：渲染 SettingsHub。已有 extraSections / knowledgeBaseLink
// 语义保留：ReactNode 额外区块与主站知识库入口都进「数据与组织」分组。
// ============================================================================

import type { ReactNode } from "react";
import { currentDomainProfile } from "../contracts/domain-family";
import { useUI } from "../i18n/ui/useUI";
import { SettingsHub, type SettingsSection } from "./settings/SettingsHub";

export interface SettingsPageProps {
  /** 站点特有的额外区块（如主站的「知识库」增删改查）。排在个人资料之后。 */
  extraSections?: ReactNode;
  /**
   * 是否显示默认的「知识库」入口卡片（指向主站 oceanleo.com/settings）。
   * 默认 true（与 32 站分叉一致）。主站自己就是那个落点，用 extraSections
   * 渲染真正的知识库时传 false，避免出现指向自己的入口。
   */
  knowledgeBaseLink?: boolean;
}

function KnowledgeBaseLinkCard() {
  const tt = useUI();
  return (
    <section className="v-fade-up" data-settings-pane="knowledge-link">
      <p className="text-[12px] leading-relaxed text-neutral-500">
        {tt("在 OceanLeo 主站可添加跨任务记忆的偏好与背景信息，所有 AI 应用共享。")}
      </p>
      <a
        href={`${currentDomainProfile().portalOrigin}/settings`}
        className="mt-3 inline-block rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
      >
        {tt("前往主站管理知识库 →")}
      </a>
    </section>
  );
}

export function SettingsPage({ extraSections, knowledgeBaseLink = true }: SettingsPageProps) {
  const tt = useUI();
  const extras: SettingsSection[] = [];
  if (knowledgeBaseLink) {
    extras.push({
      id: "knowledge-link",
      group: "data",
      label: tt("知识库"),
      render: () => <KnowledgeBaseLinkCard />,
    });
  }
  if (extraSections) {
    extras.push({
      id: "extras",
      group: "data",
      label: tt("更多"),
      render: () => extraSections,
    });
  }
  return (
    <div data-settings-center><SettingsHub defaultTab="general" extraSections={extras} guestPrompt="notice" /></div>
  );
}
