"use client";

// ============================================================================
// @oceanleo/ui — 独立「技能与连接器」页（各站 /plugins 路由仍在用）
// ----------------------------------------------------------------------------
// 2026-10-24 skills-overhaul W10：设置中心把「插件与连接器」拆成「技能」「连接器」两栏
// （SkillsSettingsPane / ConnectorsSettingsPane）。这里保留旧导出与 `variant`：
//   - `page`（缺省）：统一页头 + 两个 pane 上下排列（技能在上、连接器在下）；
//   - `pane`：只为兼容旧调用（设置窗旧「插件」栏），渲染技能 pane。
// 组织共用的连接器不在这一页：去组织页查看和设置。
// ============================================================================

import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { ConnectorsSettingsPane } from "./settings/ConnectorsSettingsPane";
import { SkillsSettingsPane } from "./settings/SkillsSettingsPane";
import { useUI } from "../i18n/ui/useUI";

export {
  canManageOrgMcp,
  normalizeOrgMcpConnections,
  shouldRenderOrgSection,
  type OrgMcpConnection,
} from "../shell/usePluginsCatalog";

export {
  connectMcp,
  disconnectMcp,
  getMcpConnections,
  getMcpRegistry,
  mcpGatewayDetail,
  mcpOauthMessageOrigin,
  mcpOauthOpensPortalPage,
  mcpOauthPortalPageHref,
  mcpOauthReturnOrigin,
  probeMcp,
  startMcpOauth,
  toggleMcp,
  type McpConnection,
  type McpConnectorMeta,
} from "../lib/mcp-api";

export interface PluginsPageProps {
  accent?: string;
  title?: ReactNode;
  /**
   * `page`（缺省）：独立的 `/plugins` 页，带统一页头，技能与连接器上下排列。
   * `pane`：兼容旧的设置窗「插件」面板调用，只渲染技能栏。面板区自带标题与滚动，
   * 所以不渲染页头（页头的「返回」会把设置窗背后的页面退回上一页），也不占整页高度。
   */
  variant?: "page" | "pane";
}

export function PluginsPage({ accent = "#4f46e5", title, variant = "page" }: PluginsPageProps) {
  const tt = useUI();
  const pane = variant === "pane";

  return (
    <div className={pane ? "min-h-0" : "px-8 py-6"} data-plugins-pane={pane ? "" : undefined}>
      {!pane && <PageHeader title={typeof title === "string" ? title : tt("技能与连接器")} />}
      {pane ? (
        <SkillsSettingsPane />
      ) : (
        <div data-plugins-page-panes className="mx-auto mt-6 max-w-5xl space-y-12">
          <SkillsSettingsPane heading />
          <ConnectorsSettingsPane heading accent={accent} />
        </div>
      )}
    </div>
  );
}
