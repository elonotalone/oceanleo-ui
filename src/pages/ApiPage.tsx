"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  browserClient,
  oceanleoConfigured,
  getCredits,
  getModelCatalog,
  pricingDocUrl,
  type ModelCatalog,
  type WalletInfo,
} from "../lib/auth";
import { useUI } from "../i18n/ui/useUI";
import { ByokKeys } from "./ByokKeys";
import { ModelGroupManager } from "./ModelCapabilityMarket";
import { PageHeader } from "./PageHeader";

const num = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function fmtTime(iso: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export interface ApiPageProps {
  onLogin?: () => void;
  billingHref?: string;
}

/** Shared AI-model market page used by the main site and every subsite. */
export function ApiPage({
  onLogin,
  billingHref = "https://oceanleo.com/billing",
}: ApiPageProps = {}) {
  const tt = useUI();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);

  useEffect(() => {
    const client = browserClient();
    if (!client) {
      setChecked(true);
      return;
    }
    void client.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setChecked(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void getModelCatalog().then((result) => {
      if (result.ok && result.data) setCatalog(result.data);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    void getCredits().then((result) => {
      if (result.ok && result.data) setWallet(result.data);
    });
  }, [user]);

  if (!oceanleoConfigured()) {
    return (
      <div className="px-8 py-6">
        <PageHeader title={tt("AI 模型")} />
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-[13px] text-amber-800">
          {tt("登录服务尚未配置（缺少 Supabase 环境变量）。")}
        </div>
      </div>
    );
  }

  const providers = catalog?.providers || [];
  return (
    <div className="px-8 py-6">
      <PageHeader title={tt("AI 模型")} />
      <div className="mx-auto mt-6 max-w-3xl space-y-8">
        <section className="v-fade-up">
          <div className="rounded-2xl border border-neutral-200 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[12px] text-neutral-500">{tt("token 余额")}</p>
                <p className="mt-1 text-[26px] font-semibold tabular-nums text-neutral-900">
                  {wallet
                    ? `¥${num(wallet.balance_yuan).toFixed(4)}`
                    : checked && !user
                      ? tt("登录后查看")
                      : "…"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/guide"
                  className="rounded-lg border border-neutral-200 px-4 py-2 text-[13px] font-medium text-neutral-700 transition hover:bg-neutral-50"
                >
                  {tt("指导文档")}
                </a>
                {checked && !user && onLogin ? (
                  <button
                    type="button"
                    onClick={onLogin}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                  >
                    {tt("登录 / 注册")}
                  </button>
                ) : (
                  <a
                    href={billingHref}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800"
                  >
                    {tt("充值")}
                  </a>
                )}
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[12px] leading-relaxed text-emerald-800">
              {tt("计费规则：你支付的费用 = 该模型对应厂商的官方 token 市场价。")}
              <span className="font-semibold">{tt("OceanLeo 不加价、不抽成")}</span>
              {tt("。每笔调用都可审计；使用自己的厂商 API key（BYOK）则不扣钱包。")}
            </div>
          </div>
        </section>

        <ByokKeys loggedIn={!!user} />

        <ModelGroupManager catalog={catalog} user={!!user} />

        {/* 审计来源放全页最底：先完成余额/key/组合管理，再按需查看价格证据。 */}
        <section className="v-fade-up" style={{ animationDelay: "40ms" }}>
          <div className="rounded-2xl border border-neutral-200 p-5">
            <p className="text-[13px] font-semibold text-neutral-900">{tt("价格数据来源")}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
              {tt("百炼/火山为官方价格页确定性解析，OpenRouter 为其官方 API 实时价。共收录")}{" "}
              <span className="font-medium text-neutral-700">
                {catalog?.model_count || 0}
              </span>{" "}
              {tt("个模型。")}
            </p>
            <div className="mt-3 space-y-2.5">
              {providers.map((provider) => (
                <div key={provider.id} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-[88px] text-[12px] font-medium text-neutral-800">
                    {provider.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-neutral-400">
                    {tt("{n} 个 · 更新 {time}", {
                      n: provider.model_count,
                      time: fmtTime(provider.generated_at) || "—",
                    })}
                  </span>
                  {(["html", "pdf", "source"] as const).map((kind) => (
                    <a
                      key={kind}
                      href={pricingDocUrl(provider.id, kind)}
                      target={kind === "html" ? "_blank" : undefined}
                      rel={kind === "html" ? "noreferrer" : undefined}
                      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-600 transition hover:bg-neutral-50"
                    >
                      {kind === "html" ? tt("在线查看") : kind === "source" ? tt("原始数据") : "PDF"}
                    </a>
                  ))}
                  {provider.source_url && (
                    <a
                      href={provider.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-neutral-200 px-2 py-1 text-[11px] text-neutral-400 transition hover:bg-neutral-50"
                    >
                      {tt("官方页 ↗")}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {checked && !user && (
          <p className="pb-4 text-center text-[12px] text-neutral-400">
            {tt("登录后即可创建具名组合，并在全家桶按同一兜底顺序使用。")}
          </p>
        )}
      </div>
    </div>
  );
}
