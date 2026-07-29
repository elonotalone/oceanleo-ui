"use client";

// ============================================================================
// @oceanleo/ui — 统一「设置」页内容（不含侧栏 shell）
// ----------------------------------------------------------------------------
// 与 oceanleo 主站 /settings 对齐：个人资料 · 知识库 · 用量记录入口。
// 2026-06-23：用量记录（每次调用真实计费 + 内容审计）已迁到「Cost」页，这里只留
// 个人资料 + 知识库 + 指向 /cost 与 /api 的入口。各站把它包进自己的 <AppShell>。
//
// 2026-07-29：本组件补成各站 components/AccountSettings.tsx（121 行、32 站逐字节
// 相同）的**超集**，各站换 2 行 re-export shim 不会丢功能。从分叉吸收进来的三项：
//   1. oceanleoConfigured() 为假时的「登录服务尚未配置」分支
//   2. 未登录分支「请先登录后再管理账户设置。」（此前共享版会给未登录用户看一张
//      空的个人资料卡，邮箱永远是「—」）
//   3. 「知识库」区块（默认是指向主站的入口卡片；主站自己有 agent_knowledge 表，
//      用 extraSections 传真正的增删改查并把 knowledgeBaseLink 关掉）
//
// 只依赖 react + @oceanleo/ui/lib。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { browserClient, oceanleoConfigured, getUserEmail } from "../lib/auth";
import { PageHeader } from "./PageHeader";
import { useUI } from "../i18n/ui/useUI";

export interface SettingsPageProps {
  /** 站点特有的额外区块（如主站的「知识库」增删改查）。排在个人资料之后。 */
  extraSections?: ReactNode;
  /**
   * 是否显示默认的「知识库」入口卡片（指向主站 oceanleo.com/settings）。
   * 默认 true（与 32 站分叉一致）。主站自己就是那个落点，用 extraSections
   * 渲染真正的知识库时传 false，避免出现指向自己的入口。
   */
  knowledgeBaseLink?: boolean;
}

export function SettingsPage({ extraSections, knowledgeBaseLink = true }: SettingsPageProps) {
  const tt = useUI();
  const configured = oceanleoConfigured();
  const [email, setEmail] = useState<string | null>(null);
  // 未配置 Supabase 时不会有任何会话查询回来，直接视为已检查，否则永远卡在空白。
  const [checked, setChecked] = useState(() => !configured);

  useEffect(() => {
    if (!configured) return;
    // SSO（2026-07-01）：getUserEmail() 内部走 getSession()，读本地共享 cookie 并
    // 自动续期；getUser() 的网络校验在跨子域场景下会把已登录用户误判成未登录。
    getUserEmail().then((e) => {
      setEmail(e);
      setChecked(true);
    });
    const c = browserClient();
    if (!c) return;
    const { data: sub } = c.auth.onAuthStateChange((_e, s) =>
      setEmail(s?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  if (!configured) {
    return (
      <div className="px-8 py-6">
        <PageHeader title={tt("设置")} />
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-[13px] text-amber-800">
          {tt("登录服务尚未配置（缺少 Supabase 环境变量）。")}
        </div>
      </div>
    );
  }

  if (checked && !email) {
    return (
      <div className="px-8 py-6">
        <PageHeader title={tt("设置")} />
        <div className="v-fade-up mx-auto mt-10 max-w-xl rounded-2xl border border-neutral-200 bg-white p-8 text-center text-[14px] text-neutral-600">
          {tt("请先登录后再管理账户设置。")}
        </div>
      </div>
    );
  }

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

        {knowledgeBaseLink && (
          <section className="v-fade-up" style={{ animationDelay: "60ms" }}>
            <h2 className="mb-3 text-[14px] font-semibold text-neutral-900">{tt("知识库")}</h2>
            <div className="rounded-xl border border-neutral-200 p-5">
              <p className="text-[12px] leading-relaxed text-neutral-500">
                {tt("在 OceanLeo 主站可添加跨任务记忆的偏好与背景信息，所有 AI 应用共享。")}
              </p>
              <a
                href="https://oceanleo.com/settings"
                className="mt-3 inline-block rounded-lg border border-neutral-200 px-3 py-1.5 text-[13px] text-neutral-700 transition hover:bg-neutral-50"
              >
                {tt("前往主站管理知识库 →")}
              </a>
            </div>
          </section>
        )}

        {/* 用量记录 2026-07-02 起独立成「Cost」页（settings / api 均不再内嵌）。 */}
        <section className="v-fade-up" style={{ animationDelay: "120ms" }}>
          <h2 className="mb-1 text-[14px] font-semibold text-neutral-900">{tt("用量记录与计费")}</h2>
          <p className="mb-3 text-[12px] leading-relaxed text-neutral-500">
            {tt("用量柱状图与每次调用的真实计费记录（模型 / token / 费用，OceanLeo 不加价）在「Cost」页；token 余额与模型选择在「AI 模型」页。")}
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
