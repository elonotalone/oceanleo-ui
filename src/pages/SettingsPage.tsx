"use client";

// ============================================================================
// @oceanleo/ui — 统一「设置」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与 oceanleo 主站 /settings 对齐：个人资料 + 用量记录（每次调用的真实计费）。
// 各站把它包进自己的 <AppShell>。站点特有的「知识库」等区块由各站通过
// extraSections 插槽自填（主站才有 agent_knowledge 表）。
//
// 只依赖 react + @oceanleo/ui/lib。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { getUserEmail, getCreditHistory, type CreditEvent } from "../lib/auth";

export interface SettingsPageProps {
  /** 站点特有的额外区块（如主站的「知识库」），插在「用量记录」之前。 */
  extraSections?: ReactNode;
}

export function SettingsPage({ extraSections }: SettingsPageProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [history, setHistory] = useState<CreditEvent[]>([]);

  useEffect(() => {
    async function load() {
      setEmail(await getUserEmail());
      const h = await getCreditHistory();
      if (h.ok && h.data) setHistory(h.data.events || []);
    }
    load();
  }, []);

  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">设置</h1>

      <div className="mx-auto mt-8 max-w-xl space-y-8">
        <section className="v-fade-up">
          <h2 className="mb-3 text-[14px] font-semibold text-neutral-900">个人资料</h2>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-neutral-700">邮箱</span>
              <span className="text-[13px] text-neutral-900">{email || "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-neutral-700">语言</span>
              <span className="text-[13px] text-neutral-900">中文（简体）</span>
            </div>
          </div>
        </section>

        {extraSections}

        <section className="v-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-1 text-[14px] font-semibold text-neutral-900">用量记录</h2>
          <p className="mb-3 text-[12px] text-neutral-500">
            每一次调用的真实计费：输入 token / 输出 token / 模型 / 本次成本价（人民币，已含服务运维费）。
          </p>
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 p-6 text-center">
              <p className="text-[13px] text-neutral-500">暂无用量记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-neutral-200">
              <table className="w-full min-w-[560px] text-left text-[12px]">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">时间</th>
                    <th className="px-3 py-2 font-medium">说明</th>
                    <th className="px-3 py-2 font-medium">模型</th>
                    <th className="px-3 py-2 text-right font-medium">输入 token</th>
                    <th className="px-3 py-2 text-right font-medium">输出 token</th>
                    <th className="px-3 py-2 text-right font-medium">费用(¥)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {history.slice(0, 30).map((ev, i) => {
                    const meta = (ev.meta || {}) as Record<string, unknown>;
                    const promptTokens = Number(meta.prompt_tokens ?? 0);
                    const completionTokens = Number(meta.completion_tokens ?? 0);
                    const totalTokens = Number(meta.tokens ?? 0);
                    const model = String(meta.model || "");
                    const yuan = Number(ev.amount_yuan ?? 0);
                    const isUsage = ev.kind === "usage";
                    const realCny = Number(meta.price_cny ?? 0);
                    const label =
                      ev.kind === "topup"
                        ? "充值"
                        : ev.kind === "signup_grant"
                          ? "新用户体验金"
                          : ev.kind === "monthly_grant"
                            ? "每月赠金"
                            : ev.kind === "admin_reset"
                              ? "余额调整"
                              : ev.endpoint || ev.kind || "—";
                    return (
                      <tr key={ev.created_at || i} className="text-neutral-700 transition hover:bg-neutral-50">
                        <td className="whitespace-nowrap px-3 py-2">
                          {ev.created_at ? new Date(ev.created_at).toLocaleString("zh-CN") : "—"}
                        </td>
                        <td className="px-3 py-2">{String(label)}</td>
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
                            ? realCny > 0
                              ? `-${realCny.toFixed(realCny < 0.0001 ? 6 : 4)}`
                              : yuan.toFixed(4)
                            : yuan > 0
                              ? `+${yuan.toFixed(4)}`
                              : yuan.toFixed(4)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
