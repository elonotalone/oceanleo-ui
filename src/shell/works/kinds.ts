/** Kind differences live only in this catalog: labels and interface defaults. */
export type WorkKind = "website" | "game" | "app" | "miniprogram" | "other";
export interface WorkKindDefinition {
  kind: WorkKind;
  label: string;
  label_zh: string;
  preview: { frame: "browser" | "phone" | "game"; orientation: "any" | "portrait" | "landscape" };
  default_preset: string;
  default_boards: string[];
}
export const DEFAULT_WORK_KIND: WorkKind = "website";
export const FALLBACK_WORK_KIND: WorkKind = "other";
export const WORK_KINDS: readonly WorkKind[] = ["website", "game", "app", "miniprogram", "other"];
export const DEFAULT_KIND_DEFINITION: WorkKindDefinition = {
  kind: DEFAULT_WORK_KIND, label: "Website", label_zh: "网站",
  preview: { frame: "browser", orientation: "any" }, default_preset: "landing_page", default_boards: ["domain", "runtime_cost", "visits", "errors"],
};
export function normalizeWorkKind(value: unknown): WorkKind {
  return WORK_KINDS.includes(value as WorkKind) ? value as WorkKind : FALLBACK_WORK_KIND;
}
export function kindDefinition(kinds: readonly WorkKindDefinition[], kind: WorkKind): WorkKindDefinition {
  return kinds.find(entry => entry.kind === kind) || DEFAULT_KIND_DEFINITION;
}
/** Legacy Library rows still use artifact carrier types, independently of work kinds. */
export function workArtifactKind(kind: WorkKind): "website" | "game" { return kind === "game" ? "game" : "website"; }
export function fallbackKindLabel(kind: WorkKind): string {
  return ({ website: "网站", game: "游戏", app: "App", miniprogram: "小程序", other: "其他" })[kind];
}
