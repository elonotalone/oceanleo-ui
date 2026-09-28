"use client";

import { useState } from "react";
import { OrgMembership } from "../../OrgMembership";
import { OrgPage } from "../../OrgPage";
import { useUI } from "../../../i18n/ui/useUI";

const ORG_PANES = [
  { id: "mine", label: "我的组织" },
  { id: "create", label: "创建组织" },
  { id: "join", label: "加入组织" },
] as const;

type OrgPane = (typeof ORG_PANES)[number]["id"];

export function OrgSection({ orgHref: _orgHref }: { orgHref?: string }) {
  void _orgHref;
  const tt = useUI();
  const [pane, setPane] = useState<OrgPane>("mine");
  return (
    <div data-settings-pane="org" className="space-y-4">
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
            {tt("你所在的组织、本月在每个组织花了多少、谁看过你的任务")}
          </p>
          <OrgPage embedded />
          <OrgMembership embedded hideWhenEmpty only="views" />
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
