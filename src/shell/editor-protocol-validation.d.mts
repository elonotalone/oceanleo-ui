import type {
  EditorAgentChip,
  EditorAssetPayload,
  EditorDocumentRevision,
  EditorHistorySnapshot,
  EditorProjectAction,
  EditorProjectActionGroup,
  EditorProjectManifest,
  EditorProjectView,
  EditorRecoverySnapshot,
  EditorReviewProposal,
  EditorToHostMessage,
  EditorToolManifestEntry,
  HostToEditorMessage,
} from "./editor-protocol-types";
import type { SelectionContext } from "./selection-context";

export function validAssetUrl(value: unknown): boolean;
export function recordValue(
  value: unknown,
): Record<string, unknown> | null;
export function boundedString(
  value: unknown,
  max: number,
  required?: boolean,
): boolean;
export function boundedRecord(value: unknown, max: number): boolean;
export function validRevision(
  value: unknown,
): value is EditorDocumentRevision;
export function validManifestId(value: unknown): value is string;
export function normalizeEditorHistory(
  value: unknown,
): EditorHistorySnapshot | null;
export function validToolManifest(
  value: unknown,
): value is EditorToolManifestEntry[];
export function validProjectManifest(
  value: unknown,
): value is EditorProjectManifest;
export function validHostInitChrome(record: Record<string, unknown>): boolean;
export function projectActionGroup(
  action: Pick<EditorProjectAction, "group" | "placement"> | null | undefined,
): EditorProjectActionGroup;
export function classifyProjectManifest(manifest: EditorProjectManifest): {
  auxViews: readonly EditorProjectView[];
  artifactView: EditorProjectView | null;
  artifactViewId: string | null;
  activePageId: string;
  /** group === "edit"：进编辑栏文档段。 */
  documentActions: readonly EditorProjectAction[];
  /** group === "save"：进第一行保存菜单。 */
  saveActions: readonly EditorProjectAction[];
  /** group === "download"：进第一行下载菜单。 */
  downloadActions: readonly EditorProjectAction[];
  /** `manifest.pro.label`（≤ 200 字非空字符串）；否则 undefined。 */
  proLabel: string | undefined;
  /** `manifest.pro.unavailableReason`（≤ 200 字非空字符串）；否则 undefined。 */
  proUnavailableReason: string | undefined;
};
export function isEditorRecoverySnapshot(
  value: unknown,
): value is EditorRecoverySnapshot;
export function validAssetPayload(
  value: unknown,
): value is EditorAssetPayload;

// ── 宿主契约 v2 ─────────────────────────────────────────────────────────────
export const HOSTED_EDITOR_CONTRACT_VERSION: "2.0";
export function validAgentChips(
  value: unknown,
): value is EditorAgentChip[] | undefined;
export function validToolsManifestMessage(
  record: Record<string, unknown>,
): boolean;
export function validReviewProposal(
  value: unknown,
): value is EditorReviewProposal;
export function contractV2EditorToHost(
  type: string,
  record: Record<string, unknown>,
  normalizeSelection: (value: unknown) => SelectionContext | null,
): EditorToHostMessage | null;
export function contractV2HostToEditor(
  type: string,
  record: Record<string, unknown>,
): HostToEditorMessage | null;
