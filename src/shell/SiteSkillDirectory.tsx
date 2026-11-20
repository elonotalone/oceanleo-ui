"use client";

// ============================================================================
// @oceanleo/ui — 站内「相关 agent」目录（单一事实源，操作员 2026-06-24，正名 v8）
// ----------------------------------------------------------------------------
// 需求：把已有 agent 放到合适的 oceanleo 系列网站里，各站工作台也能切 app/agent。
//
// 做法（非破坏）：143 个 agent 物理上仍属 LeoAgent（site_id="agent"）。本组件按
// `relatedSkillCategories(siteId)` 过滤出**与当前产品站相关**的 agent，用统一
// AppDirectory 卡片展示；点开 → 新开 LeoAgent 对应 agent 直接开聊
// （同源 /workspace/agent?agent=<id>，本站内嵌时也可由父站接管）。
//
// 用在每个产品站工作台的「agent」视图（OperatorConsole 顶部 app/agent 切换）。
// 组件 / prop / 函数名（SiteSkillDirectory / onOpenSkill）= 技术标识层，不随正名改。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { listAgents, type AgentDef } from "../lib/agent";
import { relatedSkillCategories } from "../lib/taxonomy";
import { useUI } from "../i18n/ui/useUI";
import { siteWorkspaceHref } from "../lib/site-path";

const SKILL_SITE_ID = "agent";

export interface SiteSkillDirectoryProps {
  /** 当前产品站 site_id（决定展示哪些 agent 分类）。 */
  siteId: string;
  accent?: string;
  /** 打开一个 agent 的行为。默认新开 LeoAgent 对应 agent。 */
  onOpenSkill?: (agentId: string) => void;
}

export function SiteSkillDirectory({
  siteId,
  accent = "#7c3aed",
  onOpenSkill,
}: SiteSkillDirectoryProps) {
  const tt = useUI();
  const [skills, setSkills] = useState<AgentDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listAgents(SKILL_SITE_ID).then((r) => {
      if (!alive) return;
      const items = r.ok && r.data ? r.data.items.filter((a) => a.site_id === SKILL_SITE_ID) : [];
      setSkills(items);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 按本站相关分类过滤（空 = 不过滤，展示全部）。
  const cats = useMemo(() => relatedSkillCategories(siteId), [siteId]);
  const filtered = useMemo(() => {
    if (cats.length === 0) return skills;
    const set = new Set(cats);
    return skills.filter((a) => set.has(a.category));
  }, [skills, cats]);

  const items: DirectoryItem[] = useMemo(
    () =>
      filtered.map((a) => ({
        id: a.agent_id,
        name: a.name,
        tagline: a.tagline,
        capabilities: a.capabilities,
        icon: a.icon,
        accent,
        site_id: a.site_id,
        category: a.category,
      })),
    [filtered, accent],
  );

  // LeoAgent 的工作台在门户同源 `/workspace/agent`（2026-11-21 起没有子站主机）。
  // 仍新开一个标签页：用户正在本站工作台里干活，不把它导航走。父站自带 onOpenSkill 时由它接管。
  const openSkill = (agentId: string) => {
    if (onOpenSkill) {
      onOpenSkill(agentId);
      return;
    }
    window.open(
      siteWorkspaceHref(SKILL_SITE_ID, [], { agent: agentId }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <AppDirectory
      items={items}
      accent={accent}
      loading={loading}
      openLabel={tt("开聊")}
      emptyText={tt("暂无与本站相关的 agent。")}
      onOpen={(it) => openSkill(it.id)}
      nativeFirst
      nativeLabel={tt("按分类")}
    />
  );
}
