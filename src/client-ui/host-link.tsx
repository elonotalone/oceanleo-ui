"use client";

import type { MouseEvent, ReactElement } from "react";
import { useClientHost } from "./host-context";
import { isModifiedClick } from "./navigation";
import type { HostLinkProps } from "./host-ports";

/**
 * In-app link that keeps href in the DOM (middle-click / new tab) and lets the
 * injected host own same-window left clicks. Web hosts pass next/link.
 */
export function HostLink({ href, onClick, children, ...rest }: HostLinkProps): ReactElement {
  const host = useClientHost();
  const Link = host.Link;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (!href.startsWith("/") || isModifiedClick(event)) return;
    event.preventDefault();
    if (host.navigation.pathname === href && !host.navigation.search) return;
    host.navigation.push(href);
  }

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
