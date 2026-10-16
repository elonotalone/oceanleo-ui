"use client";

// ============================================================================
// 团队库「从我的库导入」——个人货架不再挂发布钮，入口只在团队库这一侧。
// 列出 /v1/library/mine。本文件由 OrgPage 动态 import，避免组织页测试编译拖进
// 整棵素材图；挂牌仍走 org-api.publishOrgAsset，不复制、不搬家。
// ============================================================================

import { useEffect, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  orgApiCode,
  orgErrorCopy,
  publishOrgAsset,
} from "../../lib/org-api";

export type OrgLibraryPublishedRow = {
  id: string;
  url: string;
};

export interface OrgLibraryImportProps {
  orgId: string;
  published: readonly OrgLibraryPublishedRow[];
  onImported: () => void | Promise<void>;
  /** 测试注入。生产不传，走 /v1/library/mine。 */
  listMine?: () => Promise<{ items: unknown[]; error?: string }>;
}

type MineItem = {
  key: string;
  title: string;
  kind: string;
  url: string;
  sourceRef: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function mineItemFromUnknown(raw: unknown): MineItem | null {
  const row = asRecord(raw);
  const sourceRef = asText(row.artifactId || row.id).trim();
  const url = asText(row.url || row.previewUrl).trim();
  if (!sourceRef && !url) return null;
  return {
    key: sourceRef || url,
    title: asText(row.title).trim() || sourceRef || url,
    kind: asText(row.kind).trim() || "file",
    url: url || sourceRef,
    sourceRef: sourceRef || url,
  };
}

export function itemAlreadyInOrgLibrary(
  item: Pick<MineItem, "url" | "sourceRef">,
  published: readonly OrgLibraryPublishedRow[],
): boolean {
  const sourceRef = item.sourceRef.trim();
  const url = item.url.trim();
  return published.some((row) => {
    const hit = asText(row.url).trim();
    const id = asText(row.id).trim();
    if (sourceRef && (hit === sourceRef || id === sourceRef)) return true;
    if (url && (hit === url || id === url)) return true;
    return false;
  });
}

function normalizeMineItems(raw: readonly unknown[]): MineItem[] {
  const items: MineItem[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    const item = mineItemFromUnknown(row);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }
  return items;
}

async function listMineItems(): Promise<{ items: MineItem[]; error: string }> {
  const { listMyArtifacts } = await import("../../shell/artifact-client");
  const result = await listMyArtifacts({ limit: 100 });
  if (!result.ok) {
    return { items: [], error: asText(result.error) || "offline" };
  }
  const payload = asRecord(result.data);
  const raw = Array.isArray(payload.items) ? payload.items : [];
  return { items: normalizeMineItems(raw), error: "" };
}

export function OrgLibraryImport({
  orgId,
  published,
  onImported,
  listMine,
}: OrgLibraryImportProps) {
  const tt = useUI();
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [items, setItems] = useState<MineItem[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError("");
    void (async () => {
      try {
        const next = listMine
          ? await listMine()
          : await listMineItems();
        if (cancelled) return;
        const items = normalizeMineItems(Array.isArray(next.items) ? next.items : []);
        const fail = asText(next.error);
        if (fail && items.length === 0) {
          setStatus("error");
          setError(fail);
          setItems([]);
          return;
        }
        setItems(items);
        setStatus("ok");
      } catch (caught) {
        if (cancelled) return;
        setStatus("error");
        setError(tt(orgErrorCopy(orgApiCode(caught))));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, listMine]);

  const selectable = items.filter((item) => !itemAlreadyInOrgLibrary(item, published));
  const selected = selectable.filter((item) => picked[item.key]);

  async function importSelected() {
    if (!orgId || busy || selected.length === 0) return;
    setBusy(true);
    setError("");
    try {
      for (const item of selected) {
        await publishOrgAsset(orgId, {
          kind: item.kind,
          title: item.title,
          url: item.url,
          sourceRef: item.sourceRef,
        });
      }
      setPicked({});
      await onImported();
    } catch (caught) {
      setError(tt(orgErrorCopy(orgApiCode(caught))));
    } finally {
      setBusy(false);
    }
  }

  const primaryClass =
    "rounded-lg bg-neutral-900 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-neutral-800 disabled:opacity-50";

  return (
    <div
      className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      data-org-library-import-panel="1"
    >
      {status === "loading" && (
        <p className="text-[12px] text-neutral-500" data-org-library-import-loading="1">
          …
        </p>
      )}
      {status === "error" && (
        <p className="text-[12px] text-rose-700" data-org-library-import-error="1" role="status">
          {error}
        </p>
      )}
      {status === "ok" && items.length === 0 && (
        <p className="text-[12px] text-neutral-500" data-org-library-import-empty="1">
          {tt("我的库是空的。")}
        </p>
      )}
      {status === "ok" && items.length > 0 && (
        <>
          <ul className="max-h-64 space-y-1 overflow-y-auto" data-org-library-import-list="1">
            {items.map((item) => {
              const already = itemAlreadyInOrgLibrary(item, published);
              return (
                <li key={item.key}>
                  <label
                    className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] ${
                      already ? "text-neutral-400" : "text-neutral-800"
                    }`}
                    data-org-library-import-item={item.key}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-neutral-300"
                      disabled={already || busy}
                      checked={already ? true : Boolean(picked[item.key])}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setPicked((prev) => ({ ...prev, [item.key]: on }));
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {already ? (
                      <span className="shrink-0 text-[11px]">{tt("已在这个团队库")}</span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2">
            <button
              type="button"
              className={primaryClass}
              disabled={busy || selected.length === 0}
              data-org-library-import-confirm="1"
              onClick={() => void importSelected()}
            >
              {busy ? tt("处理中…") : tt("导入 {n} 项", { n: selected.length })}
            </button>
          </div>
        </>
      )}
      {error && status === "ok" ? (
        <p className="mt-2 text-[12px] text-rose-700" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
