// Skills overhaul 2026-10-24 — W09A. Shapes mirror contract §3.2 exactly
// (oceanleo/docs/work-logs/2026-10-24-skills-overhaul/00-contract.md).

export interface OfficialSkill {
  name: string;
  title: string;
  title_zh: string;
  description: string;
  summary_zh: string;
  category: string;
  version: string;
  author: string;
  license: string;
  connectors: string[];
  tools: string[];
  /** ISO 8601 */
  updated_at: string;
  /** Gateway-relative (`/v1/skills/official/<name>/cover.svg`). */
  cover_url: string;
  file_count: number;
  /** Gateway-relative (`/v1/skills/official/<name>/download`). */
  download_url: string;
  /** Portal path (`/skills/<name>`). */
  share_path: string;
}

export interface OfficialSkillCategory {
  id: string;
  label: string;
  label_zh: string;
}

export type TreeEntryKind = "markdown" | "code" | "text" | "image" | "binary";

export interface TreeEntry {
  path: string;
  type: "file" | "dir";
  size?: number;
  kind?: TreeEntryKind;
}

export interface FileContent {
  path: string;
  kind: TreeEntryKind;
  size: number;
  text?: string;
  truncated?: boolean;
  data_url?: string;
}

export type FolderSource = "official" | "upload" | "github" | "created" | "copy";

export interface FolderSkillInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export interface Folder {
  id: string;
  title: string;
  source: FolderSource;
  origin: Record<string, unknown>;
  project_id: string | null;
  skill: FolderSkillInfo | null;
  cover_url: string | null;
  file_count: number;
  total_bytes: number;
  created_at: string;
  updated_at: string;
  can_edit: boolean;
  official: OfficialSkill | null;
}

export type FolderApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: string; status: number };

export type FolderErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid_zip"
  | "zip_too_large"
  | "unsafe_path"
  | "not_a_skill"
  | "github_unsupported"
  | "github_fetch_failed"
  | "quota_exceeded"
  | "rate_limited"
  | "invalid_skill"
  | "already_exists";
