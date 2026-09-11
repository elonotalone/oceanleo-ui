"use client";

import { useEffect, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { helpCenterUrl } from "../lib/help-url";

export function HelpLink({
  href,
  siteKey,
}: {
  /** Override. Omit to derive from the current host after mount. */
  href?: string;
  siteKey?: string | null;
}) {
  const tt = useUI();
  const label = tt("帮助与反馈");
  const [url, setUrl] = useState(
    () =>
      href ??
      helpCenterUrl({ host: "oceanleo.com", siteKey, path: "/chat" }),
  );

  useEffect(() => {
    if (href) {
      setUrl(href);
      return;
    }
    setUrl(
      helpCenterUrl({
        host: window.location.host,
        siteKey,
        from: window.location.href,
        path: "/chat",
      }),
    );
  }, [href, siteKey]);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      aria-label={label}
      className="leo-tap-target inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-600 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] active:duration-[var(--leo-dur-1)] hover:bg-neutral-100 active:scale-95 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
    >
      <QuestionMarkIcon />
    </a>
  );
}

function QuestionMarkIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path
        d="M9.6 9.4a2.5 2.5 0 1 1 3.2 2.35c-.7.32-1.3.9-1.3 1.75V14.2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.1" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
