"use client";

import { useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import {
  GUIDES,
  isLeoProgram,
  readGuideStep,
  writeGuideStep,
  type LeoProgramId,
} from "./guides";

export function GuideCard({
  computerId,
  program,
  terminalReady = true,
  onType,
}: {
  computerId: string;
  program: LeoProgramId;
  terminalReady?: boolean;
  onType: (command: string) => void;
}) {
  const tt = useUI();
  const guide = GUIDES[program];
  const [step, setStep] = useState(() =>
    readGuideStep(computerId, program, guide.steps.length),
  );
  if (!isLeoProgram(program)) return null;
  const current = guide.steps[Math.min(step, guide.steps.length - 1)];
  if (!current) return null;
  const command = current.command;

  function advance() {
    const next = Math.min(step + 1, guide.steps.length - 1);
    setStep(next);
    writeGuideStep(computerId, program, next);
  }

  return (
    <div
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-3 text-[12px]"
      data-oceanleo-cc-leo-guide={program}
    >
      <p className="text-neutral-400">
        {tt("第 {n} 步，共 {total} 步", { n: step + 1, total: guide.steps.length })}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-neutral-100">{tt(current.sentence)}</p>
      {command ? (
        <div className="mt-2">
          <code className="block overflow-x-auto whitespace-pre rounded bg-neutral-950 px-2 py-1 text-neutral-200">
            {command}
          </code>
          <button
            type="button"
            data-oceanleo-cc-leo-guide-send
            className="mt-2 rounded-lg bg-neutral-800 px-2 py-1 text-neutral-100 hover:bg-neutral-700"
            onClick={() => onType(command)}
          >
            {tt("替我输到终端")}
          </button>
          {!terminalReady ? (
            <p className="mt-1 text-amber-300">{tt("终端现在不能输入。先重新打开 Shell。")}</p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        data-oceanleo-cc-leo-guide-done
        className="mt-2 rounded-lg px-2 py-1 text-neutral-300 hover:bg-neutral-800"
        onClick={advance}
      >
        {tt("我做完了")}
      </button>
    </div>
  );
}
