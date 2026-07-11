"use client";

// ============================================================================
// @oceanleo/ui — 统一「设置」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与 oceanleo 主站 /settings 对齐：个人资料。
// 2026-06-23：用量记录（每次调用真实计费 + 内容审计）已迁到 /api 页，这里只留
// 个人资料 + 一个指向 /api 的入口。各站把它包进自己的 <AppShell>；站点特有区块
// 由各站通过 extraSections 插槽自填（主站才有 agent_knowledge 表）。
//
// 只依赖 react + @oceanleo/ui/lib。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { getUserEmail } from "../lib/auth";
import { PageHeader } from "./PageHeader";
import { useUI } from "../i18n/ui/useUI";

export interface SettingsPageProps {
  /** 站点特有的额外区块（如主站的「知识库」）。 */
  extraSections?: ReactNode;
}

export function SettingsPage({ extraSections }: SettingsPageProps) {
  const tt = useUI();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getUserEmail().then(setEmail);
  }, []);

  return (
    <div className="px-8 py-6">
      <PageHeader title={tt("设置")} />

      <div className="mx-auto mt-8 max-w-xl space-y-8">
        <section className="v-fade-up">
          <h2 className="mb-3 text-[14px] font-semibold text-neutral-900">{tt("个人资料")}</h2>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-neutral-700">{tt("邮箱")}</span>
              <span className="text-[13px] text-neutral-900">{email || "—"}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] text-neutral-700">{tt("语言")}</span>
              <span className="text-[13px] text-neutral-900">{tt("中文（简体）")}</span>
            </div>
          </div>
        </section>

        {extraSections}

        {/* 用量记录 2026-07-02 起独立成「Cost」页（settings / api 均不再内嵌）。 */}
        <section className="v-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-1 text-[14px] font-semibold text-neutral-900">{tt("用量记录与计费")}</h2>
          <p className="mb-3 text-[12px] leading-relaxed text-neutral-500">
            {tt("用量柱状图与每次调用的真实计费记录在「Cost」页；token 余额、\n            自带 API key（BYOK）与模型选择在「AI 模型」页。")}
          </p>
          <div className="flex gap-2">
            <a
              href="/cost"
              className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
            >
              {tt("前往 Cost 页 →")}
            </a>
            <a
              href="/api"
              className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              {tt("前往 AI 模型页 →")}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
