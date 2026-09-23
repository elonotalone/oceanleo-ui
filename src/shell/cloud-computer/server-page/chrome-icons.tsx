import type { ReactNode, SVGProps } from "react";

type IconProps = { className?: string };

function Svg({
  className = "size-4",
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconBack({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10.5 3.5 5.5 8l5 4.5" />
    </Svg>
  );
}

export function IconChat({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 4.5h10v7H6.5L3 13.5z" />
    </Svg>
  );
}

export function IconCli({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3.5 5.5 6 8l-2.5 2.5" />
      <path d="M8 11h4.5" />
    </Svg>
  );
}

export function IconTerminal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.2" />
      <path d="M5 6.5 6.5 8 5 9.5" />
      <path d="M8 10h3" />
    </Svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="1.4" />
      <path d="M8 2.75v1.3M8 11.95v1.3M2.75 8h1.3M11.95 8h1.3M4.05 4.05l.92.92M11.03 11.03l.92.92M11.95 4.05l-.92.92M4.97 11.03l-.92.92" />
    </Svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 3.5v9M3.5 8h9" />
    </Svg>
  );
}

export function IconClose({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m4 4 8 8M12 4 4 12" />
    </Svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12.5 8A4.5 4.5 0 1 1 11 4.4" />
      <path d="M11 2.5v2.4h-2.4" />
    </Svg>
  );
}

export function IconChevron({ className, up }: IconProps & { up?: boolean }) {
  return (
    <Svg className={className}>
      {up ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}
    </Svg>
  );
}
