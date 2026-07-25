"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppSession } from "../lib/app-session";
import { AgentChat } from "./AgentChat";
import type { GoalApp } from "./app-catalog";
import { useOpsFillerReady, useRequestOneShotFill } from "./guide-context";
import type {
  GuideExample,
  GuideSection,
} from "./NavigatorGuide";
import { useCatalogDeepLinkFill } from "./site-catalog-deeplink";
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

  // 深链一次性预填。就绪信号是显式的：填充器未注册时请求排队，注册那一刻由总线执行，
  // 这里只负责「同一个 app 只请求一次」，并在灌进去后立刻通知宿主消费掉 URL 意图，
  // 这样重挂载、刷新、以及用户手动清空之后都不会被回灌。
  const pending = useCatalogDeepLinkFill();
  const requestOneShotFill = useRequestOneShotFill();
  const fillerReady = useOpsFillerReady();
  const requestedRef = useRef("");
  useEffect(() => {
    if (!pending || pending.appId !== app.id) return;
    if (requestedRef.current === app.id) return;
    requestedRef.current = app.id;
    const applied = requestOneShotFill({
      scope: app.id,
      text: pending.fill.prompt,
      opts: pending.fill.set ? { set: pending.fill.set } : undefined,
    });
    if (applied) pending.onConsumed(app.id);
    // `fillerReady` 只是就绪信号的显式依赖：晚注册的填充器由总线负责冲刷排队请求，
    // 这里在就绪后再跑一次只为把「已灌入」上报给宿主。
  }, [app.id, pending, requestOneShotFill]);
  useEffect(() => {
    if (!pending || pending.appId !== app.id) return;
    if (requestedRef.current !== app.id || !fillerReady) return;
    pending.onConsumed(app.id);
  }, [app.id, fillerReady, pending]);

  return <div className="h-full">{renderOps(app)}</div>;
}
