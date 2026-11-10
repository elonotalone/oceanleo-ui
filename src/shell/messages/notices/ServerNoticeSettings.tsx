"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  forgetComputerNoticeSource,
  listComputerNoticeSources,
  updateComputerNoticeSource,
  type ComputerNoticeSource,
} from "../../../api/notifications";
import { useUI } from "../../../i18n/ui/useUI";

const EXAMPLE = 'oceanleo-node notify "备份完成"';
const keyOf = (item: ComputerNoticeSource) => JSON.stringify([item.computer_id, item.source]);

function SourceSwitch({ checked, disabled, label, onChange }: {
  checked: boolean; disabled: boolean; label: string; onChange: () => void;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
      className="inline-flex h-11 w-12 shrink-0 items-center justify-center rounded-full disabled:opacity-50">
      <span className={`relative inline-flex h-5 w-9 items-center rounded-full ${checked ? "bg-neutral-900" : "bg-neutral-300"}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
      </span>
    </button>
  );
}

export function ServerNoticeSettings() {
  const tt = useUI();
  const [items, setItems] = useState<ComputerNoticeSource[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const pending = useRef(new Set<string>());
  const generation = useRef(0);
  const alive = useRef(false);

  const load = useCallback(async () => {
    const id = ++generation.current;
    setPhase("loading");
    try {
      const result = await listComputerNoticeSources();
      if (!alive.current || id !== generation.current) return;
      if (!result.ok || !result.data) { setPhase("error"); return; }
      setItems(result.data.items);
      setPhase("ready");
    } catch {
      if (alive.current && id === generation.current) setPhase("error");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; generation.current += 1; };
  }, [load]);

  async function change(item: ComputerNoticeSource, patch: Partial<Pick<ComputerNoticeSource, "enabled" | "min_level">> | null) {
    const key = keyOf(item);
    // Lock synchronously as well as disabling the controls on the next render.
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setBusy(new Set(pending.current));
    setError(false);
    const index = items.findIndex((entry) => keyOf(entry) === key);
    setItems((current) => patch === null ? current.filter((entry) => keyOf(entry) !== key)
      : current.map((entry) => keyOf(entry) === key ? { ...entry, ...patch } : entry));
    try {
      const result = patch === null
        ? await forgetComputerNoticeSource(item.computer_id, item.source)
        : await updateComputerNoticeSource(item.computer_id, item.source, patch);
      if (!result.ok) throw new Error("notice source update failed");
    } catch {
      if (!alive.current) return;
      setItems((current) => {
        if (patch !== null) return current.map((entry) => keyOf(entry) === key ? item : entry);
        if (current.some((entry) => keyOf(entry) === key)) return current;
        const restored = [...current];
        restored.splice(Math.max(0, index), 0, item);
        return restored;
      });
      setError(true);
    } finally {
      pending.current.delete(key);
      if (alive.current) setBusy(new Set(pending.current));
    }
  }

  const groups = new Map<string, ComputerNoticeSource[]>();
  for (const item of items) groups.set(item.computer_id, [...(groups.get(item.computer_id) ?? []), item]);
  return (
    <section data-server-notice-settings="" aria-label={tt("服务器消息")}>
      <h3 className="mb-2 text-[13px] font-semibold tracking-tight">{tt("服务器消息")}</h3>
      <p className="mb-2 text-[12px] text-black/45 dark:text-white/45">
        {tt("来自已配对电脑的脚本消息会显示在 LeoChat 通知中。新来源默认接收。")}
      </p>
      {phase === "loading" ? <p role="status">{tt("正在加载…")}</p> : null}
      {phase === "error" ? (
        <div role="alert">
          <p>{tt("服务器消息设置暂时无法加载")}</p>
          <button type="button" className="underline" onClick={() => void load()}>{tt("重试")}</button>
        </div>
      ) : null}
      {error ? <p role="alert">{tt("更改未保存，已恢复原设置。请重试。")}</p> : null}
      {phase === "ready" && items.length === 0 ? (
        <div data-server-notice-empty="" className="space-y-2 text-[12px]">
          <p>{tt("还没有消息来源。在已配对电脑上运行下面的命令，来源会自动出现在这里。")}</p>
          <input aria-label={tt("消息命令示例")} className="w-full rounded-md border px-3 py-2" readOnly value={EXAMPLE} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="rounded-md bg-black/5 px-3 py-1.5 text-sm dark:bg-white/10" onClick={async () => {
            try { await navigator.clipboard.writeText(EXAMPLE); if (alive.current) setCopyState("copied"); }
            catch { if (alive.current) setCopyState("error"); }
          }}>{tt("复制命令")}</button>
          <span role="status">{copyState === "copied" ? tt("已复制") : copyState === "error" ? tt("无法复制，请选中命令后手动复制。") : ""}</span>
        </div>
      ) : null}
      {phase === "ready" ? [...groups].map(([computerId, sources]) => (
        <section key={computerId} className="mt-3" aria-label={sources[0].machine_name || computerId} data-server-notice-computer={computerId}>
          <h4 className="text-[13px] font-medium">{sources[0].machine_name || computerId}</h4>
          {sources.map((item) => {
            const waiting = busy.has(keyOf(item));
            const name = `${item.machine_name || item.computer_id} · ${item.source}`;
            return (
              <div key={keyOf(item)} className="border-b py-3" data-server-notice-source={item.source}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 break-words text-[13px]">{item.source}</span>
                  <SourceSwitch checked={item.enabled} disabled={waiting} label={`${name} · ${tt("接收消息")}`} onChange={() => void change(item, { enabled: !item.enabled })} />
                </div>
                <div className="flex items-center justify-between gap-3 text-[12px]">
                  <span>{tt("只收紧急")}</span>
                  <SourceSwitch checked={item.min_level === "urgent"} disabled={waiting} label={`${name} · ${tt("只收紧急")}`} onChange={() => void change(item, { min_level: item.min_level === "urgent" ? "normal" : "urgent" })} />
                </div>
                <button type="button" aria-label={`${name} · ${tt("忘记来源")}`} disabled={waiting} className="text-[12px] underline disabled:opacity-50" onClick={() => void change(item, null)}>{tt("忘记来源")}</button>
              </div>
            );
          })}
        </section>
      )) : null}
      {phase === "ready" && items.length > 0 ? <p className="mt-2 text-[12px] text-black/45 dark:text-white/45">{tt("忘记后，该来源下次发消息时会以默认设置重新出现。")}</p> : null}
    </section>
  );
}
