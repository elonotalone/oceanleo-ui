"use client";

import { Fragment, type MouseEvent, type ReactNode } from "react";

export type BreadcrumbItem = {
  /** Already translated, or data (a project / category name). */
  label: string;
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => void;
};

export type BreadcrumbProps = {
  /** Trail from the outermost level to the current page; the last item is the current page and is never a link. */
  items: readonly BreadcrumbItem[];
  /** Renders the current page instead of the last label (a heading, or an editable name). */
  current?: ReactNode;
  /** Accessible name of the trail, already translated. */
  label?: string;
  className?: string;
};

const ANCESTOR_CLASS = "block truncate rounded text-neutral-400 outline-none transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-300";

/**
 * The shared "Parent / Current" trail (LeoBay categories, project page, project task page).
 * Compact and left-aligned: it takes only the width its words need and never stretches to fill a row,
 * so hosts that want the rest of the row empty put their own spacer after it.
 */
export function Breadcrumb({ items, current, label, className = "" }: BreadcrumbProps) {
  if (!items.length) return null;
  const last = items.length - 1;
  return (
    <nav data-breadcrumb="" aria-label={label} className={`flex min-w-0 max-w-full items-center ${className}`.trim()}>
      <ol className="flex min-w-0 items-center gap-1.5">
        {items.map((item, index) => index === last ? (
          <li key={index} data-breadcrumb-current="" aria-current="page" className="flex min-w-0 items-center truncate font-semibold text-neutral-900">
            {current ?? <span className="min-w-0 truncate" title={item.label}>{item.label}</span>}
          </li>
        ) : (
          <Fragment key={index}>
            <li data-breadcrumb-item="" className="min-w-0 max-w-[16rem] shrink">
              {item.href !== undefined ? (
                <a href={item.href} onClick={item.onClick} title={item.label} className={ANCESTOR_CLASS}>{item.label}</a>
              ) : item.onClick ? (
                <button type="button" onClick={item.onClick} title={item.label} className={`${ANCESTOR_CLASS} max-w-full`}>{item.label}</button>
              ) : (
                <span className="block truncate text-neutral-400" title={item.label}>{item.label}</span>
              )}
            </li>
            <li aria-hidden="true" className="shrink-0 font-normal text-neutral-300">/</li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}
