"use client";

import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AppSession } from "../lib/app-session";
import { AgentChat } from "./AgentChat";
import type { GoalApp } from "./app-catalog";
import type {
  GuideExample,
  GuideSection,
} from "./NavigatorGuide";
import { useWorkspaceRuntimeHydration } from "./workspace-runtime-hydration";
import { findLinkedAgentTaskId } from "./workspace-session-task";

export function IncompleteHistorySession({
  session,
  accent,
  onBack,
}: {
  session: AppSession;
  accent: string;
  onBack: () => void;
}) {
  const [taskId, setTaskId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void findLinkedAgentTaskId(session).then((id) => {
      if (alive) setTaskId(id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [session.id]);

  return (
    <LegacyHistoryPlayback
      taskId={taskId}
      siteId={session.site_id}
      appLabel={session.app_id}
      accent={accent}
      onBack={onBack}
    />
  );
}

export function LegacyHistoryPlayback({
  taskId,
  siteId,
  appLabel,
  accent,
  onBack,
}: {
  taskId: string | null | undefined;
  siteId: string;
  appLabel: string;
  accent: string;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full min-h-[420px] flex-col bg-white">
      <div className="flex shrink-0 justify-end border-b border-stone-100 px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-lg border border-stone-200 px-2.5 py-1 text-[12px] font-medium text-stone-600 hover:bg-stone-50"
        >
          返回我的任务
        </button>
      </div>
      <div className="min-h-0 flex-1">
        {taskId === undefined ? (
          <div className="grid h-full place-items-center text-[13px] text-stone-400">
            正在读取旧对话…
          </div>
        ) : taskId ? (
          <AgentChat
            key={taskId}
            siteId={siteId}
            taskId={taskId}
            appLabel={appLabel}
            accent={accent}
            headerHeight={49}
            libraryTabs={{ showFiles: true, showBrowser: true }}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center text-[13px] text-stone-400">
            该旧记录没有可回放的 Agent 对话。
          </div>
        )}
      </div>
    </div>
  );
}

export function withGuideDefaults(
  sections: GuideSection[] | undefined,
  app: GoalApp,
): GuideSection[] | undefined {
  const base = app.preset?.set;
  if (!sections || sections.length === 0) return sections;
  if (!base || Object.keys(base).length === 0) return sections;
  return sections.map((section) => ({
    ...section,
    examples: section.examples.map((example) => ({
      ...example,
      set: { ...base, ...(example.set || {}) },
    })),
  }));
}

export function withPresetCard(
  sections: GuideSection[] | undefined,
  app: GoalApp,
): GuideSection[] | undefined {
  const preset = app.preset;
  if (!preset || preset.prompt == null) return sections;
  const presetCard: GuideExample = {
    label: "标准灵感（含参数）",
    hint: "一键套用本成品的标准起手式（含推荐参数）",
    prompt: preset.prompt,
    set: preset.set,
    icon: "⭐",
    badge: "起手",
  };
  if (!sections || sections.length === 0) {
    return [{ title: "快速起手", examples: [presetCard] }];
  }
  const out = sections.map((section) => ({
    ...section,
    examples: [...section.examples],
  }));
  const last = out[out.length - 1];
  last.examples = [presetCard, ...last.examples];
  return out;
}

export function CatalogOps({
  app,
  renderOps,
  onEnterApp,
}: {
  app: GoalApp;
  renderOps: (app: GoalApp) => ReactNode;
  onEnterApp?: (app: GoalApp) => void;
}) {
  const hydration = useWorkspaceRuntimeHydration();
  useEffect(() => {
    onEnterApp?.(app);
    hydration?.markAppInitialized();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);
  return <div className="h-full">{renderOps(app)}</div>;
}
