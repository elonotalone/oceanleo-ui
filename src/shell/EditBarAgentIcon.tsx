"use client";

import type { SVGProps } from "react";

/** Conversation + sparkle glyph shared by every edit-bar agent action. */
export function EditBarAgentIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      data-edit-bar-agent-icon
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M5.25 7.1A2.85 2.85 0 0 1 8.1 4.25h7.8a2.85 2.85 0 0 1 2.85 2.85v6.3a2.85 2.85 0 0 1-2.85 2.85h-4.8L6.8 19.5v-3.6h-.7a2.85 2.85 0 0 1-2.85-2.85V7.1Z" />
      <path d="m13.15 7.4.72 1.58 1.58.72-1.58.72-.72 1.58-.72-1.58-1.58-.72 1.58-.72.72-1.58Z" />
      <path d="M7.7 8.9h1.2M7.7 11.55h1.2" />
    </svg>
  );
}
