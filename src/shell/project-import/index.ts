/**
 * Public surface for project import: one component and its props.
 *
 * Deliberately narrow. The host mounts the panel and is told, once, that a
 * project now exists; everything about filtering, gates, and upload shape stays
 * inside this directory.
 */

export { ProjectImportPanel } from "./ProjectImportPanel";
export type { ProjectImportPanelProps } from "./ProjectImportPanel";
export type { ImportPlan, ImportedProject } from "./project-import-client";
