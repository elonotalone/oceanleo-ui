"use client";

// 作品卡：缩略图、标题、编辑器类型、「打开」。
// 「打开」的地址是发送方分享时用 `advancedFeatureHrefForItem` 算好放进 `card.open_path` 的；
// 同站直接走，别的站（OceanLeo 家族）跳过去，家族之外的地址一律不跳。
// 没权限：打开后服务端返回 no_access 时由目标页提示；卡上「没有权限」来自 W04 presence 接口 403。
import { useEffect, useState } from "react";
import { familyForHost } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import { ImApiError } from "../../../lib/im/client";
import { messagesApi } from "../../../lib/im/messages-api";
import type { ImCard, ImEditorKind } from "../../../lib/im/types";
import { safeMediaUrl } from "./AttachmentView";

export const EDITOR_KIND_LABEL: Record<ImEditorKind, string> = {
  richdoc: "文档",
  grid: "表格",
  deck: "演示文稿",
  image: "图片",
  vector: "矢量图",
  chart: "图表",
  game: "游戏",
  model3d: "3D 模型",
  audio: "音频",
  pdf: "PDF",
  video: "视频",
  workflow: "流程图",
};

/** 作品卡「打开」允许的目标：同源，或 OceanLeo 家族站（com / cn / ws）。用户内容域（oceanleo.app）永远不行。 */
export function resolveCardTarget(
  openPath: string | null | undefined,
  currentOrigin: string,
): { href: string; sameOrigin: boolean } | null {
  if (!openPath) return null;
  let url: URL;
  try {
    url = new URL(openPath, currentOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.origin === currentOrigin) {
    return { href: `${url.pathname}${url.search}${url.hash}`, sameOrigin: true };
  }
  if (url.protocol !== "https:") return null;
  if (!familyForHost(url.hostname)) return null;
  return { href: url.toString(), sameOrigin: false };
}

type CoeditState = { count: number } | "no_access" | null;

export function ArtifactCardView({ card }: { card: ImCard }) {
  const tt = useUI();
  const [coedit, setCoedit] = useState<CoeditState>(null);
  const roomKey = card.coedit?.room_key ?? null;

  useEffect(() => {
    if (!roomKey) return;
    let alive = true;
    messagesApi
      .coeditPresence(roomKey)
      .then((result) => {
        if (alive) setCoedit({ count: result.users.length });
      })
      .catch((error) => {
        if (!alive) return;
        if (error instanceof ImApiError && (error.status === 403 || error.code === "no_access")) setCoedit("no_access");
      });
    return () => {
      alive = false;
    };
  }, [roomKey]);

  // 服务端渲染时没有 window，也就没有「当前站」可解析：不猜一个本机地址兜底，卡片不给可点的「打开」。
  const origin = typeof window === "undefined" ? null : window.location.origin;
  const target = origin ? resolveCardTarget(card.open_path, origin) : null;
  const thumb = safeMediaUrl(card.thumb_url);
  const kindLabel = card.editor_kind ? tt(EDITOR_KIND_LABEL[card.editor_kind]) : tt("作品");

  return (
    <div data-card="artifact" className="flex max-w-[360px] gap-3 rounded-xl border border-neutral-200 bg-white p-3">
      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-100 text-[11px] text-neutral-400">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          kindLabel
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col justify-between">
        <span>
          <span className="block truncate text-[13.5px] font-medium text-neutral-900">{card.title}</span>
          <span className="block truncate text-[12px] text-neutral-500">
            {kindLabel}
            {card.subtitle ? ` · ${card.subtitle}` : ""}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2 text-[11.5px] text-neutral-400">
          {card.coedit ? <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">{tt("可以一起改")}</span> : null}
          {coedit && coedit !== "no_access" && coedit.count > 0 ? (
            <span>{tt("{n} 人正在改", { n: coedit.count })}</span>
          ) : null}
        </span>
      </span>
      <span className="flex shrink-0 items-center">
        {!origin ? null : coedit === "no_access" || !target ? (
          <span className="text-[12px] text-neutral-400">{tt("没有权限")}</span>
        ) : (
          <a
            href={target.href}
            {...(target.sameOrigin ? {} : { target: "_blank", rel: "noopener noreferrer" })}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-[12.5px] text-white hover:bg-neutral-700"
          >
            {tt("打开")}
          </a>
        )}
      </span>
    </div>
  );
}
