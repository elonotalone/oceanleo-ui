import {
  normalizeSelectionCommand,
  selectionRequestId,
  type SelectionCommand,
  type SelectionContext,
} from "../selection-context";
import type { SelectionCommandGate } from "../selection-transactions";
import type { EditorMode } from "../hosted-editor";

export const HOSTED_DECK_HUMAN_ORIGINS = ["user", "human", "l1", "l2"] as const;
export type HostedDeckHumanOrigin = (typeof HOSTED_DECK_HUMAN_ORIGINS)[number];

const ORIGIN_SET = new Set<string>(HOSTED_DECK_HUMAN_ORIGINS);

/** Closed PPTist `applySelectionCommand` ids. Unknown JSON is not a bridge. */
export const HOSTED_DECK_CONTROL_IDS = new Set([
  "slide-add",
  "slide-duplicate",
  "slide-delete",
  "slide-background",
  "slide-notes",
  "element-delete",
  "element-lock",
  "element-bring-forward",
  "element-send-backward",
  "text-color",
  "text-fill",
  "text-line-height",
  "text-word-space",
  "text-opacity",
  "text-vertical",
  "image-replace",
  "image-flip-h",
  "image-flip-v",
  "shape-fill",
  "shape-outline-color",
  "shape-outline-width",
  "shape-opacity",
]);

export const HOSTED_DECK_ELEMENT_KINDS = new Set([
  "deck-text",
  "deck-image",
  "deck-shape",
  "deck-line",
  "deck-chart",
  "deck-table",
  "deck-latex",
  "deck-video",
  "deck-audio",
  "deck-element",
]);

export const DECK_HOSTED_SELECT_OBJECT_HINT = "请先选中对象再改格式。";

export function hostedDeckHumanOrigin(value: unknown): HostedDeckHumanOrigin | null {
  return typeof value === "string" && ORIGIN_SET.has(value)
    ? (value as HostedDeckHumanOrigin)
    : null;
}

export function hostedDeckClosedControlId(value: unknown): string | null {
  return typeof value === "string" && HOSTED_DECK_CONTROL_IDS.has(value)
    ? value
    : null;
}

export type HostedDeckSelectionCommandEnvelope = {
  type: "selection-command";
  command: SelectionCommand;
  origin: HostedDeckHumanOrigin;
};

export type HostedDeckAgentSelectionEnvelope = {
  type: "selection-command";
  command: SelectionCommand;
};

export type HostedDeckSelectionPlan =
  | { ok: true; envelope: HostedDeckSelectionCommandEnvelope }
  | { ok: false; error: string };

export type HostedDeckAgentSelectionPlan =
  | { ok: true; envelope: HostedDeckAgentSelectionEnvelope }
  | { ok: false; error: string };

export type HostedDeckSelectionSendResult =
  | { ok: true; applied: boolean; reviewed: boolean; message: string }
  | { ok: false; message: string };

export function hostedDeckHostEditBarActive(input: {
  mode: EditorMode | string;
  ready: boolean;
  hasSource: boolean;
  readOnly: boolean;
}): boolean {
  return (
    input.mode === "normal" &&
    input.ready &&
    input.hasSource &&
    !input.readOnly
  );
}

export function deckHostedItemReadOnly(item: {
  artifact?: {
    editability?: string;
    access?: { canEdit?: boolean };
  } | null;
  meta?: Record<string, unknown> | null;
} | null | undefined): boolean {
  if (!item) return false;
  const artifact = item.artifact;
  if (artifact?.editability === "view_only") return true;
  if (artifact?.access && artifact.access.canEdit === false) return true;
  return String(item.meta?.editability || "") === "view_only";
}

export function hostedDeckSelectionForToolbar(
  selection: SelectionContext | null,
): SelectionContext | null {
  if (!selection) return null;
  if (!HOSTED_DECK_ELEMENT_KINDS.has(selection.kind)) return null;
  const controls = (selection.controls || []).filter((control) =>
    HOSTED_DECK_CONTROL_IDS.has(control.id),
  );
  if (controls.length === 0) return null;
  return { ...selection, controls };
}

export function hostedDeckFormatFillCommand(input: {
  selectionId: string;
  color: string;
  selectionRevision?: SelectionContext["revision"];
  selectionEpoch?: SelectionContext["epoch"];
}): SelectionCommand | null {
  return normalizeSelectionCommand({
    requestId: selectionRequestId(),
    selectionId: input.selectionId,
    controlId: "shape-fill",
    value: input.color,
    ...(input.selectionRevision !== undefined
      ? { selectionRevision: input.selectionRevision }
      : {}),
    ...(input.selectionEpoch !== undefined
      ? { selectionEpoch: input.selectionEpoch }
      : {}),
  });
}

function closedDeckCommand(command: SelectionCommand | null): SelectionCommand | null {
  if (!command) return null;
  if (!hostedDeckClosedControlId(command.controlId)) return null;
  return command;
}

function selectionIdentityGate(input: {
  command: SelectionCommand;
  liveSelectionId?: string | null;
  liveSelectionRevision?: SelectionContext["revision"];
}): string | null {
  if (!input.command.selectionId) {
    return DECK_HOSTED_SELECT_OBJECT_HINT;
  }
  if (
    input.liveSelectionId &&
    input.command.selectionId !== input.liveSelectionId
  ) {
    return "选择已变化，请重新选择后再编辑。";
  }
  if (
    input.liveSelectionRevision !== undefined &&
    input.command.selectionRevision !== undefined &&
    String(input.command.selectionRevision) !== String(input.liveSelectionRevision)
  ) {
    return "选择已过期，请重新选择后再编辑。";
  }
  return null;
}

export function hostedDeckSelectionCommandEnvelope(input: {
  command: SelectionCommand | null;
  origin: unknown;
  ready: boolean;
  readOnly: boolean;
  liveSelectionId?: string | null;
  liveSelectionRevision?: SelectionContext["revision"];
}): HostedDeckSelectionPlan {
  const origin = hostedDeckHumanOrigin(input.origin);
  if (!origin) {
    return {
      ok: false,
      error: "幻灯片选区命令缺少人类来源章，未发给专业编辑器。",
    };
  }
  if (!input.ready) {
    return { ok: false, error: "专业幻灯片还没打开，不能改选区。" };
  }
  if (input.readOnly) {
    return { ok: false, error: "这份演示文稿正在只读，选区命令已拒绝。" };
  }
  const command = closedDeckCommand(input.command);
  if (!command) {
    return { ok: false, error: "专业幻灯片没有这条指令。" };
  }
  const identity = selectionIdentityGate({
    command,
    liveSelectionId: input.liveSelectionId,
    liveSelectionRevision: input.liveSelectionRevision,
  });
  if (identity) return { ok: false, error: identity };
  return {
    ok: true,
    envelope: {
      type: "selection-command",
      command,
      origin,
    },
  };
}

/**
 * Agent/planner path. Never reads params.origin and never mints a human stamp.
 * A forged `origin:user` argument still parks through the unstamped envelope.
 */
export function planDeckHostedAgentSelectionCommand(input: {
  command: SelectionCommand | null;
  ready: boolean;
  readOnly: boolean;
  liveSelectionId?: string | null;
  liveSelectionRevision?: SelectionContext["revision"];
}): HostedDeckAgentSelectionPlan {
  if (!input.ready) {
    return { ok: false, error: "专业幻灯片还没打开，不能改选区。" };
  }
  if (input.readOnly) {
    return { ok: false, error: "这份演示文稿正在只读，选区命令已拒绝。" };
  }
  const command = closedDeckCommand(input.command);
  if (!command) {
    return { ok: false, error: "专业幻灯片没有这条指令。" };
  }
  if (!input.liveSelectionId) {
    return { ok: false, error: DECK_HOSTED_SELECT_OBJECT_HINT };
  }
  const identity = selectionIdentityGate({
    command,
    liveSelectionId: input.liveSelectionId,
    liveSelectionRevision: input.liveSelectionRevision,
  });
  if (identity) return { ok: false, error: identity };
  return {
    ok: true,
    envelope: {
      type: "selection-command",
      command,
    },
  };
}

export function sendDeckHostedHumanSelectionCommand(input: {
  command: unknown;
  selection: SelectionContext | null;
  ready: boolean;
  readOnly: boolean;
  origin: unknown;
  gate: Pick<SelectionCommandGate, "accept">;
  send: (message: Record<string, unknown>) => boolean;
}): HostedDeckSelectionSendResult {
  const command = closedDeckCommand(
    commandFromUnknown(input.command),
  );
  const planned = hostedDeckSelectionCommandEnvelope({
    command,
    origin: input.origin,
    ready: input.ready,
    readOnly: input.readOnly,
    liveSelectionId: input.selection?.id ?? null,
    liveSelectionRevision: input.selection?.revision,
  });
  if (!planned.ok) return { ok: false, message: planned.error };
  if (!input.gate.accept(planned.envelope.command, input.selection)) {
    return { ok: false, message: "选择已变化，请重新选择后再编辑。" };
  }
  const sent = input.send({
    type: "selection-command",
    command: planned.envelope.command,
    origin: planned.envelope.origin,
  });
  if (!sent) {
    return { ok: false, message: "选区命令没有送到专业幻灯片。" };
  }
  return {
    ok: true,
    applied: true,
    reviewed: false,
    message: "已把这条选区命令交给专业幻灯片。",
  };
}

export function sendDeckHostedAgentSelectionCommand(input: {
  command: unknown;
  ready: boolean;
  readOnly: boolean;
  liveSelectionId: string | null;
  liveSelectionRevision?: SelectionContext["revision"];
  send: (message: Record<string, unknown>) => boolean;
}): HostedDeckSelectionSendResult {
  const planned = planDeckHostedAgentSelectionCommand({
    command: commandFromUnknown(input.command),
    ready: input.ready,
    readOnly: input.readOnly,
    liveSelectionId: input.liveSelectionId,
    liveSelectionRevision: input.liveSelectionRevision,
  });
  if (!planned.ok) return { ok: false, message: planned.error };
  const sent = input.send({
    type: "selection-command",
    command: planned.envelope.command,
  });
  if (!sent) {
    return { ok: false, message: "选区命令没有送到专业幻灯片。" };
  }
  return {
    ok: true,
    applied: false,
    reviewed: true,
    message: "已提交审阅，接受后才会改动文档",
  };
}

function commandFromUnknown(value: unknown): SelectionCommand | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const direct = normalizeSelectionCommand(record);
    if (direct) return direct;
    if (record.command && typeof record.command === "object") {
      return normalizeSelectionCommand(record.command);
    }
  }
  return null;
}

export function buildDeckHostedCommandSurface(input: {
  ready: boolean;
  readOnly: boolean;
  hasSource: boolean;
  liveSelectionId: string | null;
  liveSelectionRevision?: SelectionContext["revision"];
  sendAgent: (message: Record<string, unknown>) => boolean;
}): {
  editorId: "deck";
  describe: () => Array<{
    id: string;
    label: string;
    summary: string;
    mutates: boolean;
    params?: Array<{ key: string; label: string; type: "string"; required?: boolean }>;
  }>;
  state: () => Record<string, unknown>;
  run: (
    id: string,
    params?: Record<string, unknown>,
  ) => { ok: boolean; applied?: boolean; reviewed?: boolean; message: string };
} {
  const canMutate = input.ready && input.hasSource && !input.readOnly;
  return {
    editorId: "deck",
    describe() {
      return [
        {
          id: "deck.describe-hosted",
          label: "专业幻灯片状态",
          summary: "看 PPTist 是否已经载入、当前能不能改选区。",
          mutates: false,
        },
        ...(canMutate
          ? [
              {
                id: "deck.format-fill",
                label: "改填充色",
                summary: "把一条已知 PPTist 填色命令送审；代理不能盖人类章。",
                mutates: true,
                params: [
                  { key: "color", label: "颜色", type: "string" as const, required: true },
                ],
              },
            ]
          : []),
      ];
    },
    state() {
      return {
        ready: input.ready,
        readOnly: input.readOnly,
        hasSource: input.hasSource,
        kernel: "pptist-hosted",
        selectionId: input.liveSelectionId,
        origin: null,
        hostEditBar: hostedDeckHostEditBarActive({
          mode: "normal",
          ready: input.ready,
          hasSource: input.hasSource,
          readOnly: input.readOnly,
        }),
      };
    },
    run(id, params) {
      if (id === "deck.describe-hosted") {
        return {
          ok: true,
          message: input.ready
            ? input.readOnly
              ? "专业幻灯片已载入，当前只读。"
              : "专业幻灯片已载入，可以改选区。"
            : "专业幻灯片还没载入。",
        };
      }
      if (!canMutate) {
        return { ok: false, message: "专业幻灯片还没载入或正在只读，不能改。" };
      }
      if (id !== "deck.format-fill") {
        return { ok: false, message: "专业幻灯片没有这条指令。" };
      }
      void params?.origin;
      if (!input.liveSelectionId) {
        return { ok: false, message: DECK_HOSTED_SELECT_OBJECT_HINT };
      }
      const command = hostedDeckFormatFillCommand({
        selectionId: input.liveSelectionId,
        color: String(params?.color || ""),
        selectionRevision: input.liveSelectionRevision,
      });
      const result = sendDeckHostedAgentSelectionCommand({
        command,
        ready: input.ready,
        readOnly: input.readOnly,
        liveSelectionId: input.liveSelectionId,
        liveSelectionRevision: input.liveSelectionRevision,
        send: input.sendAgent,
      });
      return {
        ok: result.ok,
        applied: result.ok ? result.applied : false,
        reviewed: result.ok ? result.reviewed : false,
        message: result.message,
      };
    },
  };
}
