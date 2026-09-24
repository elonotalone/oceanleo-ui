"use client";

// 设置窗「个性化」面板：主站与所有子站同一份。上半是记忆（总开关、来自对话的记忆、
// 从其他 AI 导入），下半是自定义指令。偏好与记忆分两路读：个性化端点比记忆 CRUD
// 晚上线，旧网关上前者 404 时开关与指令区只说「还没启用」，记忆列表照常可用。

import { useCallback, useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  getPersonalization,
  listMemories,
  type MemoryItem,
  type PersonalizationPrefs,
} from "../../../lib/personalization-api";
import { AuthDialog } from "../../AuthDialog";
import { CustomInstructionsCard } from "./CustomInstructionsCard";
import { MemoryImportRow } from "./MemoryImport";
import { MemoryListCard } from "./MemoryListCard";
import { MemoryToggleCard } from "./MemoryToggleCard";
import { PRIMARY, accentStyle } from "./parts";
import type { MemoriesState, PrefsState } from "./state";

export type PersonalizationSectionProps = {
  accent?: string;
};

export function PersonalizationSection({ accent }: PersonalizationSectionProps) {
  const tt = useUI();
  const [prefs, setPrefs] = useState<PrefsState>({ status: "loading" });
  const [memories, setMemories] = useState<MemoriesState>({ status: "loading" });
  const [prefsLoads, setPrefsLoads] = useState(0);
  const [memoryLoads, setMemoryLoads] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPrefs({ status: "loading" });
    void getPersonalization().then((res) => {
      if (cancelled) return;
      setPrefs(res.ok ? { status: "ready", prefs: res.data } : { status: "failed", code: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [prefsLoads]);

  useEffect(() => {
    let cancelled = false;
    void listMemories().then((res) => {
      if (cancelled) return;
      setMemories(res.ok ? { status: "ready", items: res.data } : { status: "failed", code: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [memoryLoads]);

  const updatePrefs = useCallback(
    (update: (current: PersonalizationPrefs) => PersonalizationPrefs) =>
      setPrefs((state) => (state.status === "ready" ? { status: "ready", prefs: update(state.prefs) } : state)),
    [],
  );
  const updateMemories = useCallback(
    (update: (items: MemoryItem[]) => MemoryItem[]) =>
      setMemories((state) => (state.status === "ready" ? { status: "ready", items: update(state.items) } : state)),
    [],
  );
  const reloadPrefs = useCallback(() => setPrefsLoads((n) => n + 1), []);
  const reloadMemories = useCallback(() => setMemoryLoads((n) => n + 1), []);
  const retryMemories = useCallback(() => {
    setMemories({ status: "loading" });
    setMemoryLoads((n) => n + 1);
  }, []);

  const signedOut =
    (prefs.status === "failed" && prefs.code === "signed_out") ||
    (memories.status === "failed" && memories.code === "signed_out");
  if (signedOut) {
    return (
      <SignedOutNotice
        accent={accent}
        onSignedIn={() => {
          reloadPrefs();
          retryMemories();
        }}
      />
    );
  }

  const importAvailable =
    prefs.status === "loading" ? null : !(prefs.status === "failed" && prefs.code === "not_available");

  return (
    <div data-settings-pane="personalization" className="space-y-8">
      <section className="space-y-3" data-personalization-section="memory">
        <h3 className="text-[15px] font-semibold text-neutral-900">{tt("记忆")}</h3>
        <MemoryToggleCard prefs={prefs} onPrefsChange={updatePrefs} onRetry={reloadPrefs} />
        <MemoryListCard
          accent={accent}
          memories={memories}
          onMemoriesChange={updateMemories}
          onRetry={retryMemories}
        />
        <MemoryImportRow accent={accent} available={importAvailable} onImported={reloadMemories} />
      </section>
      <CustomInstructionsCard
        accent={accent}
        prefs={prefs}
        loadKey={prefsLoads}
        onPrefsChange={updatePrefs}
        onRetry={reloadPrefs}
      />
    </div>
  );
}

function SignedOutNotice({ accent, onSignedIn }: { accent?: string; onSignedIn: () => void }) {
  const tt = useUI();
  const [showAuth, setShowAuth] = useState(false);
  return (
    <div
      data-settings-pane="personalization"
      data-personalization-signed-out
      className="v-fade-up mx-auto max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 text-center text-[14px] text-neutral-600"
    >
      {showAuth ? (
        <AuthDialog
          onClose={() => setShowAuth(false)}
          onSuccess={() => {
            setShowAuth(false);
            onSignedIn();
          }}
        />
      ) : null}
      <p>{tt("请先登录后再管理账户设置。")}</p>
      <button
        type="button"
        className={`${PRIMARY} mt-5`}
        style={accentStyle(accent)}
        onClick={() => setShowAuth(true)}
      >
        {tt("登录")}
      </button>
    </div>
  );
}
