"use client";

// ============================================================================
// @oceanleo/ui — 「插件与连接器」统一页面（单一事实源）
// ----------------------------------------------------------------------------
// 技能、连接器与 MCP 服务器。目录来自网关 /v1/mcp/catalog（阿里云市场 MCP 快照，
// 公开只读）。全 OceanLeo 系列共享同一份目录。各站把它包进自己的 <AppShell>，
// 放在 /plugins 路由。
// ============================================================================

import { useEffect, useState, type ReactNode } from "react";
import { getMcpCatalog, type McpItem } from "../lib/database";

export interface PluginsPageProps {
  accent?: string;
  title?: ReactNode;
}

export function PluginsPage({ accent = "#4f46e5", title = "插件与连接器" }: PluginsPageProps) {
  const [items, setItems] = useState<McpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getMcpCatalog();
      if (!alive) return;
      setLoading(false);
      if (!r.ok || !r.data) {
        setError(r.error || "加载失败");
        return;
      }
      setItems(r.data.items || []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = q.trim()
    ? items.filter((it) =>
        `${it.name || ""}${it.vendor || ""}${it.description || ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
    : items;

  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-1 text-[13px] text-neutral-500">技能、连接器与 MCP 服务器，接入后即可在全 OceanLeo 系列中调用。</p>

      <div className="mx-auto mt-6 max-w-3xl">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索连接器 / MCP 服务器…"
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-[14px] outline-none transition focus:border-neutral-400"
        />

        {error ? (
          <p className="mt-8 text-center text-sm text-neutral-500">{error}</p>
        ) : loading ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-neutral-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-8 text-center text-sm text-neutral-500">没有匹配的连接器。</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {filtered.map((it, i) => (
              <a
                key={it.code || i}
                href={it.detail_url || "#"}
                target={it.detail_url ? "_blank" : undefined}
                rel="noreferrer"
                className="group flex flex-col rounded-2xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold text-neutral-900">{it.name || it.code}</span>
                  {it.free ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">免费</span>
                  ) : it.price != null && it.price !== "" ? (
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${accent}1a`, color: accent }}>
                      {it.currency || "¥"}{it.price}/{it.unit || "次"}
                    </span>
                  ) : null}
                </div>
                {it.vendor && <span className="mt-0.5 text-[12px] text-neutral-400">{it.vendor}</span>}
                {it.description && <p className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-neutral-500">{it.description}</p>}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
