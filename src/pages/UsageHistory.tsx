"use client";

// ============================================================================
// @oceanleo/ui — 用量记录表（含「点开看每次调用发给/得到 API 的完整内容」审计）
// ----------------------------------------------------------------------------
// 2026-06-23：从 /settings 迁到 /api。每行展示一次调用的真实计费（输入/输出 token、
// 模型、成本价＝厂商 token 市场价，OceanLeo 不加价）。带 request_id 的「usage」行
// 可点「查看内容」，拉 /v1/audit/{request_id} 弹窗展示：发给模型的完整内容（含各站
// 灌的 system prompt）+ 模型返回的完整内容（文本全文 / 图片）。仅保留 24 小时、仅本人可读。
// ============================================================================

import { useEffect, useState } from "react";
import {
  getCreditHistory,
  getAudit,
  type CreditEvent,
  type AuditRecord,
  type AuditMedia,
} from "../lib/auth";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function eventLabel(ev: CreditEvent, tt: UITranslate): string {
  switch (ev.kind) {
    case "topup":
      return tt("充值");
    case "signup_grant":
      return tt("新用户体验金");
    case "monthly_grant":
      return tt("每月赠金");
    case "admin_reset":
      return tt("余额调整");
    default:
      return ev.endpoint || ev.kind || "—";
  }
}

export function UsageHistory({
  limit = 60,
  maxHeight,
}: {
  /** 拉取条数（Cost 页传大值）。 */
  limit?: number;
  /** 列表内部滚动的最大高度（如 "480px"）；传了则表格区内部上下滚动。 */
  maxHeight?: string;
} = {}) {
  const tt = useUI();
  const [history, setHistory] = useState<CreditEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [auditId, setAuditId] = useState<string>("");

  useEffect(() => {
    getCreditHistory(limit).then((h) => {
      if (h.ok && h.data) setHistory(h.data.events || []);
      setLoaded(true);
    });
  }, [limit]);

  return (
    <section className="v-fade-up" style={{ animationDelay: "60ms" }}>
      <h2 className="mb-1 text-[14px] font-semibold text-neutral-900">{tt("用量记录")}</h2>
      <p className="mb-3 text-[12px] leading-relaxed text-neutral-500">
        {tt("每一次调用的真实计费：输入 token / 输出 token / 模型 / 本次成本价（人民币）。\n        费用即为该模型对应厂商的 token 市场价，OceanLeo 不加价。点「查看内容」可审计\n        本次发给模型与模型返回的全部内容（含系统提示词、图片），仅保留 24 小时、仅你本人可见。")}
      </p>
      {loaded && history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
          <p className="text-[13px] text-neutral-500">{tt("暂无用量记录")}</p>
        </div>
      ) : (
        <div
          className="overflow-x-auto overflow-y-auto rounded-xl border border-neutral-200"
          style={maxHeight ? { maxHeight } : undefined}
        >
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="sticky top-0 z-10 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-3 py-2 font-medium">{tt("时间")}</th>
                <th className="px-3 py-2 font-medium">{tt("说明")}</th>
                <th className="px-3 py-2 font-medium">{tt("模型")}</th>
                <th className="px-3 py-2 text-right font-medium">{tt("输入 token")}</th>
                <th className="px-3 py-2 text-right font-medium">{tt("输出 token")}</th>
                <th className="px-3 py-2 text-right font-medium">{tt("费用(¥)")}</th>
                <th className="px-3 py-2 text-right font-medium">{tt("内容")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {history.slice(0, limit).map((ev, i) => {
                const meta = (ev.meta || {}) as Record<string, unknown>;
                const promptTokens = toNum(meta.prompt_tokens);
                const completionTokens = toNum(meta.completion_tokens);
                const totalTokens = toNum(meta.tokens);
                const model = String(meta.model || "");
                const yuan = toNum(ev.amount_yuan);
                const isUsage = ev.kind === "usage";
                const realCny = toNum(meta.price_cny);
                const requestId = String(meta.request_id || "");
                const isByok = String(meta.key_mode || "") === "byok";
                return (
                  <tr
                    key={ev.created_at || i}
                    className="text-neutral-700 transition hover:bg-neutral-50"
                  >
                    <td className="whitespace-nowrap px-3 py-2">
                      {ev.created_at
                        ? new Date(ev.created_at).toLocaleString("zh-CN")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{eventLabel(ev, tt)}</td>
                    <td className="px-3 py-2 text-neutral-500">{model || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {promptTokens > 0 ? promptTokens.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {completionTokens > 0
                        ? completionTokens.toLocaleString()
                        : totalTokens > 0 && promptTokens === 0
                          ? totalTokens.toLocaleString()
                          : "—"}
                    </td>
                    <td
                      className={[
                        "px-3 py-2 text-right tabular-nums",
                        isUsage || yuan < 0 ? "" : "text-emerald-600",
                      ].join(" ")}
                    >
                      {isUsage
                        ? isByok
                          ? tt("自带 key · 免费")
                          : realCny > 0
                            ? `-${realCny.toFixed(realCny < 0.0001 ? 6 : 4)}`
                            : yuan.toFixed(4)
                        : yuan > 0
                          ? `+${yuan.toFixed(4)}`
                          : yuan.toFixed(4)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isUsage && requestId ? (
                        <button
                          type="button"
                          onClick={() => setAuditId(requestId)}
                          className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-50"
                        >
                          {tt("查看内容")}
                        </button>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {auditId && <AuditModal requestId={auditId} onClose={() => setAuditId("")} />}
    </section>
  );
}

// 弹窗：拉 /v1/audit/{request_id}，展示发给 API / 从 API 得到的完整内容。
function AuditModal({
  requestId,
  onClose,
}: {
  requestId: string;
  onClose: () => void;
}) {
  const tt = useUI();
  const [record, setRecord] = useState<AuditRecord | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getAudit(requestId).then((r) => {
      if (!alive) return;
      if (r.ok && r.data) setRecord(r.data);
      else setError(r.error || tt("审计内容不存在或已过期（仅保留 24 小时）。"));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [requestId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      // 只在真正点到背景层时关闭（避免子元素 / 未来嵌入的 portal 弹窗点击冒泡误关，
      // 与共享 Modal / TeamRosterModal 同款守卫）。
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <h3 className="text-[14px] font-semibold text-neutral-900">{tt("本次调用内容审计")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[18px] leading-none text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
            aria-label={tt("关闭")}
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="py-10 text-center text-[13px] text-neutral-400">{tt("加载中…")}</p>
          ) : error ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
              {error}
            </p>
          ) : record ? (
            <AuditBody record={record} />
          ) : null}
        </div>
        <div className="border-t border-neutral-100 px-5 py-2.5 text-center text-[11px] text-neutral-400">
          {tt("此内容仅你本人可见，调用满 24 小时后自动删除。")}
        </div>
      </div>
    </div>
  );
}

function AuditBody({ record }: { record: AuditRecord }) {
  const tt = useUI();
  const req = record.request_json || {};
  const resp = record.response_json || {};
  const messages = Array.isArray((req as { messages?: unknown }).messages)
    ? ((req as { messages: { role?: string; content?: unknown }[] }).messages)
    : [];
  const respText =
    typeof (resp as { text?: unknown }).text === "string"
      ? (resp as { text: string }).text
      : "";
  const media = Array.isArray((resp as { media?: unknown }).media)
    ? ((resp as { media: AuditMedia[] }).media)
    : [];

  return (
    <div className="space-y-4 text-[12px]">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 px-4 py-3 text-neutral-600 sm:grid-cols-4">
        <Meta label={tt("模型")} value={record.model || "—"} />
        <Meta label={tt("供应商")} value={record.provider || "—"} />
        <Meta
          label={tt("方式")}
          value={record.key_mode === "byok" ? tt("自带 key（免费）") : tt("平台")}
        />
        <Meta
          label={tt("成本")}
          value={
            record.key_mode === "byok"
              ? tt("免费")
              : `¥${toNum(record.price_cny).toFixed(6)}`
          }
        />
      </div>

      {/* 发给 API 的内容（含 system prompt） */}
      <div>
        <p className="mb-1.5 font-semibold text-neutral-900">{tt("发给模型的内容")}</p>
        {messages.length > 0 ? (
          <div className="space-y-2">
            {messages.map((m, i) => (
              <div
                key={i}
                className="rounded-lg border border-neutral-200 px-3 py-2"
              >
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-400">
                  {m.role === "system"
                    ? tt("系统提示词（本站灌给模型）")
                    : m.role === "assistant"
                      ? tt("助手")
                      : tt("用户")}
                </p>
                <pre className="whitespace-pre-wrap break-words font-sans text-[12px] leading-relaxed text-neutral-700">
                  {typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <Json obj={req} />
        )}
      </div>

      {/* 从 API 得到的内容 */}
      <div>
        <p className="mb-1.5 font-semibold text-neutral-900">{tt("模型返回的内容")}</p>
        {respText ? (
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-neutral-200 px-3 py-2 font-sans text-[12px] leading-relaxed text-neutral-700">
            {respText}
          </pre>
        ) : media.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {media.map((mm, i) => {
              const url = mm.snapshot || mm.src;
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-neutral-200"
                >
                  <img src={url} alt="" className="h-28 w-full object-cover" />
                  {!mm.snapshot && (
                    <span className="block px-2 py-1 text-[10px] text-amber-600">
                      {tt("原始链接（可能已过期）")}
                    </span>
                  )}
                </a>
              );
            })}
          </div>
        ) : (
          <Json obj={resp} />
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-neutral-400">{label}</p>
      <p className="truncate font-medium text-neutral-800">{value}</p>
    </div>
  );
}

function Json({ obj }: { obj: unknown }) {
  return (
    <pre className="max-h-60 overflow-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-[11px] leading-relaxed text-neutral-600">
      {JSON.stringify(obj, null, 2)}
    </pre>
  );
}
