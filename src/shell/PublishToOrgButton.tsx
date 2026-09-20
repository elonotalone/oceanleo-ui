"use client";

// ============================================================================
// @oceanleo/ui — 把一件个人成果发布进组织库（W23）
// ----------------------------------------------------------------------------
// 工作台成果卡菜单、历史详情成果行共用这一颗。没进过任何组织的人 **一个字节
// 都不渲染**：`listMyOrgs()` 空数组 → return null，并且不再发 publish / list
// / revoke。口径照抄 `PayerSelector.tsx`（零组织 = 控件不存在）。
//
// 取数只走 `../lib/org-api`，本文件没有 fetch、没有网关路径字面量。
// ============================================================================

import { useEffect, useState } from "react";
import {
  listMyOrgs,
  listOrgAssets,
  orgApiCode,
  orgErrorCopy,
  publishOrgAsset,
  revokeOrgAsset,
  type OrgSummary,
} from "../lib/org-api";
import { useUI } from "../i18n/ui/useUI";

export interface PublishToOrgButtonProps {
  kind: string;
  title: string;
  url: string;
  sourceRef?: string;
  className?: string;
}

type PublishedHit = { orgId: string; orgName: string; assetId: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

/** 这一行是不是「我刚想发的那一件」。url / sourceRef / 后端 assetRef 任一命中即可。 */
export function assetRowMatchesPublish(
  raw: unknown,
  needle: { url: string; sourceRef?: string },
): { id: string } | null {
  const row = asRecord(raw);
  const id = asText(row.id || row.asset_id);
  const url = asText(row.url || row.public_url || row.assetRef || row.asset_ref);
  const ref = asText(row.assetRef || row.asset_ref || row.sourceRef || row.source_ref);
  const sourceRef = (needle.sourceRef || "").trim();
  const wantUrl = (needle.url || "").trim();
  if (sourceRef && (id === sourceRef || ref === sourceRef || url === sourceRef)) {
    return { id: id || sourceRef };
  }
  if (wantUrl && (url === wantUrl || ref === wantUrl)) return { id: id || wantUrl };
  return null;
}

export function PublishToOrgButton({
  kind,
  title,
  url,
  sourceRef = "",
  className = "",
}: PublishToOrgButtonProps) {
  const tt = useUI();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [hits, setHits] = useState<PublishedHit[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listMyOrgs()
      .then((list) => {
        if (!cancelled) setOrgs(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setOrgs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (orgs.length === 0) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const next: PublishedHit[] = [];
      await Promise.all(
        orgs.map(async (org) => {
          try {
            const rows = await listOrgAssets(org.id);
            for (const raw of Array.isArray(rows) ? rows : []) {
              const hit = assetRowMatchesPublish(raw, { url, sourceRef });
              if (hit?.id) next.push({ orgId: org.id, orgName: org.name, assetId: hit.id });
            }
          } catch {
            /* 某一家读库失败不挡发布；按钮仍可点。 */
          }
        }),
      );
      if (!cancelled) setHits(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [orgs, url, sourceRef]);

  if (orgs.length === 0) return null;

  const unpublished = orgs.filter((org) => !hits.some((hit) => hit.orgId === org.id));
  const label =
    hits.length === 1
      ? tt("已在 {name} 组织库", { name: hits[0]?.orgName || "" })
      : hits.length > 1
        ? tt("已在 {n} 个组织库", { n: hits.length })
        : tt("发布到组织");

  async function publishTo(org: OrgSummary) {
    if (busy) return;
    setBusy(`publish:${org.id}`);
    setError("");
    try {
      const result = await publishOrgAsset(org.id, { kind, title, url, sourceRef });
      setHits((prev) =>
        prev.some((hit) => hit.orgId === org.id)
          ? prev
          : [...prev, { orgId: org.id, orgName: org.name, assetId: result.id }],
      );
      if (orgs.length === 1) setOpen(false);
    } catch (caught) {
      setError(tt(orgErrorCopy(orgApiCode(caught))));
    } finally {
      setBusy("");
    }
  }

  async function revokeFrom(hit: PublishedHit) {
    if (busy) return;
    setBusy(`revoke:${hit.orgId}`);
    setError("");
    try {
      await revokeOrgAsset(hit.orgId, hit.assetId);
      setHits((prev) => prev.filter((row) => row.orgId !== hit.orgId));
    } catch (caught) {
      setError(tt(orgErrorCopy(orgApiCode(caught))));
    } finally {
      setBusy("");
    }
  }

  function onMainClick() {
    if (orgs.length === 1 && unpublished.length === 1 && hits.length === 0) {
      void publishTo(orgs[0]);
      return;
    }
    setOpen((value) => !value);
  }

  const chipClass =
    "inline-flex min-h-8 items-center rounded-lg border border-neutral-200 px-2.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <span className={`relative inline-flex min-w-0 flex-col ${className}`} data-publish-to-org="1">
      <button
        type="button"
        className={chipClass}
        disabled={Boolean(busy)}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onMainClick}
        data-publish-to-org-main="1"
      >
        {busy.startsWith("publish:") ? tt("处理中…") : label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
          role="menu"
          data-publish-to-org-menu="1"
        >
          {unpublished.map((org) => (
            <button
              key={org.id}
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left text-[12px] text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
              disabled={Boolean(busy)}
              data-publish-org={org.id}
              onClick={() => void publishTo(org)}
            >
              {tt("发布到组织")} · {org.name || org.id}
            </button>
          ))}
          {hits.map((hit) => (
            <button
              key={hit.orgId}
              type="button"
              role="menuitem"
              className="flex w-full px-3 py-1.5 text-left text-[12px] text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              disabled={Boolean(busy)}
              data-revoke-org={hit.orgId}
              onClick={() => void revokeFrom(hit)}
            >
              {tt("撤回")} · {hit.orgName || hit.orgId}
            </button>
          ))}
        </div>
      )}
      {error ? (
        <span className="mt-1 text-[10px] leading-snug text-rose-700" role="status">
          {error}
        </span>
      ) : null}
    </span>
  );
}
