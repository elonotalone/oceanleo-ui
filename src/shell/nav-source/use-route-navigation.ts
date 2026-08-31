"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent as ReactMouseEvent,
} from "react";

function pathMatches(pathname: string, href: string, exact?: boolean): boolean {
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface RouteNavigationOptions {
  /** e.g. close mobile drawer before navigating */
  onNavigate?: () => void;
  /** i18n sites pass stripLocale so pending/active match logical routes */
  stripLocale?: (pathname: string) => string;
}

/**
 * View Transitions + useTransition: first-frame pending active, no route-surface remount.
 * Pairs with `./route-transition.css` (motion-system.md §规范四, AppShell:927-933).
 */
export function useRouteNavigation(options: RouteNavigationOptions = {}) {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const logicalPath = options.stripLocale?.(pathname) ?? pathname;
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (pathMatches(logicalPath, pending, pending === "/")) {
      pendingRef.current = null;
      setPendingHref(null);
    }
  }, [logicalPath]);

  const navigate = useCallback(
    (href: string, event?: ReactMouseEvent) => {
      event?.preventDefault();
      if (pathMatches(logicalPath, href, href === "/")) return;
      options.onNavigate?.();
      pendingRef.current = href;
      setPendingHref(href);

      const commit = () => {
        startTransition(() => {
          router.push(href);
        });
      };

      // 刻意**不**把 commit 包成 promise 交给 startViewTransition 去 await：
      // await 一个「等路由落地」的 promise 才能拿到严格正确的后快照，但那条路上
      // 只要路由不落地（跳转被取消、目标段抛错）过渡就挂在半空，整页冻结到 VT
      // 超时为止 —— 而本波禁止用浏览器验收，我无法证明那条路在 31 个站上都安全。
      // 现在这个写法的最坏情况是快照取早了、看不出过渡，等于今天的瞬时切换：
      // 不冻结、不重挂载、不劣化。
      if (
        typeof document !== "undefined" &&
        "startViewTransition" in document &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        (
          document as Document & {
            startViewTransition: (update: () => void) => void;
          }
        ).startViewTransition(commit);
      } else {
        commit();
      }
    },
    [logicalPath, options.onNavigate, router, startTransition],
  );

  const isNavActive = useCallback(
    (href: string, exact?: boolean) => {
      const matchExact = exact ?? href === "/";
      if (pendingHref) return pathMatches(pendingHref, href, matchExact);
      return pathMatches(logicalPath, href, matchExact);
    },
    [pendingHref, logicalPath],
  );

  return { navigate, isPending, pendingHref, isNavActive };
}
