"use client";

import Link from "next/link";
import { OrgMembership } from "../../OrgMembership";
import { useUI } from "../../../i18n/ui/useUI";

export function OrgSection({ orgHref }: { orgHref?: string }) {
  const tt = useUI();
  return (
    <div data-settings-pane="org" className="space-y-4">
      <OrgMembership embedded hideWhenEmpty={false} />
      {orgHref ? (
        <Link
          href={orgHref}
          className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-[13px] text-neutral-700 transition duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] hover:bg-neutral-50"
        >
          {tt("打开组织页面")}
        </Link>
      ) : null}
    </div>
  );
}
