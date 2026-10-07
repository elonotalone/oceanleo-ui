"use client";

import type { BrowserIconId } from "./device-presentation";

/** Chrome / Edge / Firefox / Safari / 其它。系统（Windows/macOS）只出现在文字里。 */
export function BrowserGlyph({
  id,
  className = "h-7 w-7",
}: {
  id: BrowserIconId;
  className?: string;
}) {
  switch (id) {
    case "chrome":
      return <ChromeMark className={className} />;
    case "edge":
      return <EdgeMark className={className} />;
    case "firefox":
      return <FirefoxMark className={className} />;
    case "safari":
      return <SafariMark className={className} />;
    default:
      return <OtherBrowserMark className={className} />;
  }
}

function ChromeMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <path fill="#EA4335" d="M24 2c7.7 0 14.5 4 18.3 10.1H24L17.6 2.9A21.9 21.9 0 0 1 24 2z" />
      <path fill="#FBBC05" d="M5.7 12.1A22 22 0 0 0 17.2 41L24 24H5.7z" />
      <path fill="#34A853" d="M42.3 12.1A22 22 0 0 1 30.8 41L24 24h18.3z" />
      <circle cx="24" cy="24" r="9.5" fill="#fff" />
      <circle cx="24" cy="24" r="7" fill="#4285F4" />
    </svg>
  );
}

function EdgeMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#F3F8FF" />
      <path
        fill="#0078D4"
        d="M38 28.2c-.6 6.4-6.4 11.3-14.2 11.3-8.6 0-14.6-5.4-14.6-13.3 0-9 7.4-14.4 16-12.6-2.8-3.3-7.2-4.4-11.6-3.2C19.2 6.8 26.4 6 32 10.4c4.4 3.4 6.7 8.8 6.2 14.6.6.8.6 2.1-.2 3.2z"
      />
      <path
        fill="#32C3F0"
        d="M14.4 29.8c.8 4.6 5 7.4 10 7.4 6.2 0 10.4-3.3 11.2-8.6-4.8.2-9.2-1-11.6-3.2-1.2 2.6-4.4 4-9.6 4.4z"
      />
    </svg>
  );
}

function FirefoxMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#FF7139" />
      <circle cx="24" cy="24" r="11" fill="#FFB74D" />
      <circle cx="24" cy="24" r="6.5" fill="#1E4B8A" />
      <path
        fill="#FF7139"
        d="M10 18c4-8 12-11 20-8 2 4 1 8-2 11-6-1-11 1-14 6-3-2-5-5-4-9z"
      />
    </svg>
  );
}

function SafariMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#fff" />
      <circle cx="24" cy="24" r="20" fill="#E8F4FF" stroke="#C7C7CC" strokeWidth="1.2" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        const inner = i % 3 === 0 ? 15 : 16.5;
        const outer = 19.2;
        return (
          <line
            key={i}
            x1={24 + Math.sin(a) * inner}
            y1={24 - Math.cos(a) * inner}
            x2={24 + Math.sin(a) * outer}
            y2={24 - Math.cos(a) * outer}
            stroke="#FF3B30"
            strokeWidth={i % 3 === 0 ? 1.6 : 1}
            strokeLinecap="round"
          />
        );
      })}
      <polygon points="24,8 28.2,28.2 24,24 19.8,19.8" fill="#FF3B30" />
      <polygon points="24,40 19.8,19.8 24,24 28.2,28.2" fill="#1C7ED6" />
      <circle cx="24" cy="24" r="1.6" fill="#fff" />
    </svg>
  );
}

function OtherBrowserMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <rect x="6" y="10" width="36" height="28" rx="6" fill="#F3F4F6" stroke="#D1D5DB" />
      <circle cx="14" cy="18" r="2" fill="#9CA3AF" />
      <circle cx="20" cy="18" r="2" fill="#D1D5DB" />
      <rect x="12" y="24" width="24" height="8" rx="2" fill="#E5E7EB" />
    </svg>
  );
}
