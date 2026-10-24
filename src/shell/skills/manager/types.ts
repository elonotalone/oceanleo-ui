// Skills overhaul 2026-10-24 — W09B public prop shapes (contract §3.4, fixed).
import type { Folder } from "../kit";

/** Scope of a `SkillsManager`: the user's own skills, or one project's skills. */
export type SkillsManagerScope =
  | { kind: "personal" }
  | { kind: "project"; projectId: string; canEdit: boolean };

export interface SkillsManagerProps {
  scope: SkillsManagerScope;
  /** Optional override for "Add from official library"; default opens `OfficialSkillLibraryDialog`. */
  onOpenOfficialLibrary?: () => void;
}

export interface OfficialSkillLibraryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  onAdded?: (folder: Folder) => void;
}

export type SkillDetailTarget = { kind: "official"; name: string } | { kind: "folder"; id: string };

export interface SkillDetailModalProps {
  open: boolean;
  onClose: () => void;
  skill: SkillDetailTarget;
  projectId?: string;
  onAdded?: (folder: Folder) => void;
}

export interface SkillPickerListProps {
  projectId?: string;
  query: string;
  onPick: (name: string) => void;
}
