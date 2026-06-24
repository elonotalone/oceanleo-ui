"use client";

// ============================================================================
// @oceanleo/ui — 站内「相关 skill」目录（单一事实源，操作员 2026-06-24）
// ----------------------------------------------------------------------------
// 需求：把已有 skill 放到合适的 oceanleo 系列网站里，各站工作台也能切 app/skill。
//
// 做法（非破坏）：143 个 skill 物理上仍属 LeoSkill（site_id="agent"）。本组件按
// `relatedSkillCategories(siteId)` 过滤出**与当前产品站相关**的 skill，用统一
// AppDirectory 卡片展示；点开 → 新开 LeoSkill 对应 skill 直接开聊
// （agent.oceanleo.com/workspace?agent=<id>，本站内嵌时也可由父站接管）。
//
// 用在每个产品站工作台的「skill」视图（OperatorConsole 顶部 app/skill 切换）。
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { AppDirectory, type DirectoryItem } from "./AppDirectory";
import { listAgents, type AgentDef } from "../lib/agent";
import { relatedSkillCategories } from "../lib/taxonomy";

const SKILL_SITE_ID = "agent";
const LEOSKILL_ORIGIN = "https://skill.oceanleo.com";

export interface SiteSkillDirectoryProps {
  /** 当前产品站 site_id（决定展示哪些 skill 分类）。 */
  siteId: string;
  accent?: string;
  /** 打开一个 skill 的行为。默认新开 LeoSkill 对应 skill。 */
  onOpenSkill?: (agentId: string) => void;
}

export function SiteSkillDirectory({
  siteId,
  accent = "#7c3aed",
  onOpenSkill,
}: SiteSkillDirectoryProps) {
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

  const openSkill = (agentId: string) => {
    if (onOpenSkill) {
      onOpenSkill(agentId);
      return;
    }
    window.open(
      `${LEOSKILL_ORIGIN}/workspace?agent=${encodeURIComponent(agentId)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <AppDirectory
      items={items}
      accent={accent}
      loading={loading}
      openLabel="开聊"
      emptyText="暂无与本站相关的 skill。"
      onOpen={(it) => openSkill(it.id)}
      nativeFirst
      nativeLabel="按技能"
    />
  );
}
