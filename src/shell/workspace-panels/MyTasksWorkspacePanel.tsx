"use client";

import { useRouter } from "next/navigation";
import { useUI } from "../../i18n/ui/useUI";
import { HistoryInlineList } from "../HistoryMasterDetail";
import { withFusionMountPrefix } from "../workspace-route";

/** Same list and activity subscription as My Tasks in the main navigation. */
export function MyTasksWorkspacePanel() {
  const tt = useUI();
  const router = useRouter();
  return (
    <section data-my-tasks-workspace-panel className="flex min-h-0 flex-col">
      <div className="flex justify-end px-3 py-2">
        <button type="button" data-my-tasks-new onClick={() => router.push(withFusionMountPrefix("/", window.location.pathname))}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:bg-stone-100">
          {tt("新任务")}
        </button>
      </div>
      <HistoryInlineList />
    </section>
  );
}
