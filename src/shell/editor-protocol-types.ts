import type {
  SelectionCommand,
  SelectionContext,
  SelectionControlIcon,
  SelectionControlValue,
  SelectionRevision,
} from "./selection-context";

export declare const EDITOR_PROTOCOL: "oceanleo.editor.v1";

export interface EditorAssetPayload {
  id: string;
  kind: string;
  title: string;
  url?: string;
  previewUrl?: string;
  meta: Record<string, unknown>;
  writable: boolean;
}

export type EditorMaterialAction = "insert" | "replace" | "apply" | "merge";

export interface EditorMaterialInsertion {
  commandId: string;
  action: EditorMaterialAction;
  material: EditorAssetPayload;
  point?: { x: number; y: number };
}

export interface EditorViewportSnapshot {
  value: number;
  min: number;
  max: number;
  step?: number;
  canFit?: boolean;
}

export type EditorDocumentRevision = SelectionRevision;

export interface EditorHistorySnapshot {
  canUndo: boolean;
  canRedo: boolean;
  revision?: EditorDocumentRevision;
}

export type EditorProjectIcon =
  | SelectionControlIcon
  | "agent"
  | "file"
  | "library"
  | "settings"
  | "tasks"
  | "timeline"
  | "uploads";

export interface EditorToolChoice {
  value: SelectionControlValue;
  label: string;
  swatch?: string;
}

export interface EditorToolManifestEntry {
  id: string;
  label: string;
  icon?: EditorProjectIcon;
  controlId: string;
  choices: EditorToolChoice[];
}

export interface EditorProjectView {
  id: string;
  label: string;
  icon?: EditorProjectIcon;
  active: boolean;
  disabled?: boolean;
}

export interface EditorProjectAction {
  id: string;
  label: string;
  busyLabel?: string;
  icon?: EditorProjectIcon;
  variant?: "default" | "primary" | "danger" | "icon";
  disabled?: boolean;
  busy?: boolean;
}

export interface EditorProjectManifest {
  revision: EditorDocumentRevision;
  views: EditorProjectView[];
  actions: EditorProjectAction[];
}

export type EditorRecoveryValue =
  | null
  | boolean
  | number
  | string
  | EditorRecoveryValue[]
  | { [key: string]: EditorRecoveryValue };

export interface EditorRecoverySnapshot {
  revision: EditorDocumentRevision;
  confirmedRevision?: EditorDocumentRevision;
  payload: EditorRecoveryValue;
}

export type HostToEditorMessage =
  | { protocol: typeof EDITOR_PROTOCOL; type: "init"; instanceId: string }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "open-asset";
      instanceId: string;
      asset: EditorAssetPayload;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "save-request";
      instanceId: string;
      saveId: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "export-request";
      instanceId: string;
      exportId: string;
      format: "default";
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "project-view";
      instanceId: string;
      requestId: string;
      viewId: string;
      manifestRevision: EditorDocumentRevision;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "project-action";
      instanceId: string;
      requestId: string;
      actionId: string;
      manifestRevision: EditorDocumentRevision;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "recovery-capture";
      instanceId: string;
      recoveryId: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "recovery-restore";
      instanceId: string;
      recoveryId: string;
      snapshot: EditorRecoverySnapshot;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "set-host-layout";
      instanceId: string;
      sidePanelVisible: boolean;
      hostOwnsChrome?: boolean;
      hostOwnsViewport?: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "save-result";
      instanceId: string;
      ok: boolean;
      message: string;
      url?: string;
      saveId?: string;
      revision?: EditorDocumentRevision;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-command";
      instanceId: string;
      command: SelectionCommand;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "material-insert";
      instanceId: string;
      insertion: EditorMaterialInsertion;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "viewport-command";
      instanceId: string;
      commandId: string;
      value?: number;
      fit?: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "dispose";
      instanceId: string;
      disposeId: string;
    };

export type EditorToHostMessage =
  | { protocol: typeof EDITOR_PROTOCOL; type: "ready"; instanceId: string }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "dirty";
      instanceId: string;
      dirty?: boolean;
      revision?: number;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "artifact-created" | "artifact-updated";
      instanceId: string;
      url: string;
      previewUrl?: string;
      title?: string;
      meta?: Record<string, unknown>;
      saveId?: string;
      revision?: EditorDocumentRevision;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "history-changed";
      instanceId: string;
      history: EditorHistorySnapshot;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "tools-manifest";
      instanceId: string;
      revision: EditorDocumentRevision;
      tools: EditorToolManifestEntry[];
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "project-manifest";
      instanceId: string;
      manifest: EditorProjectManifest;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "project-result";
      instanceId: string;
      requestId: string;
      manifestRevision: EditorDocumentRevision;
      ok: boolean;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "recovery-snapshot";
      instanceId: string;
      recoveryId: string;
      ok: boolean;
      snapshot?: EditorRecoverySnapshot;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "recovery-result";
      instanceId: string;
      recoveryId: string;
      ok: boolean;
      revision?: EditorDocumentRevision;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-changed";
      instanceId: string;
      selection: SelectionContext | null;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "selection-result";
      instanceId: string;
      requestId: string;
      ok: boolean;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "material-result";
      instanceId: string;
      commandId: string;
      ok: boolean;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "export-result";
      instanceId: string;
      exportId: string;
      ok: boolean;
      url?: string;
      message?: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "viewport-changed";
      instanceId: string;
      viewport: EditorViewportSnapshot;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "error";
      instanceId: string;
      message: string;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "close-request";
      instanceId: string;
    };
