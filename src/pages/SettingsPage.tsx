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

export interface SettingsPageProps {
  /** 站点特有的额外区块（如主站的「知识库」）。 */
  extraSections?: ReactNode;
}

export function SettingsPage({ extraSections }: SettingsPageProps) {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    getUserEmail().then(setEmail);
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
          <h2 className="mb-1 text-[14px] font-semibold text-neutral-900">用量记录与计费</h2>
          <p className="mb-3 text-[12px] leading-relaxed text-neutral-500">
            用量记录（每次调用的真实计费 + 可逐字审计的调用内容）、token 余额、
            自带 API key（BYOK）与模型选择，已统一搬到「API」页。
          </p>
          <a
            href="/api"
            className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
          >
            前往 API 页 →
          </a>
        </section>
      </div>
    </div>
  );
}
