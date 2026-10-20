import {
  normalizeSelectionCommand,
  selectionRequestId,
  type SelectionCommand,
} from "../selection-context";

export const HOSTED_DECK_HUMAN_ORIGINS = ["user", "human", "l1", "l2"] as const;
export type HostedDeckHumanOrigin = (typeof HOSTED_DECK_HUMAN_ORIGINS)[number];

const ORIGIN_SET = new Set<string>(HOSTED_DECK_HUMAN_ORIGINS);

export function hostedDeckHumanOrigin(value: unknown): HostedDeckHumanOrigin | null {
  return typeof value === "string" && ORIGIN_SET.has(value)
    ? (value as HostedDeckHumanOrigin)
    : null;
}

export type HostedDeckSelectionCommandEnvelope = {
  type: "selection-command";
  command: SelectionCommand;
  origin: HostedDeckHumanOrigin;
};

export type HostedDeckSelectionPlan =
  | { ok: true; envelope: HostedDeckSelectionCommandEnvelope }
  | { ok: false; error: string };

export function hostedDeckInsertTextCommand(input: {
  selectionId: string;
  text: string;
}): SelectionCommand | null {
  return normalizeSelectionCommand({
    requestId: selectionRequestId(),
    selectionId: input.selectionId,
    controlId: "edit-text",
    value: input.text,
  });
}

export function hostedDeckFormatFillCommand(input: {
  selectionId: string;
  color: string;
}): SelectionCommand | null {
  return normalizeSelectionCommand({
    requestId: selectionRequestId(),
    selectionId: input.selectionId,
    controlId: "fill",
    value: input.color,
  });
}

export function hostedDeckSelectionCommandEnvelope(input: {
  command: SelectionCommand | null;
  origin: unknown;
  ready: boolean;
  readOnly: boolean;
  liveSelectionId?: string | null;
  liveSelectionRevision?: number;
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
  const command = input.command;
  if (!command) {
    return { ok: false, error: "选区命令不合法，未发给专业编辑器。" };
  }
  if (
    input.liveSelectionId &&
    command.selectionId &&
    command.selectionId !== input.liveSelectionId
  ) {
    return { ok: false, error: "选择已变化，请重新选择后再编辑。" };
  }
  if (
    input.liveSelectionRevision !== undefined &&
    command.selectionRevision !== undefined &&
    command.selectionRevision !== input.liveSelectionRevision
  ) {
    return { ok: false, error: "选择已过期，请重新选择后再编辑。" };
  }
  return {
    ok: true,
    envelope: {
      type: "selection-command",
      command,
      origin,
    },
  };
}

export function buildDeckHostedCommandSurface(input: {
  ready: boolean;
  readOnly: boolean;
  hasSource: boolean;
  liveSelectionId: string | null;
  send: (envelope: HostedDeckSelectionCommandEnvelope) => boolean;
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
  ) => { ok: boolean; message: string };
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
                id: "deck.insert-text",
                label: "插入或改文字",
                summary: "把一条带人类章的选区文字命令交给专业幻灯片。",
                mutates: true,
                params: [
                  { key: "text", label: "文字", type: "string" as const, required: true },
                ],
              },
              {
                id: "deck.format-fill",
                label: "改填充色",
                summary: "把一条带人类章的选区填色命令交给专业幻灯片。",
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
      const selectionId = input.liveSelectionId || "slide-1";
      const command =
        id === "deck.insert-text"
          ? hostedDeckInsertTextCommand({
              selectionId,
              text: String(params?.text || ""),
            })
          : id === "deck.format-fill"
            ? hostedDeckFormatFillCommand({
                selectionId,
                color: String(params?.color || ""),
              })
            : null;
      const planned = hostedDeckSelectionCommandEnvelope({
        command,
        // This is the agent command surface, not a human toolbar callback.
        // Never mint a human-origin stamp from model-provided parameters.
        origin: null,
        ready: input.ready,
        readOnly: input.readOnly,
        liveSelectionId: input.liveSelectionId,
      });
      if (!planned.ok) return { ok: false, message: planned.error };
      const sent = input.send(planned.envelope);
      if (!sent) {
        return { ok: false, message: "选区命令没有送到专业幻灯片。" };
      }
      return { ok: true, message: "选区命令已交给专业幻灯片。" };
    },
  };
}
