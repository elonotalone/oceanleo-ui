/**
 * L0 / L3 chrome for the OpenVideo host. Create-time parts stay mounted;
 * visibility flips with mode so the same project instance is not rebuilt.
 */
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../../hosted-editor/index";

export interface VideoDesigncomboChrome {
  /** Vendor media column (left). */
  mediaPanel: boolean;
  /** Vendor inspector (right). */
  inspector: boolean;
  /** Vendor full timeline chrome (header, ruler extras). */
  timelineChrome: boolean;
  /** Vendor top header inside the kernel. */
  header: boolean;
}

export const VIDEO_DESIGNCOMBO_DEFAULT_MODE: EditorMode = DEFAULT_EDITOR_MODE;

export function videoDesigncomboChrome(mode: EditorMode): VideoDesigncomboChrome {
  const pro = mode === "pro";
  return {
    mediaPanel: pro,
    inspector: pro,
    timelineChrome: pro,
    header: pro,
  };
}

export const VIDEO_DESIGNCOMBO_MODE_INVARIANTS = [
  "projectId",
  "selectedClipId",
  "editRevision",
  "playheadUs",
] as const;

export type VideoDesigncomboModeInvariant =
  (typeof VIDEO_DESIGNCOMBO_MODE_INVARIANTS)[number];

export interface VideoDesigncomboModeFingerprint {
  projectId: string;
  selectedClipId: string;
  editRevision: number;
  playheadUs: number;
}

export function videoDesigncomboModeDrift(
  before: VideoDesigncomboModeFingerprint,
  after: VideoDesigncomboModeFingerprint,
): VideoDesigncomboModeInvariant[] {
  return VIDEO_DESIGNCOMBO_MODE_INVARIANTS.filter(
    (key) => before[key] !== after[key],
  );
}
