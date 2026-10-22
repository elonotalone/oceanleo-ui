/**
 * Read-time alias: the old design canvas and the image editor are one material
 * type, `image`. Stored `canvas` / design items are never rewritten; every
 * reader asks `displayKindFor(item)` instead of branching on the stored kind.
 *
 * A bare `canvas` item that is not a design document (a workflow board, a
 * video canvas) stays `canvas`.
 */

import type { LibraryItem, LibraryKind } from "./library-data";

const DESIGN_DOCUMENT_SCHEMA = "oceanleo.design-document.v1";

type AliasProbe = Pick<LibraryItem, "kind"> &
  Partial<Pick<LibraryItem, "artifactType" | "meta" | "artifact">>;

/** Stored editor ids / hints that mean "the old design canvas". */
const LEGACY_DESIGN_EDITOR_IDS = new Set(["design-canvas", "design", "design_canvas"]);

export function isLegacyDesignItem(item: AliasProbe | null | undefined): boolean {
  if (!item) return false;
  if (item.artifactType === "composite_image") return true;
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  if (LEGACY_DESIGN_EDITOR_IDS.has(String(meta.editor || ""))) return true;
  if (String(meta.editor_project_schema || "") === DESIGN_DOCUMENT_SCHEMA) return true;
  if (meta.designDocument && typeof meta.designDocument === "object") return true;
  const capability = item.artifact?.editorCapability;
  return capability === "design-canvas" && item.artifactType !== "workflow";
}

/** Map a stored kind string (`canvas`, `design`, ...) to the one `image` type. */
export function aliasLegacyKind(kind: string): string {
  const value = String(kind || "").trim().toLowerCase();
  return value === "design" || value === "design-canvas" || value === "design_canvas"
    ? "image"
    : kind;
}

export function displayKindFor(item: AliasProbe): LibraryKind {
  if (item.kind === "canvas" && isLegacyDesignItem(item)) return "image";
  return item.kind;
}
