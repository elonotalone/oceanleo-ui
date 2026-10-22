// 诊断组件用的内联图标（currentColor 描边，无外部资源）。
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function Svg({ size = 16, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconWarning(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.4h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 17.1h.01" />
    </Svg>
  );
}

/** 「通话检测」：耳机 + 小勾。 */
export function IconCallCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <path d="M4 15a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2Z" />
      <path d="M20 15a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z" />
      <path d="m10 13.5 1.6 1.6 2.9-3" />
    </Svg>
  );
}

export function IconMic(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </Svg>
  );
}

export function IconSpeaker(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5 6.5 9H3.5v6h3L11 19V5Z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
      <path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
    </Svg>
  );
}

export function IconCamera(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="6.5" width="13" height="11" rx="2" />
      <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
    </Svg>
  );
}

export function IconNetwork(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20v-3" />
      <path d="M9 20v-6" />
      <path d="M14 20v-9" />
      <path d="M19 20V7" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Svg>
  );
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function Spinner({ size = 14, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={`animate-spin ${className}`}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
