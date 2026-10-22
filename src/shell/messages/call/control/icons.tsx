// 远程控制用到的几个小图标（行内 SVG，不带样式类）。
import type { SVGProps } from "react";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** 鼠标指针 + 屏幕：远程控制。 */
export function ControlIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h16v10H4z" />
      <path d="M9 19h6M12 15v4" />
      <path d="M10 8l4.5 2-2 .7-.7 2z" />
    </svg>
  );
}

export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  );
}

export function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

export function ShieldIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
      <path d="M12 8v5M12 16h.01" />
    </svg>
  );
}

/** 控制方光标（实心箭头，画在共享画面上）。 */
export function CursorGlyph({ color }: { color: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden focusable={false}>
      <path d="M2 1.5l12.5 7-5.6 1.4L6.2 16z" fill={color} stroke="#ffffff" strokeWidth={1.2} strokeLinejoin="round" />
    </svg>
  );
}
