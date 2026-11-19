"use client";

import type { AvailableCommand, UsageUpdate } from "../../acp/types";
import { useUI } from "../../i18n/ui/useUI";
import { contextPercent, matchingCommands } from "./acp-conversation";

/** Only commands and context limits actually reported by this ACP session. */
export function AcpSessionControls({ commands, usage, input, onChange, error, disabled = false }: {
  commands: readonly AvailableCommand[];
  usage: UsageUpdate | null;
  input: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const tt = useUI();
  const matches = matchingCommands(commands, input);
  const percent = usage ? contextPercent(usage.used, usage.size) : null;
  return <div className="space-y-1" data-acp-session-controls="">
    {error && <p role="alert" className="px-2 text-[12px] text-rose-500">{tt("会话选项未能加载：{message}", { message: error })}</p>}
    {!disabled && matches.length > 0 && <div role="menu" aria-label={tt("可用命令")} className="max-h-48 overflow-y-auto rounded-xl border border-stone-200 bg-white p-1 shadow-sm">
      {matches.map((command) => <button type="button" role="menuitem" key={command.name}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChange(`/${command.name} `)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-stone-100 focus-visible:bg-stone-100">
        <span className="shrink-0 text-stone-800">/{command.name}</span>
        <span className="truncate text-stone-500">{command.description}</span>
      </button>)}
    </div>}
    {usage && percent !== null && <div className="flex items-center justify-end gap-2 px-2 text-[12px] text-stone-500" data-acp-context="">
      <span>{tt("上下文已用 {percent}%", { percent })}</span>
      <meter min={0} max={usage.size} value={Math.min(usage.used, usage.size)} aria-label={tt("上下文用量")} className="h-1.5 w-16" />
    </div>}
  </div>;
}
