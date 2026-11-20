"use client";

import { CloseGlyph } from "../composer/icons";
import { useEffect, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { getProfiles, type PersonCard } from "../../../lib/im/people-api";
import { QUIET } from "../MessageSettingsFrame";
import { PeopleFailure, PeopleSuggestions } from "./PeopleDiscovery";

export interface MemberPickerProps {
  selected: string[];
  onChange: (ids: string[]) => void;
  mode?: "multi" | "single";
  existingIds?: string[];
  extraIds?: string[];
  autoFocus?: boolean;
}

export function MemberPicker({ selected, onChange, mode = "multi", existingIds = [], extraIds = [] }: MemberPickerProps) {
  const tt = useUI();
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const key = [...new Set([...selected, ...extraIds])].join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    getProfiles(key.split(",")).then(people => { if (alive) setNames(old => ({ ...old, ...Object.fromEntries(people.map(p => [p.user_id, p.remark || p.display_name])) })); }, e => { if (alive) setError(e); });
    return () => { alive = false; };
  }, [key]);
  function pick(person: PersonCard) {
    if (person.blocked || existingIds.includes(person.user_id)) return;
    setNames(old => ({ ...old, [person.user_id]: person.name }));
    const on = selected.includes(person.user_id);
    onChange(mode === "single" ? on ? [] : [person.user_id] : on ? selected.filter(id => id !== person.user_id) : [...selected, person.user_id]);
  }
  return <div data-member-picker>
    <div data-picker-chips className="mb-2 flex flex-wrap gap-2">{selected.map(id => <button key={id} type="button" aria-label={tt("移除")} className={QUIET} onClick={() => onChange(selected.filter(value => value !== id))}>{names[id] ?? id} <CloseGlyph /></button>)}</div>
    {error != null && <PeopleFailure error={error} />}
    <PeopleSuggestions mode="select" selectedIds={selected} existingIds={existingIds} onPick={pick} />
  </div>;
}
