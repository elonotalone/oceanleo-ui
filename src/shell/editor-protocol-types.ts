import type {
  SelectionCommand,
  SelectionContext,
  SelectionControlIcon,
  SelectionControlValue,
  SelectionRevision,
} from "./selection-context";

export declare const EDITOR_PROTOCOL: "oceanleo.editor.v1";

export type EditorMessageSeverity = "fatal" | "warning" | "info";

export interface EditorAssetPayload {
  id: string;
  kind: string;
  title: string;
  url?: string;
  previewUrl?: string;
  meta: Record<string, unknown>;
  writable: boolean;
  /** Durable identity when the host opened a typed artifact revision. */
  artifactId?: string;
  revisionId?: string;
  artifactType?: string;
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

export type EditorProjectViewRole = "page" | "artifact";
export type EditorProjectActionPlacement = "document" | "download";
/**
 * 规范 v2 §4 的动作分组（plugin-chrome X3）：edit → 编辑栏；save → 第一行
 * 保存菜单；download → 第一行下载菜单。缺省由 `placement` 推：
 * `download` → "download"，其余 → "edit"。宿主只按这个字段分发，不看 label / id。
 */
export type EditorProjectActionGroup = "edit" | "save" | "download";
export type EditorHostChrome = "host";

export interface EditorProjectView {
  id: string;
  label: string;
  icon?: EditorProjectIcon;
  active: boolean;
  disabled?: boolean;
  /** 缺省 "page" = 第二行附加页；"artifact" = 成品页，宿主映射到「编辑」。 */
  role?: EditorProjectViewRole;
  /** 不可用时的人话原因，透传到页签 title。 */
  unavailableReason?: string;
}

export interface EditorProjectAction {
  id: string;
  label: string;
  busyLabel?: string;
  icon?: EditorProjectIcon;
  variant?: "default" | "primary" | "danger" | "icon";
  disabled?: boolean;
  busy?: boolean;
  /** 缺省 "document" = 编辑栏文档段；"download" = 第一行下载菜单。 */
  placement?: EditorProjectActionPlacement;
  /**
   * 缺省按 `placement` 推（download → "download"，其余 → "edit"）。
   * website 的 套用草稿 / 保存 / 放弃草稿 / 重新加载 声明 "save"，进第一行保存菜单，
   * 永不进编辑栏。
   */
  group?: EditorProjectActionGroup;
}

export interface EditorProjectManifest {
  revision: EditorDocumentRevision;
  views: EditorProjectView[];
  actions: EditorProjectAction[];
  /**
   * 第二行「专业编辑」页签的可选申报（plugin-ui U5，只加不减）。
   * `label`：内核名（网站 = "Puck"）；缺省宿主画「专业编辑」。
   * `unavailableReason`：给人话原因写进页签 title，页签**不隐藏**（规范 v2 §3）。
   * 两者都是 ≤ 200 字的字符串；非法或缺省视为没说，旧宿主收到直接忽略。
   */
  pro?: {
    label?: string;
    unavailableReason?: string;
  };
}

export type EditorRecoveryValue =
  | null
  | boolean
  | number
  | string
  | EditorRecoveryValue[]
  | { [key: string]: EditorRecoveryValue };

// ─── 宿主契约 v2（W01，2026-09-03，editor-core-swap）────────────────────────
// **只加不减。** v1 的 17 条 editor→host 与 14 条 host→editor 一条没删、
// 一个既有字段没改类型、没有任何字段从可选变必填。新增的是：
//   host→editor  : set-mode / hide-chrome / review-decision
//   editor→host  : review-proposal
//   tools-manifest: 多两个**可选**字段（manifestVersion、chips）
// ⇒ 只会说 v1 的编辑器不发 chips、不发 review-proposal，宿主照旧工作；
//   只会读 v1 的宿主收到 v2 消息时走白名单前的 `has(type)` 直接丢弃，不会崩。
//   这就是这里「向后兼容」的确切含义，`tests/hosted-editor-contract-v2.test.mjs` 钉住它。

/** L3 专业模式开关的两个取值。默认 `normal`（R3：默认普通模式）。 */
export type EditorMode = "normal" | "pro";

/** L4 快捷动作 chip 的类别；闭集，宿主按它选图标与分组。 */
export type EditorAgentChipKind =
  | "analyze"
  | "cleanup"
  | "export"
  | "extract"
  | "generate"
  | "layout"
  | "restyle"
  | "rewrite"
  | "summarize"
  | "translate";

/** 一个 L4 快捷动作的声明（五层规范 §2：chips ≤ 8）。 */
export interface EditorAgentChip {
  id: string;
  label: string;
  kind: EditorAgentChipKind;
  /** 对哪些选区类型（`SelectionContext.kind`）生效；`["*"]` = 任意，含无选区。 */
  appliesTo: string[];
  /** 送进 agent 的提示词模板；`{selection}` / `{document}` 由宿主替换。 */
  prompt: string;
  icon?: EditorProjectIcon;
}

export type EditorReviewChangeOp = "add" | "remove" | "update" | "move";

/** 对象类编辑器（画布/幻灯片/表格）的逐项变更，替代文本 diff。 */
export interface EditorReviewObjectChange {
  id: string;
  op: EditorReviewChangeOp;
  label: string;
  before?: string;
  after?: string;
}

/**
 * agent 改动进 L4 审阅的载荷。
 *
 * 规范 §7 判据 3「agent 改动 100% 进 L4 审阅；**接受前文档 revision 不前进**」
 * ⇒ `revision` 必须是**提案尚未落地时**的当前 revision。宿主拿它做守卫：
 * 收到 `review-proposal` 后若 revision 前进了，说明编辑器偷跑，判红。
 */
export interface EditorReviewProposal {
  proposalId: string;
  /** 落地时要执行的那一条命令——「一个命令一个执行器」（规范 §2.1 第 2 条）。 */
  commandId: string;
  summary: { before: string; after: string };
  /** `diff` 与 `objects` **恰好给一个**：文本类给 diff，对象类给变更清单。 */
  diff?: string;
  objects?: EditorReviewObjectChange[];
  targetSelection: SelectionContext | null;
  revision: EditorDocumentRevision;
}

export type EditorReviewDecision = "accept" | "reject";

export interface EditorRecoverySnapshot {
  revision: EditorDocumentRevision;
  confirmedRevision?: EditorDocumentRevision;
  payload: EditorRecoveryValue;
}

export type HostToEditorMessage =
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "init";
      instanceId: string;
      /** 宿主画两行 chrome。缺省 = 旧宿主未声明。 */
      chrome?: EditorHostChrome;
    }
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
      artifactId?: string;
      revisionId?: string;
      code?: string;
      currentRevisionId?: string;
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
    }
  // ── v2 ───────────────────────────────────────────────────────────────────
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "set-mode";
      instanceId: string;
      mode: EditorMode;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "hide-chrome";
      instanceId: string;
      toolbar: boolean;
      panels: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "review-decision";
      instanceId: string;
      proposalId: string;
      decision: EditorReviewDecision;
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
      /** v2：缺省即 v1。给了就必须是 2，且 `chips` 才会被读。 */
      manifestVersion?: 2;
      /** v2：L4 快捷动作声明，≤ 8 条。v1 编辑器不发这个字段。 */
      chips?: EditorAgentChip[];
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
      code?: string;
      severity?: EditorMessageSeverity;
      retryable?: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "recovery-result";
      instanceId: string;
      recoveryId: string;
      ok: boolean;
      revision?: EditorDocumentRevision;
      message?: string;
      code?: string;
      severity?: EditorMessageSeverity;
      retryable?: boolean;
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
      code?: string;
      severity?: EditorMessageSeverity;
      retryable?: boolean;
    }
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "close-request";
      instanceId: string;
    }
  // ── v2 ───────────────────────────────────────────────────────────────────
  | {
      protocol: typeof EDITOR_PROTOCOL;
      type: "review-proposal";
      instanceId: string;
      proposal: EditorReviewProposal;
    };
