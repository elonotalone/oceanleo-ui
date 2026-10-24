"use client";
// W09B skeleton — full implementation follows in the next commits.
import type { OfficialSkillLibraryDialogProps } from "./types";

export function OfficialSkillLibraryDialog(props: OfficialSkillLibraryDialogProps) {
  if (!props.open) return null;
  return <div data-testid="official-skill-library" />;
}
