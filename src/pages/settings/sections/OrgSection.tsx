"use client";

import { OrgMembership } from "../../OrgMembership";
import { OrgPage } from "../../OrgPage";
import { useUI } from "../../../i18n/ui/useUI";

export function OrgSection({ orgHref: _orgHref }: { orgHref?: string }) {
  void _orgHref;
  const tt = useUI();
  return (
    <div data-settings-pane="org" className="space-y-6">
      <section data-org-settings-block="mine" className="space-y-3">
        <h3 className="text-[13px] font-semibold text-neutral-900">{tt("我的组织")}</h3>
        <OrgPage embedded />
        <OrgMembership embedded only="views" />
      </section>
      <section data-org-settings-block="join-create" className="space-y-3">
        <OrgMembership embedded only="join-create" />
      </section>
    </div>
  );
}
