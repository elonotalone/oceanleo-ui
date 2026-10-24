"use client";
// W09B skeleton — full implementation follows in the next commits.
import type { AvailableSkill } from "./logic";
import type { SkillPickerListProps } from "./types";

export function useAvailableSkills(_projectId?: string): { skills: AvailableSkill[]; loading: boolean } {
  return { skills: [], loading: false };
}

export function SkillPickerList(_props: SkillPickerListProps) {
  return <div role="listbox" data-testid="skill-picker-list" />;
}
