"use client";

import { useState } from "react";
import type { Computer } from "../../../lib/cloud-computer-api";
import { useUI } from "../../../i18n/ui/useUI";
import { tone } from "../server-page/tone";
import { AgentDialogPane } from "./AgentDialogPane";
import { useAgentDialog } from "./useAgentDialogController";
import {
  PROGRAM_LABEL,
  WS_PROGRAMS,
  type AgentProgram,
} from "./types";

const PROGRAMS: readonly AgentProgram[] = ["oceanleo", ...WS_PROGRAMS];

function agentProgram(value: string | undefined): AgentProgram | null {
  return PROGRAMS.find((program) => program === value) ?? null;
}

export function AcpCard({
  computer,
  initialProgram,
  initialSessionId,
}: {
  computer: Computer;
  initialProgram?: string;
  initialSessionId?: string;
}) {
  const tt = useUI();
  const [selected, setSelected] = useState<AgentProgram | null>(() =>
    agentProgram(initialProgram),
  );
  const dialog = useAgentDialog({
    computerId: computer.id,
    sessionId: initialSessionId ?? "",
    enabled: true,
  });

  function open(program: AgentProgram) {
    dialog.setProgram(program);
    setSelected(program);
  }

  if (selected) {
    return (
      <section
        className={`flex min-h-[34rem] min-w-0 flex-col overflow-hidden rounded-2xl border ${tone.border} ${tone.panel}`}
        data-oceanleo-acp-card=""
        data-oceanleo-acp-program={selected}
      >
        <AgentDialogPane dialog={dialog} onBack={() => setSelected(null)} />
      </section>
    );
  }

  return (
    <section
      className={`min-h-[34rem] rounded-2xl border p-5 ${tone.border} ${tone.panel}`}
      data-oceanleo-acp-card=""
      data-oceanleo-acp-picker=""
    >
      <h2 className="text-lg font-semibold">{tt("AI 对话")}</h2>
      <p className={`mt-1 text-sm ${tone.muted}`}>
        {tt("选择在这台服务器上运行的 AI agent。")}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PROGRAMS.map((program) => {
          const status =
            program === "oceanleo"
              ? null
              : dialog.programs.find((item) => item.id === program);
          const installed = program === "oceanleo" || status?.installed === true;
          return (
            <button
              key={program}
              type="button"
              className={`rounded-xl border p-4 text-left ${tone.border} ${tone.hover}`}
              data-oceanleo-acp-agent={program}
              onClick={() => open(program)}
            >
              <span className="block text-sm font-medium">
                {PROGRAM_LABEL[program]}
              </span>
              <span className={`mt-2 block text-xs ${tone.muted}`}>
                {installed
                  ? status?.version
                    ? tt("已安装 · {version}", { version: status.version })
                    : tt("已安装")
                  : tt("未安装")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
