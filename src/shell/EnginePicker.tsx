"use client";

// ============================================================================
// @oceanleo/ui — agent 引擎选择器（Stage C, 2026-06-27）
// ----------------------------------------------------------------------------
// 主页输入框旁的「引擎选择」按键。与模型选择(ModelPicker)并列、风格一致。
//
// 两类引擎（后端 /v1/agent/engines）：
//   - OceanLeo Agent（平台原生）：用平台 key 跑闭环，零服务费。默认选它。
//   - 外部引擎 Claude Code / Codex / opencode / Cline：在 gVisor 沙箱里跑官方/
//     开源 agent CLI，必须用用户自带 key（BYOK）。未配 key 的引擎下拉里标灰 +
//     给「去 API 页加 key」入口。
//
// 选择按「站点 × 用户」记在 localStorage；选中后回调 onChange(engineId)，
// 调用方在 createTask 时带上 engine 字段。
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { type AgentEngine, listEngines } from "../lib/agent";
import { getUserId } from "../lib/auth/client";
import { IconCheck, IconChevronDown } from "./icons";

export interface EnginePickerProps {
  siteId?: string;
  /** 选中引擎变化回调（参数是引擎 id：oceanleo|claude-code|codex|opencode|cline）。 */
  onChange?: (engineId: string) => void;
  /** API 管理页路由（默认 /api），下拉里「去加 key」跳这。 */
  apiHref?: string;
  className?: string;
  align?: "left" | "right";
}

const STORE_PREFIX = "oceanleo_engine_pick_v1";

function storeKey(siteId: string, userId: string) {
  return `${STORE_PREFIX}:${siteId}:${userId}`;
}

export function EnginePicker({
  siteId = "default",
  onChange,
  apiHref = "/api",
  className = "",
  align = "left",
}: EnginePickerProps) {
  const [engines, setEngines] = useState<AgentEngine[]>([]);
  const [picked, setPicked] = useState<string>("oceanleo");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("anon");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    getUserId().then((id) => alive && setUserId(id || "anon"));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    listEngines().then((r) => {
      if (alive && r.ok && r.data) setEngines(r.data.engines);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  // restore persisted choice
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(storeKey(siteId, userId));
      if (raw) {
        setPicked(raw);
        onChange?.(raw);
      }
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, userId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(e: AgentEngine) {
    // external engine without a key → don't select; bounce to API page.
    if (e.external && !e.key_ready) {
      window.location.href = `${apiHref}?add=${encodeURIComponent(e.provider)}`;
      return;
    }
    setPicked(e.id);
    onChange?.(e.id);
    setOpen(false);
    try {
      localStorage.setItem(storeKey(siteId, userId), e.id);
    } catch {
      /* ignore */
    }
  }

  const current = engines.find((e) => e.id === picked);
  const currentLabel = current?.label || "OceanLeo Agent";
  // short label for the chip (strip the parenthetical detail)
  const chipLabel = currentLabel.replace(/[（(].*$/, "").trim();

  return (
    <div className={`relative ${className}`} ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="选择 agent 引擎"
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] transition ${
          open
            ? "border-neutral-300 bg-neutral-50"
            : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        <span className="text-neutral-400">
          <EngineGlyph />
        </span>
        <span className="font-medium text-neutral-700">引擎</span>
        <span className="max-w-[150px] truncate text-neutral-900">· {chipLabel}</span>
        <span className={`text-neutral-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <IconChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>

      {open && (
        <div
          className={`v-scale-in absolute top-full z-40 mt-1 max-h-[400px] w-[min(22rem,88vw)] overflow-y-auto rounded-xl border border-neutral-200 bg-white py-1.5 shadow-xl ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <p className="px-3.5 pb-1 pt-2 text-[11px] font-medium text-neutral-400">
            选择 agent 引擎
          </p>
          {engines.map((e) => {
            const locked = e.external && !e.key_ready;
            const selected = e.id === picked;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => pick(e)}
                className={`flex w-full items-start justify-between gap-2 px-3.5 py-2.5 text-left transition hover:bg-neutral-50 ${
                  selected ? "bg-neutral-50" : ""
                }`}
              >
                <span className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-neutral-900">
                    {e.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-neutral-500">
                    {e.external
                      ? locked
                        ? `需要你自己的 ${e.provider} 密钥 · 点此去「API」页添加`
                        : `自带 ${e.provider} 密钥（BYOK · 不走平台计费）`
                      : "平台托管 · 零服务费"}
                  </p>
                </span>
                {selected ? (
                  <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-neutral-900" />
                ) : locked ? (
                  <LockGlyph />
                ) : null}
              </button>
            );
          })}
          <a
            href={apiHref}
            className="mt-1 block border-t border-neutral-100 px-3.5 py-2.5 text-[12px] text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-800"
          >
            + 在「API」页管理你的密钥（外部引擎用）
          </a>
        </div>
      )}
    </div>
  );
}

function EngineGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" strokeLinecap="round" />
    </svg>
  );
}
