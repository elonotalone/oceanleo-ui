"use client";

import { useUI } from "../../i18n/ui/useUI";

/** Sidebar landing for the portal's project list. The portal can enhance this slot via its route. */
export function ProjectsWorkspacePanel() {
  const tt = useUI();
  return (
    <section data-workspace-projects-panel className="flex h-full min-h-0 flex-col overflow-auto bg-white p-4">
      <p className="text-sm text-neutral-500">{tt("查看和修改各个项目的配置")}</p>
      <a href="/projects" className="mt-5 inline-flex w-fit rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white">{tt("打开项目列表")}</a>
    </section>
  );
}

