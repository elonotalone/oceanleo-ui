"use client";

// 邀请二维码：把一条邀请链接画成二维码图（<img src=data:image/png>），能下载成 PNG。
// 只为「https 开头、属于本家门户」的邀请地址出码——不会把任意字符串画成码；
// 生成失败或地址不合格时什么都不显示，旁边的链接照常可用。
// 码图用 qrcode 的 toDataURL 生成，不走 SVG 字符串注入（契约 §10）。

import { useEffect, useState } from "react";
import { currentDomainProfile } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";

/** 邀请地址是 https、且 origin 正好是本家门户时返回规范化后的地址，否则 null。 */
export function portalInviteUrlOf(url: unknown, portalOrigin?: string): string | null {
  if (typeof url !== "string") return null;
  const text = url.trim();
  if (!/^https:\/\//i.test(text) || text.length > 2000) return null;
  let origin = portalOrigin;
  if (!origin) {
    try {
      origin = currentDomainProfile().portalOrigin;
    } catch {
      return null;
    }
  }
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (parsed.origin !== new URL(origin).origin) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** 下载文件名：说明文字去掉系统不允许的字符，加 .png。 */
export function qrFileName(label: string): string {
  const base = label.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "").replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "invite-qr"}.png`;
}

type ToDataUrl = (text: string, options: Record<string, unknown>) => Promise<string>;

async function loadToDataUrl(): Promise<ToDataUrl> {
  const mod = (await import("qrcode")) as unknown as {
    toDataURL?: ToDataUrl;
    default?: { toDataURL?: ToDataUrl };
  };
  const fn = mod.toDataURL ?? mod.default?.toDataURL;
  if (typeof fn !== "function") throw new Error("qrcode unavailable");
  return fn;
}

export interface InviteQrCodeProps {
  /** 邀请链接（只有本家门户的 https 地址才会出码） */
  url: string;
  /** 下载文件名里的说明（已翻译），例如「邀请二维码-加联系人」 */
  fileLabel: string;
  size?: number;
}

export function InviteQrCode({ url, fileLabel, size = 160 }: InviteQrCodeProps) {
  const tt = useUI();
  const safeUrl = portalInviteUrlOf(url);
  const [dataUrl, setDataUrl] = useState<{ for: string; value: string } | null>(null);

  useEffect(() => {
    if (!safeUrl) return;
    let alive = true;
    loadToDataUrl()
      .then((toDataURL) => toDataURL(safeUrl, { width: size * 2, margin: 2, errorCorrectionLevel: "M" }))
      .then((value) => {
        if (alive && typeof value === "string" && value.startsWith("data:image/png;base64,")) {
          setDataUrl({ for: safeUrl, value });
        }
      })
      .catch(() => {
        if (alive) setDataUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [safeUrl, size]);

  if (!safeUrl || !dataUrl || dataUrl.for !== safeUrl) return null;
  return (
    <div className="flex flex-col items-center gap-2" data-invite-qr-box>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={dataUrl.value}
        alt={tt("邀请二维码")}
        width={size}
        height={size}
        data-invite-qr
        className="rounded-lg border border-neutral-200 bg-white"
        style={{ width: size, height: size }}
      />
      <p className="text-center text-[11px] text-neutral-500">{tt("用手机扫一扫，就能打开邀请页面。")}</p>
      <a
        href={dataUrl.value}
        download={qrFileName(fileLabel)}
        data-action="download-qr"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-neutral-200 px-3 text-[12px] text-neutral-700 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        {tt("下载二维码")}
      </a>
    </div>
  );
}
