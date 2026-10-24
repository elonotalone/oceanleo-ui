"use client";

// W09B · P2 — official skill library browser (contract §3.4; UI-DESIGN). Category
// tabs (all + 10) + search; cover card grid (3:4 cover, title, two-line description,
// "Added" corner badge); click → `SkillDetailModal`; footer link to the portal `/skills`.

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";

import { currentDomainProfile } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import {
  ConfigDialogShell,
  ConfigEmptyState,
  ConfigToolbar,
  KitIconCheck,
  KitIconPuzzle,
  SkillCover,
  gatewayAbsoluteUrl,
  listOfficialSkills,
  type OfficialSkill,
  type OfficialSkillCategory,
} from "../kit";
import {
  SKILL_CATEGORY_IDS,
  SKILL_CATEGORY_LABEL_ZH,
  filterOfficial,
  folderSkillName,
  isChineseLocale,
  officialDescription,
  officialDisplayTitle,
  type SkillCategoryId,
} from "./logic";
import { IconExternal } from "./manager-icons";
import { SkillDetailModal } from "./SkillDetailModal";
import type { OfficialSkillLibraryDialogProps } from "./types";
import { useScopeFolders } from "./use-scope-folders";

/** Portal page that lists every official skill (W16). */
export function officialLibraryPageUrl(portalOrigin?: string): string {
  let origin = portalOrigin;
  if (origin == null) {
    try {
      origin = currentDomainProfile().portalOrigin;
    } catch {
      origin = "";
    }
  }
  return `${(origin || "").replace(/\/+$/, "")}/skills`;
}

/** Tabs: "all" + the categories the gateway reports, in §4 order (fallback: the fixed ten). */
export function libraryTabs(
  categories: readonly OfficialSkillCategory[],
  locale: string,
): { id: string; label: string; translate: boolean }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const ids = categories.length
    ? [
        ...SKILL_CATEGORY_IDS.filter((id) => byId.has(id)),
        ...categories.map((c) => c.id).filter((id) => !(SKILL_CATEGORY_IDS as readonly string[]).includes(id)),
      ]
    : [...SKILL_CATEGORY_IDS];
  return [
    { id: "all", label: "全部", translate: true },
    ...ids.map((id) => {
      const known = SKILL_CATEGORY_LABEL_ZH[id as SkillCategoryId];
      if (known) return { id, label: known, translate: true };
      const row = byId.get(id);
      const label = row ? (isChineseLocale(locale) ? row.label_zh || row.label : row.label || row.label_zh) : id;
      return { id, label, translate: false };
    }),
  ];
}

export function OfficialSkillLibraryDialog({ open, onClose, projectId, onAdded }: OfficialSkillLibraryDialogProps) {
  const tt = useUI();
  const locale = useLocale();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [items, setItems] = useState<OfficialSkill[]>([]);
  const [categories, setCategories] = useState<OfficialSkillCategory[]>([]);
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [detailName, setDetailName] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const scopeFolders = useScopeFolders(projectId, open);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus((s) => (s === "ready" ? s : "loading"));
    void listOfficialSkills().then((result) => {
      if (!alive) return;
      if (result.ok) {
        setItems(result.data.items);
        setCategories(result.data.categories);
        setStatus("ready");
      } else {
        setError(result.error);
        setStatus("error");
      }
    });
    return () => {
      alive = false;
    };
  }, [open, tick]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTab("all");
      setDetailName(null);
    }
  }, [open]);

  const added = useMemo(
    () => new Set(scopeFolders.items.map((folder) => folderSkillName(folder)).filter(Boolean)),
    [scopeFolders.items],
  );
  const tabs = useMemo(() => libraryTabs(categories, locale), [categories, locale]);
  const visible = useMemo(() => filterOfficial(items, tab, query), [items, tab, query]);

  return (
    <>
      <ConfigDialogShell
        open={open}
        onClose={onClose}
        size="xl"
        testId="official-skill-library"
        title={tt("官方技能库")}
        subtitle={
          <>
            {status === "ready" ? tt("{n} 个技能", { n: items.length }) + " · " : null}
            {tt("全部 Apache-2.0 开源，可直接查看和下载。")}
          </>
        }
        toolbar={
          <div className="flex flex-col gap-4">
            <ConfigToolbar search={{ value: query, onChange: setQuery, placeholder: tt("搜索官方技能") }} />
            <div
              role="tablist"
              aria-label={tt("分类")}
              className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
            >
              {tabs.map((t) => {
                const selected = t.id === tab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    data-category-tab={t.id}
                    onClick={() => setTab(t.id)}
                    className="group/tab inline-flex min-h-11 shrink-0 items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500"
                  >
                    <span
                      className={`inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] ${
                        selected
                          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                          : "border border-neutral-200 bg-white text-neutral-700 group-hover/tab:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:group-hover/tab:bg-neutral-800"
                      }`}
                    >
                      {t.translate ? tt(t.label) : t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        }
        footer={
          <div className="flex items-center justify-between gap-3 text-[13px] text-neutral-500 dark:text-neutral-400">
            <span className="hidden sm:inline">{tt("添加后，任务开始时 agent 就会知道这个技能。")}</span>
            <a
              href={officialLibraryPageUrl()}
              target="_blank"
              rel="noopener noreferrer"
              data-official-library-page-link=""
              className="inline-flex items-center gap-1 font-medium text-neutral-800 underline decoration-neutral-300 underline-offset-[3px] transition-colors duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:decoration-neutral-700 dark:text-neutral-100"
            >
              {tt("在新页面浏览全部技能")}
              <IconExternal className="h-3.5 w-3.5" />
            </a>
          </div>
        }
      >
        {status === "loading" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-[240px] animate-pulse rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950" />
            ))}
          </div>
        ) : status === "error" ? (
          <ConfigEmptyState
            icon={<KitIconPuzzle className="h-8 w-8" />}
            title={tt("官方技能库加载失败")}
            description={tt(error)}
            action={
              <button
                type="button"
                onClick={() => setTick((v) => v + 1)}
                className="inline-flex h-11 items-center rounded-xl border border-neutral-200 bg-white px-4 text-[13px] font-medium transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-neutral-700 dark:bg-neutral-900"
              >
                {tt("重试")}
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <ConfigEmptyState
            icon={<KitIconPuzzle className="h-8 w-8" />}
            title={tt("没有匹配的技能")}
            description={tt("换个关键词，或切到「全部」。")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-official-grid="">
            {visible.map((skill) => (
              <OfficialSkillCard
                key={skill.name}
                skill={skill}
                locale={locale}
                added={added.has(skill.name)}
                onOpen={() => setDetailName(skill.name)}
              />
            ))}
          </div>
        )}
      </ConfigDialogShell>
      {open && detailName ? (
        <SkillDetailModal
          open
          onClose={() => setDetailName(null)}
          skill={{ kind: "official", name: detailName }}
          projectId={projectId}
          onAdded={(folder) => {
            scopeFolders.reload();
            onAdded?.(folder);
          }}
        />
      ) : null}
    </>
  );
}

export function OfficialSkillCard({
  skill,
  locale,
  added,
  onOpen,
}: {
  skill: OfficialSkill;
  locale: string;
  added: boolean;
  onOpen: () => void;
}) {
  const tt = useUI();
  const title = officialDisplayTitle(skill, locale);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-official-skill={skill.name}
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-neutral-800 dark:bg-neutral-950"
    >
      <div className="flex h-[120px] items-center justify-center bg-gradient-to-b from-neutral-100 to-neutral-50 dark:from-neutral-900 dark:to-neutral-950">
        <div className="-rotate-[4deg] shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-transform duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] group-hover:-rotate-[2deg]">
          <SkillCover src={skill.cover_url ? gatewayAbsoluteUrl(skill.cover_url) : null} title={title} size="md" />
        </div>
      </div>
      {added ? (
        <span
          data-official-added=""
          className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[12px] font-medium text-neutral-800 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900/95 dark:text-neutral-100 dark:ring-neutral-700"
        >
          <KitIconCheck className="h-3.5 w-3.5" />
          {tt("已加入")}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-4 pb-4 pt-3">
        <h3 className="truncate text-[13px] font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
        <p className="line-clamp-2 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
          {officialDescription(skill, locale)}
        </p>
        <p className="mt-auto pt-1 font-mono text-[12px] text-neutral-400">/{skill.name}</p>
      </div>
    </button>
  );
}
