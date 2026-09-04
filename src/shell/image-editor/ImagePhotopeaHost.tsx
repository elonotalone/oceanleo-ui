"use client";

/**
 * 专业模式才把 Photopea iframe 挂上舞台。普通模式返回 null，
 * 所以广告页根本不会被请求（PHOTOPEA_PRELOAD 仍是 false）。
 */
import { PhotopeaFrame } from "./PhotopeaFrame";
import { planPhotopeaMount } from "./photopea-mount";
import type { PhotopeaLaunchOptions } from "./photopea-bridge";

export function ImagePhotopeaHost({
  showPhotopea,
  documentDataUrl,
  theme,
  onDocument,
}: PhotopeaLaunchOptions & {
  showPhotopea: boolean;
  onDocument?: (bytes: ArrayBuffer) => void;
}) {
  const planned = planPhotopeaMount(showPhotopea);
  if (!planned.mount) return null;
  return (
    <div
      className="absolute inset-0 z-20 bg-[var(--advanced-stage-bg,#f4f1e8)]"
      data-testid="image-photopea-host"
    >
      <PhotopeaFrame
        documentDataUrl={documentDataUrl}
        theme={theme}
        onDocument={onDocument}
      />
    </div>
  );
}
