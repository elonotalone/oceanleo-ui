import type { MediaType } from "../lib/database";
import type {
  EditorDocumentRevision,
  EditorHistorySnapshot,
  EditorMaterialInsertion,
  EditorProjectManifest,
  EditorRecoverySnapshot,
  EditorToolManifestEntry,
  EditorViewportSnapshot,
} from "./editor-protocol";
import type { LibraryItem } from "./library-data";
import type { SelectionCommand, SelectionContext } from "./selection-context";

export interface EmbedEditorPaneProps {
  item: LibraryItem;
  editorBase: string;
  mediaType: MediaType;
  siteId?: string;
  accent?: string;
  extraParams?: Record<string, string>;
  onVersionSaved?: (item: LibraryItem) => void;
  onCloseRequest?: () => void;
  onDirtyChange?: (dirty: boolean, revision?: number) => void;
  onHistoryChange?: (history: EditorHistorySnapshot) => void;
  onToolsManifest?: (
    revision: EditorDocumentRevision,
    tools: EditorToolManifestEntry[],
  ) => void;
  onProjectManifest?: (manifest: EditorProjectManifest) => void;
  onProjectResult?: (result: {
    requestId: string;
    manifestRevision: EditorDocumentRevision;
    ok: boolean;
    message?: string;
  }) => void;
  onProtocolReset?: () => void;
  onSelectionChange?: (selection: SelectionContext | null) => void;
  onSelectionResult?: (result: {
    requestId: string;
    ok: boolean;
    message?: string;
  }) => void;
  onViewportChange?: (viewport: EditorViewportSnapshot) => void;
  onSaveResult?: (result: {
    ok: boolean;
    saveId?: string;
    item?: LibraryItem;
  }) => void;
  saveRequestId?: string;
  selectionCommand?: SelectionCommand | null;
  viewportCommand?: {
    commandId: string;
    value?: number;
    fit?: boolean;
  } | null;
  materialInsertion?: EditorMaterialInsertion | null;
  onMaterialResult?: (result: {
    commandId: string;
    ok: boolean;
    message?: string;
  }) => void;
  exportRequestId?: string;
  onExportResult?: (result: {
    exportId: string;
    ok: boolean;
    url?: string;
    message?: string;
  }) => void;
  projectCommand?: {
    requestId: string;
    kind: "view" | "action";
    targetId: string;
    manifestRevision: EditorDocumentRevision;
  } | null;
  recoveryCaptureRequestId?: string;
  onRecoverySnapshot?: (result: {
    recoveryId: string;
    ok: boolean;
    snapshot?: EditorRecoverySnapshot;
    message?: string;
  }) => void;
  recoveryRestore?: {
    recoveryId: string;
    snapshot: EditorRecoverySnapshot;
  } | null;
  onRecoveryResult?: (result: {
    recoveryId: string;
    ok: boolean;
    revision?: EditorDocumentRevision;
    message?: string;
  }) => void;
}
