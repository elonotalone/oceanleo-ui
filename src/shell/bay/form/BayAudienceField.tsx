"use client";

import type { ReactElement } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { UITranslate } from "../../../i18n/ui/useUI";
import { BayChoice } from "./BayChoice";
import { BaySelectMembers } from "./BaySelectMembers";
import { audienceDone, type BayAudience, type BayAudienceMode } from "./bay-audience";
import type { BayRevealItem } from "./BayRevealForm";

const MODES: readonly { value: BayAudienceMode; name: string }[] = [
  { value: "public", name: "所有人" },
  { value: "invited", name: "指定某人" },
  { value: "group", name: "指定一群人" },
];

function visibleMode(mode: BayAudienceMode): BayAudienceMode {
  return mode === "verified_first" ? "public" : mode;
}

export function BayAudienceField(props: {
  value: BayAudience;
  onChange: (next: BayAudience) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  const mode = visibleMode(props.value.mode);

  return (
    <div data-bay-audience="" data-bay-audience-mode={mode}>
      <BayChoice
        label={tt("向谁展示")}
        columns={1}
        value={mode}
        onChange={(next) => props.onChange({ ...props.value, mode: next })}
        disabled={props.disabled}
        optionProps={(value) => ({
          "data-bay-audience-option": value,
          "data-bay-help-mode": value,
        })}
        options={MODES.map((row) => ({
          value: row.value,
          title: tt(row.name),
        }))}
      />
      {mode === "invited" ? (
        <div className="mt-3">
          <BaySelectMembers
            selected={props.value.members}
            disabled={props.disabled}
            pick="single"
            onChange={(members) =>
              props.onChange({
                ...props.value,
                members,
                handle: members[0]?.kind === "group" ? "" : members[0]?.handle || members[0]?.name || "",
              })
            }
          />
        </div>
      ) : null}
      {mode === "group" ? (
        <div className="mt-3">
          <BaySelectMembers
            selected={props.value.members}
            disabled={props.disabled}
            pick="multi"
            onChange={(members) => props.onChange({ ...props.value, members })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function audienceModeLabel(mode: BayAudienceMode): string {
  const visible = visibleMode(mode);
  return MODES.find((row) => row.value === visible)?.name || MODES[0].name;
}

export function listingAudienceItem(
  tt: UITranslate,
  audience: BayAudience,
  onAudience: (next: BayAudience) => void,
  extra?: { disabled?: boolean },
): BayRevealItem {
  return {
    id: "who",
    label: "",
    done: audienceDone(audience),
    summary:
      audience.mode === "invited" && (audience.members[0]?.name || audience.handle.trim())
        ? `${tt(audienceModeLabel(audience.mode))} ${audience.members[0]?.name || audience.handle.trim()}`
        : audience.mode === "group"
          ? tt("已选 {n} 人", { n: audience.members.length })
          : tt(audienceModeLabel(audience.mode)),
    children: <BayAudienceField value={audience} onChange={onAudience} disabled={extra?.disabled} />,
  };
}
