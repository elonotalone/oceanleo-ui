"use client";

// W09B · P4 — `/` skill picker for the composer (contract §3.4 / §3.5; W15 consumes).
//
// `useAvailableSkills(projectId?)` merges the caller's personal skills with the
// current project's skills (project wins on a name clash, like the runtime lookup).
//
// `SkillPickerList` renders the filtered list. Keyboard is owned by the composer:
//   - `activeIndex` / `onActiveChange` (optional, controlled): which row is highlighted.
//     Uncontrolled → the list tracks hover itself and highlights row 0.
//   - `onItemsChange(items)` (optional): called with the filtered list whenever it
//     changes, so the composer can map ↑/↓/Enter onto `items[activeIndex].name`.
//   - `id` (optional): listbox id; row `i` gets id `${id}-option-${i}` for
//     `aria-activedescendant` on the textarea.
// Rows use `onMouseDown` + `preventDefault` so clicking never blurs the textarea.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale } from "next-intl";

import { useUI } from "../../../i18n/ui/useUI";
import { filterPickerSkills, mergeAvailableSkills, wrapIndex, type AvailableSkill } from "./logic";
import type { SkillPickerListProps } from "./types";
import { useScopeFolders } from "./use-scope-folders";

export function useAvailableSkills(projectId?: string): { skills: AvailableSkill[]; loading: boolean } {
  const locale = useLocale();
  const personal = useScopeFolders(undefined);
  const project = useScopeFolders(projectId, Boolean(projectId));
  const skills = useMemo(
    () => mergeAvailableSkills(personal.items, projectId ? project.items : [], locale),
    [personal.items, project.items, projectId, locale],
  );
  const loading = personal.status === "loading" || (Boolean(projectId) && project.status === "loading");
  return { skills, loading };
}

export interface SkillPickerListExtraProps {
  /** Controlled highlighted row (−1 = none). */
  activeIndex?: number;
  onActiveChange?: (index: number) => void;
  /** Reports the filtered rows after every change (for Enter / Tab handling in the composer). */
  onItemsChange?: (items: AvailableSkill[]) => void;
  /** Listbox element id; options are `${id}-option-${i}`. */
  id?: string;
}

export function SkillPickerList({
  projectId,
  query,
  onPick,
  activeIndex,
  onActiveChange,
  onItemsChange,
  id,
}: SkillPickerListProps & SkillPickerListExtraProps) {
  const tt = useUI();
  const autoId = useId();
  const listId = id || `skill-picker-${autoId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const { skills, loading } = useAvailableSkills(projectId);
  const items = useMemo(() => filterPickerSkills(skills, query), [skills, query]);
  const [hover, setHover] = useState(0);
  const controlled = typeof activeIndex === "number";
  const active = controlled ? activeIndex : items.length ? wrapIndex(hover, items.length) : -1;
  const listRef = useRef<HTMLUListElement>(null);

  const reportRef = useRef(onItemsChange);
  reportRef.current = onItemsChange;
  const signature = items.map((item) => item.name).join("\n");
  useEffect(() => {
    reportRef.current?.(items);
    if (!controlled) setHover(0);
    // `signature` is the stable identity of `items`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });
  }, [active]);

  const setActive = (index: number) => {
    if (controlled) onActiveChange?.(index);
    else setHover(index);
  };

  if (loading && skills.length === 0) {
    return (
      <div className="px-3 py-3 text-[13px] text-neutral-500 dark:text-neutral-400" data-testid="skill-picker-list" aria-busy="true">
        {tt("加载技能…")}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-3 py-3 text-[13px] text-neutral-500 dark:text-neutral-400" data-testid="skill-picker-list" data-empty="">
        {skills.length === 0 ? tt("还没有技能。可以在设置的「技能」里添加。") : tt("没有匹配的技能")}
      </div>
    );
  }

  return (
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={tt("技能")}
      data-testid="skill-picker-list"
      className="max-h-[320px] overflow-y-auto p-1"
    >
      {items.map((skill, index) => {
        const selected = index === active;
        return (
          <li
            key={skill.name}
            id={`${listId}-option-${index}`}
            role="option"
            aria-selected={selected}
            data-index={index}
            data-skill-name={skill.name}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(skill.name);
            }}
            onMouseEnter={() => setActive(index)}
            className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors duration-[var(--leo-dur-1)] ease-[var(--leo-ease-standard)] ${
              selected ? "bg-neutral-100 dark:bg-white/10" : "hover:bg-neutral-50 dark:hover:bg-white/5"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="shrink-0 font-mono text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                  /{skill.name}
                </span>
                {skill.title && skill.title !== skill.name ? (
                  <span className="truncate text-[13px] text-neutral-600 dark:text-neutral-300">{skill.title}</span>
                ) : null}
              </span>
              {skill.description ? (
                <span className="mt-0.5 block truncate text-[12px] text-neutral-500 dark:text-neutral-400">
                  {skill.description}
                </span>
              ) : null}
            </span>
            {skill.scope === "project" ? (
              <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                {tt("项目技能")}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
