"use client";

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import type { EditorAgentChip } from "../hosted-editor/index";
import {
  readAgentSelection,
  subscribeAgentSelection,
  subscribeEditorChips,
} from "../agent-review/inbox";
import { refreshAgentSelectionFromDom } from "../agent-review/selection-live";
import { currentPluginCommandSurface } from "../plugin-command";
import { chipsForEditor, promptForChip } from "./catalog";

export function QuickActionChipsView({
  chips,
  onPick,
  title,
}: {
  chips: readonly EditorAgentChip[];
  onPick: (chip: EditorAgentChip) => void;
  title: string;
}) {
  if (!chips.length) return null;
  return (
    <div data-quick-actions className="space-y-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-400">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            data-quick-action-chip={chip.id}
            data-quick-action-kind={chip.kind}
            onClick={() => onPick(chip)}
            className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[12px] text-stone-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:border-indigo-300 hover:text-indigo-800"
          >
            {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function QuickActionChips({
  editorId,
  onFire,
}: {
  editorId?: string | null;
  onFire: (prompt: string, chip: EditorAgentChip) => void;
}) {
  const tt = useUI();
  const [, bump] = useState(0);
  useEffect(() => {
    const a = subscribeAgentSelection(() => bump((n) => n + 1));
    const b = subscribeEditorChips(() => bump((n) => n + 1));
    return () => {
      a();
      b();
    };
  }, []);
  const surface = currentPluginCommandSurface();
  const resolved = editorId || surface?.editorId || "";
  refreshAgentSelectionFromDom();
  const selection = readAgentSelection();
  const chips = chipsForEditor(resolved, selection?.kind ?? null);
  return (
    <QuickActionChipsView
      title={tt("快捷动作")}
      chips={chips}
      onPick={(chip) => {
        const prompt = promptForChip(chip, {
          selection: selection?.summary || "",
          document: "",
        });
        onFire(prompt, chip);
      }}
    />
  );
}
