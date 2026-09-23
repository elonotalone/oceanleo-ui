"use client";

import type { Computer } from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";

export type CliCardProps = {
  computer: Computer;
  initialProgram?: string;
  initialSessionId?: string;
};

export function CliCard({
  computer,
  initialProgram,
  initialSessionId,
}: CliCardProps) {
  const tt = useUI();

  return (
    <section
      className="flex min-h-80 flex-col rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
      data-oceanleo-cli-card
      data-initial-program={initialProgram || undefined}
      data-initial-session={initialSessionId || undefined}
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-neutral-800">
        <strong>{computer.name}</strong>
        <span className="text-xs text-zinc-500 dark:text-neutral-400">
          {tt(computer.node_online ? "在线" : "离线")}
        </span>
      </header>
      <div className="min-h-64 flex-1" data-oceanleo-cli-card-body />
    </section>
  );
}
