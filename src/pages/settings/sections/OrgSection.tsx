"use client";

import { useEffect, useState } from "react";
import { OrgMembership } from "../../OrgMembership";
import { OrgPage } from "../../OrgPage";
import { useUI } from "../../../i18n/ui/useUI";

const ORG_PANES = [
  { id: "mine", label: "我的团队" },
  { id: "create", label: "创建团队" },
  { id: "join", label: "加入团队" },
] as const;

export type OrgPane = (typeof ORG_PANES)[number]["id"];

export function OrgSection({
  orgHref: _orgHref,
  initialPane = "mine",
}: {
  orgHref?: string;
  initialPane?: OrgPane;
}) {
  void _orgHref;
  const tt = useUI();
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);
  const [pane, setPane] = useState<OrgPane>(initialPane);
  useEffect(() => {
    setPane(initialPane);
  }, [initialPane]);
  return (
    <div data-settings-pane="team" className="space-y-4">
      <div
        className="flex gap-1"
        data-org-settings-tabs=""
        role="tablist"
      >
        {ORG_PANES.map((item) => {
          const active = pane === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-org-settings-tab={item.id}
              aria-selected={active}
              className={`rounded-lg px-3 py-2 text-[13px] font-medium ${
                active ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
              onClick={() => setPane(item.id)}
            >
              {tt(item.label)}
            </button>
          );
        })}
      </div>
      {pane === "mine" ? (
        <section data-org-settings-block="mine" className="space-y-3">
          <p className="text-[12px] text-neutral-500">
            {tt("你所在的团队、花费和上限")}
          </p>
          <OrgPage key={`page:${revision}`} embedded onMembershipChanged={refresh} />
          <OrgMembership key={`membership:${revision}`} embedded hideWhenEmpty only="orgs" onMembershipChanged={refresh} />
        </section>
      ) : null}
      {pane === "create" ? (
        <section data-org-settings-block="create" className="space-y-3">
          <OrgMembership embedded hideWhenEmpty only="create" />
        </section>
      ) : null}
      {pane === "join" ? (
        <section data-org-settings-block="join" className="space-y-3">
          <OrgMembership embedded hideWhenEmpty only="join" />
        </section>
      ) : null}
    </div>
  );
}
