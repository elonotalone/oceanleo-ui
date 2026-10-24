"use client";
// W09B skeleton — full implementation follows in the next commits.
import type { SkillDetailModalProps } from "./types";

export function SkillDetailModal(props: SkillDetailModalProps) {
  if (!props.open) return null;
  return <div data-testid="skill-detail-modal" />;
}
