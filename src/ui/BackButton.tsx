"use client";

import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type Ref } from "react";

type CommonProps = {
  /** Already translated destination; used for both the accessible name and tooltip. */
  label: string;
  disabled?: boolean;
  surface?: "default" | "dark";
};

export type BackButtonProps = CommonProps & (
  | (Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "title"> & { href?: never })
  | (Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "aria-label" | "title"> & { href: string })
);

const CLASS_NAME = "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border,#e7e5e4)] text-[var(--muted,#78716c)] transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-[var(--surface-hover,#fafaf9)] hover:text-[var(--fg,#292524)] disabled:cursor-not-allowed disabled:opacity-50";

/** The Library detail back control, shared by every shell and portal surface. */
export const BackButton = forwardRef<HTMLButtonElement | HTMLAnchorElement, BackButtonProps>(function BackButton({
  label, disabled = false, surface = "default", className = "", style, ...props
}, ref) {
  const colors = surface === "dark" ? {
    "--border": "var(--back-dark-border,rgba(255,255,255,.2))",
    "--muted": "var(--back-dark-muted,rgba(255,255,255,.7))",
    "--fg": "var(--back-dark-fg,#fff)",
    "--surface-hover": "var(--back-dark-hover,rgba(255,255,255,.1))",
  } as CSSProperties : undefined;
  const shared = {
    "data-back-button": "",
    "aria-label": label,
    title: label,
    className: `${CLASS_NAME} ${className}`.trim(),
    style: { ...colors, ...style },
  };
  const icon = <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
  if (props.href !== undefined) {
    const { href, onClick, tabIndex, ...link } = props;
    return <a {...link} {...shared} ref={ref as Ref<HTMLAnchorElement>}
      href={disabled ? undefined : href} aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : tabIndex} onClick={event => {
        if (disabled) { event.preventDefault(); return; }
        onClick?.(event);
      }}>{icon}</a>;
  }
  return <button {...props} {...shared} ref={ref as Ref<HTMLButtonElement>} type="button" disabled={disabled}>{icon}</button>;
});
