"use client";

// Skills overhaul 2026-10-24 — W09A：技能封面（3:4）。有 src 用 <img>（svg 走网关，带 CSP），
// 加载失败或无封面时用按标题哈希挑的分类色占位 + 首字。

import { useEffect, useState } from "react";
import { coverTone } from "./tree-model";

export interface SkillCoverProps {
  src?: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
}

export const SKILL_COVER_SIZE: Record<"sm" | "md" | "lg", string> = {
  sm: "w-12 rounded-[4px]",
  md: "w-24 rounded-[6px]",
  lg: "w-[180px] rounded-[6px]",
};

function initial(title: string): string {
  const t = (title || "").trim();
  if (!t) return "S";
  const ch = Array.from(t)[0] || "S";
  return ch.toUpperCase();
}

export function SkillCover({ src, title, size = "md" }: SkillCoverProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;
  const [bg, fg] = coverTone(title || "");
  const textSize = size === "sm" ? "text-[16px]" : size === "md" ? "text-[28px]" : "text-[52px]";
  return (
    <div
      className={`relative aspect-[3/4] shrink-0 overflow-hidden shadow-[0_2px_10px_rgba(0,0,0,0.10)] ring-1 ring-black/5 ${SKILL_COVER_SIZE[size]}`}
      data-skill-cover={showImage ? "image" : "placeholder"}
      style={showImage ? undefined : { backgroundColor: bg, color: fg }}
    >
      {showImage ? (
        <img
          src={src as string}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center font-semibold tracking-tight ${textSize}`}
        >
          {initial(title)}
        </span>
      )}
    </div>
  );
}
