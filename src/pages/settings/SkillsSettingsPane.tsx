"use client";

// 设置中心「技能」（skills-overhaul W10，合同 D3/D4）。
// 一行说明 + 链接；主体是共享的个人技能管理面板（列表、搜索、筛选、Add ▾、开关、菜单）。
// 「浏览官方技能库」与面板里「从官方库添加」打开同一个官方库弹窗；加完刷新列表。

import { useState } from "react";

import { useUI } from "../../i18n/ui/useUI";
import { OfficialSkillLibraryDialog, SkillsManager } from "../../shell/skills/manager";

export interface SkillsSettingsPaneProps {
  /** 独立页（/plugins）上下排列两个 pane 时显示自己的标题；设置窗里标题由设置中心画。 */
  heading?: boolean;
}

export function SkillsSettingsPane({ heading = false }: SkillsSettingsPaneProps) {
  const tt = useUI();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [revision, setRevision] = useState(0);

  return (
    <section data-plugins-skills data-settings-skills-pane className="min-h-0">
      {heading ? (
        <h2 className="mb-2 text-[20px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
          {tt("技能")}
        </h2>
      ) : null}
      <p data-skills-pane-hint className="text-[14px] leading-relaxed text-neutral-500">
        {tt("在输入框输入 / 使用已添加的技能")}
        <span aria-hidden="true" className="mx-1.5">
          ·
        </span>
        <button
          type="button"
          data-skills-open-official
          onClick={() => setLibraryOpen(true)}
          className="text-neutral-700 underline decoration-neutral-300 underline-offset-4 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-900 hover:decoration-neutral-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:text-neutral-300 dark:hover:text-white"
        >
          {tt("浏览官方技能库")}
        </button>
      </p>
      <div className="mt-5">
        <SkillsManager
          key={revision}
          scope={{ kind: "personal" }}
          onOpenOfficialLibrary={() => setLibraryOpen(true)}
        />
      </div>
      <OfficialSkillLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onAdded={() => setRevision((n) => n + 1)}
      />
    </section>
  );
}
