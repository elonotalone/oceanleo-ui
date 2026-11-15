import type { SelectionCommand, SelectionContext, SelectionControl, SelectionControlValue } from "../../selection-context";
import type { UITranslate } from "../../../i18n";
import type {
  CanvasCommandAvailability,
  CanvasCommandRequest,
} from "./command-registry";
import type {
  CanvasNodeDefinition,
  ProjectAsset,
  VideoProject,
} from "./project-model";

type SelectionAnchor = NonNullable<SelectionContext["anchor"]>;

export interface CanvasSelectionAdapterInput {
  project: VideoProject;
  node: CanvasNodeDefinition | null;
  asset?: ProjectAsset;
  selectionEpoch: number;
  imageMode: "retouch" | "generate";
  anchor?: SelectionAnchor;
  /**
   * 这些 label 会被送进 @oceanleo/ui 的共享 SelectionToolbar，
   * 和 DeckContextToolbar / FabricImageContextToolbar 产出的 label **并排显示在同一条工具条上**。
   * 那两个是 oceanleo-ui 内部组件、能直接 useUI()，这里是纯函数，所以把 tt 传进来。
   * 不传就会重演本轮那个缺陷：一条工具条上「水平翻转」和「Flip horizontal」并排。
   */
  tt: UITranslate;
  availability(
    commandId: string,
    args?: Record<string, unknown>,
  ): CanvasCommandAvailability;
  /**
   * Generate → Inpaint 的 durable mask URL。这是会话态，不写进 Project 节点。
   * 浮条上原来是本地 input；搬进左栏 inspector 后仍由 workflow 持有。
   */
  inpaintMaskUrl?: string;
}

export interface CanvasSelectionDispatch {
  commandId: string;
  args: Record<string, unknown>;
  phase?: "start" | "update" | "commit" | "cancel";
  transactionId?: string;
  incoming: Pick<
    CanvasCommandRequest,
    "requestId" | "projectVersionId" | "selectionEpoch"
  >;
}

function inspector(
  control: SelectionControl,
  group: string,
  label: string,
  icon: NonNullable<SelectionControl["icon"]>,
): SelectionControl {
  return {
    ...control,
    slot: "inspector",
    inspectorGroup: group,
    inspectorLabel: label,
    inspectorIcon: icon,
  };
}

function availableAction(
  input: CanvasSelectionAdapterInput,
  control: SelectionControl,
  commandId: string,
  args: Record<string, unknown> = {},
): SelectionControl[] {
  const availability = input.availability(commandId, args);
  return [
    {
      ...control,
      ...(availability.enabled
        ? {}
        : {
            disabled: true,
            unavailableReason: [
              availability.reasonCode,
              availability.reason ? input.tt(availability.reason) : undefined,
              availability.missingContract,
            ]
              .filter(Boolean)
              .join(" · "),
          }),
    },
  ];
}

function fieldControls(
  input: CanvasSelectionAdapterInput,
  node: CanvasNodeDefinition,
): SelectionControl[] {
  const controls: SelectionControl[] = [
    inspector(
      {
        id: "canvas.selection.title.set",
        kind: "text",
        label: input.tt("名称"),
        value: node.title,
      },
      "canvas-properties",
      "Properties",
      "effects",
    ),
  ];
  if (
    node.kind === "text" ||
    node.kind === "script" ||
    node.kind === "subtitle"
  ) {
    controls.push(
      inspector(
        {
          id: "canvas.selection.text.set",
          kind: "text",
          label: node.kind === "subtitle" ? input.tt("副标题") : input.tt("文本"),
          value: node.text || "",
        },
        "canvas-properties",
        "Properties",
        "effects",
      ),
    );
  }
  if (
    node.kind === "text" ||
    node.kind === "script" ||
    node.kind === "image" ||
    node.kind === "audio" ||
    node.kind === "video"
  ) {
    controls.push(
      inspector(
        {
          id: "canvas.selection.prompt.set",
          kind: "text",
          label: input.tt("提示词"),
          value: node.prompt || "",
        },
        "canvas-prompt",
        input.tt("提示词"),
        "note",
      ),
      inspector(
        {
          id: "canvas.selection.model.set",
          kind: "text",
          label: input.tt("模型"),
          value: node.model || "",
        },
        "canvas-prompt",
        input.tt("提示词"),
        "note",
      ),
    );
  }
  if (node.kind === "image" || node.kind === "video") {
    controls.push({
      id: "canvas.selection.ratio.set",
      kind: "select",
      label: input.tt("比例"),
      value: node.ratio || "16:9",
      options: [
        { value: "16:9", label: "16:9" },
        { value: "9:16", label: "9:16" },
        { value: "1:1", label: "1:1" },
      ],
    });
  }
  if (node.kind === "audio") {
    controls.push({ id: "canvas.selection.audio-mode.set", kind: "select", label: input.tt("音频"), value: node.audioMode || "voice", options: [{ value: "voice", label: input.tt("生成配音") }, { value: "music", label: input.tt("生成音乐") }] });
  }
  if (node.kind === "video" || node.kind === "subtitle" || node.kind === "audio") {
    controls.push({
      id: "canvas.selection.duration.set",
      kind: "number",
      label: input.tt("时长"),
      value: node.durationSeconds || (node.kind === "subtitle" ? 3 : node.kind === "audio" ? 30 : 5),
      min: 0.1,
      max: 3_600,
      step: 0.1,
      suffix: "s",
    });
  }
  if (node.kind === "image") {
    controls.push({
      id: "canvas.selection.image-mode.set",
      kind: "select",
      // "Image mode" / "Retouch" 在 en.ts 里没有对应中文 key，硬接会让 15 个非中文档
      // 从「露英文」倒退成「露中文」。留在 seed-gaps.json 的预算锁里，见交付说明。
      label: "Image mode",
      value: input.imageMode,
      options: [
        { value: "retouch", label: "Retouch" },
        { value: "generate", label: input.tt("开始生成") },
      ],
    });
  }
  return controls;
}

function lastAdjustParameters(node: CanvasNodeDefinition) {
  const recipe = node.localEditRecipe || [];
  for (let index = recipe.length - 1; index >= 0; index -= 1) {
    if (recipe[index].operation === "adjust") {
      const parameters = recipe[index].parameters;
      return {
        brightness: Number(parameters.brightness ?? 1),
        contrast: Number(parameters.contrast ?? 1),
        saturation: Number(parameters.saturation ?? 1),
        exposure: Number(parameters.exposure ?? 0),
      };
    }
  }
  return { brightness: 1, contrast: 1, saturation: 1, exposure: 0 };
}

function retouchAdjustControls(
  input: CanvasSelectionAdapterInput,
  node: CanvasNodeDefinition,
): SelectionControl[] {
  const current = lastAdjustParameters(node);
  return [
    inspector(
      {
        id: "canvas.selection.adjust.brightness.set",
        kind: "range",
        label: "Brightness",
        value: current.brightness,
        min: 0.25,
        max: 2,
        step: 0.05,
      },
      "canvas-adjust",
      "Adjust",
      "effects",
    ),
    inspector(
      {
        id: "canvas.selection.adjust.contrast.set",
        kind: "range",
        label: "Contrast",
        value: current.contrast,
        min: 0.25,
        max: 2,
        step: 0.05,
      },
      "canvas-adjust",
      "Adjust",
      "effects",
    ),
    inspector(
      {
        id: "canvas.selection.adjust.saturation.set",
        kind: "range",
        label: "Saturation",
        value: current.saturation,
        min: 0,
        max: 2,
        step: 0.05,
      },
      "canvas-adjust",
      "Adjust",
      "effects",
    ),
    inspector(
      {
        id: "canvas.selection.adjust.exposure.set",
        kind: "range",
        label: "Exposure",
        value: current.exposure,
        min: -2,
        max: 2,
        step: 0.1,
      },
      "canvas-adjust",
      "Adjust",
      "effects",
    ),
    ...availableAction(
      input,
      inspector(
        {
          id: "canvas.node.update.local.adjust",
          kind: "action",
          label: "Apply locally",
          icon: "effects",
        },
        "canvas-adjust",
        "Adjust",
        "effects",
      ),
      "canvas.node.update.local.adjust",
      current,
    ),
  ];
}

const ADJUST_RANGE_IDS = [
  "canvas.selection.adjust.brightness.set",
  "canvas.selection.adjust.contrast.set",
  "canvas.selection.adjust.saturation.set",
  "canvas.selection.adjust.exposure.set",
] as const;

const ADJUST_RANGE_FIELDS = {
  "canvas.selection.adjust.brightness.set": "brightness",
  "canvas.selection.adjust.contrast.set": "contrast",
  "canvas.selection.adjust.saturation.set": "saturation",
  "canvas.selection.adjust.exposure.set": "exposure",
} as const;

function contextNumber(
  context: SelectionContext,
  controlId: string,
  fallback: number,
) {
  const value = context.controls.find((control) => control.id === controlId)
    ?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function contextText(context: SelectionContext, controlId: string) {
  const value = context.controls.find((control) => control.id === controlId)
    ?.value;
  return typeof value === "string" ? value : "";
}

function adjustArgsFromContext(
  context: SelectionContext,
  command: SelectionCommand,
) {
  const args = {
    brightness: contextNumber(
      context,
      "canvas.selection.adjust.brightness.set",
      1,
    ),
    contrast: contextNumber(
      context,
      "canvas.selection.adjust.contrast.set",
      1,
    ),
    saturation: contextNumber(
      context,
      "canvas.selection.adjust.saturation.set",
      1,
    ),
    exposure: contextNumber(
      context,
      "canvas.selection.adjust.exposure.set",
      0,
    ),
  };
  const field =
    ADJUST_RANGE_FIELDS[
      command.controlId as keyof typeof ADJUST_RANGE_FIELDS
    ];
  const value = scalar(command.value);
  if (field && typeof value === "number") {
    args[field] = value;
  }
  return args;
}

export function canvasSelectionContext(
  input: CanvasSelectionAdapterInput,
): SelectionContext | null {
  const node = input.node;
  if (!node) return null;
  const controls = [
    ...fieldControls(input, node),
    inspector(
      {
        id: "canvas.selection.position-x.set",
        kind: "number",
        label: "X",
        value: node.position.x,
      },
      "canvas-position",
      "Position",
      "position",
    ),
    inspector(
      {
        id: "canvas.selection.position-y.set",
        kind: "number",
        label: "Y",
        value: node.position.y,
      },
      "canvas-position",
      "Position",
      "position",
    ),
    ...(node.kind === "image" && input.imageMode === "retouch"
      ? (
          [
            // ⚠ 这张表产出的 label 与 FabricImageContextToolbar / DeckContextToolbar 的
            // label 会**并排出现在同一条 SelectionToolbar 上**。那两处早就走了 tt()，
            // 这里没走，于是同一条工具条上「水平翻转」和 "Flip horizontal" 并排显示。
            // 词典里有 key 的一律接上；没有 key 的（Crop / Adjust / Contrast …）
            // 保持英文原样并留在预算锁里——硬填中文只会把 15 个非中文档一起弄坏。
            ["canvas.node.update.local.crop", "Crop", "crop", false],
            ["canvas.node.update.local.rotate", input.tt("旋转"), "rotate", false],
            [
              "canvas.node.update.local.brightness",
              "Brightness +10%",
              "effects",
              true,
            ],
            [
              "canvas.node.update.local.flip-horizontal",
              input.tt("水平翻转"),
              "flip-horizontal",
              true,
            ],
            [
              "canvas.node.update.local.flip-vertical",
              input.tt("垂直翻转"),
              "flip-vertical",
              true,
            ],
            [
              "canvas.node.update.local.contrast",
              "Contrast",
              "effects",
              true,
            ],
            [
              "canvas.node.update.local.saturation",
              "Saturation",
              "color",
              true,
            ],
            [
              "canvas.node.update.local.grayscale",
              "Grayscale",
              "filter",
              true,
            ],
            [
              "canvas.node.update.local.grid-split-4",
              "Split 4-grid",
              "crop",
              true,
            ],
            [
              "canvas.node.update.local.grid-split-9",
              "Split 9-grid",
              "crop",
              true,
            ],
            [
              "canvas.node.update.local.grid-split-25",
              "Split 25-grid",
              "crop",
              true,
            ],
          ] as const
        ).flatMap(([commandId, label, icon, more]) =>
          availableAction(
            input,
            {
              id: commandId,
              kind: "action",
              label,
              icon,
              ...(more ? { placement: "more" as const } : {}),
            },
            commandId,
          ),
        )
      : []),
    ...(node.kind === "image" && input.imageMode === "retouch"
      ? retouchAdjustControls(input, node)
      : []),
    ...(node.kind === "image" && input.imageMode === "generate"
      ? (
          [
            ["canvas.node.generate.image", input.tt("开始生成"), false],
            ["canvas.node.generate.relight", "Relight", false],
            ["canvas.node.generate.multi-angle", "Angles", false],
            ["canvas.node.generate.grid-4", "4-grid", false],
            ["canvas.node.generate.panorama", "Panorama", true],
            ["canvas.node.generate.grid-9", "9-grid", true],
            ["canvas.node.generate.grid-25", "25-grid", true],
            ["canvas.node.generate.upscale", "Upscale", true],
            ["canvas.node.generate.inpaint", "Inpaint", true],
            ["canvas.node.generate.outpaint", "Outpaint", true],
            [
              "canvas.node.generate.portrait-quality",
              "Portrait quality",
              true,
            ],
          ] as const
        ).flatMap(([commandId, label, more]) =>
          availableAction(
            input,
            {
              id: commandId,
              kind: "action",
              label,
              icon: "ai",
              ...(more ? { placement: "more" as const } : {}),
            },
            commandId,
            {
              prompt: node.prompt || "",
              ...(commandId === "canvas.node.generate.inpaint"
                ? { maskUrl: input.inpaintMaskUrl || "" }
                : {}),
            },
          ).map((control) =>
            commandId === "canvas.node.generate.inpaint" &&
            !String(input.inpaintMaskUrl || "").trim()
              ? {
                  ...control,
                  disabled: true,
                  unavailableReason:
                    control.unavailableReason ||
                    "Inpaint requires a durable mask Asset URL.",
                }
              : control,
          ),
        )
      : []),
    ...(node.kind === "image" && input.imageMode === "generate"
      ? [
          inspector(
            {
              id: "canvas.selection.mask-url.set",
              kind: "text",
              label: "Inpaint mask URL",
              value: input.inpaintMaskUrl || "",
            },
            "canvas-prompt",
            input.tt("提示词"),
            "note",
          ),
        ]
      : []),
    ...(node.kind === "video" ||
    node.kind === "script" ||
    node.kind === "text"
      ? availableAction(
          input,
          {
            id:
              node.kind === "video"
                ? "canvas.node.generate.video"
                : "canvas.node.generate.script",
            kind: "action",
            label: input.tt("开始生成"),
            icon: "animate",
          },
          node.kind === "video"
            ? "canvas.node.generate.video"
            : "canvas.node.generate.script",
          { prompt: node.prompt || node.text || "" },
        )
      : []),
    ...(node.kind === "audio" ? (["voice", "music"] as const).flatMap((mode) => availableAction(input, { id: `canvas.node.generate.${mode}`, kind: "action", label: input.tt(mode === "voice" ? "生成配音" : "生成音乐"), icon: "ai" }, `canvas.node.generate.${mode}`)) : []),
    ...(["text", "script", "image", "video", "audio"].includes(node.kind) ? availableAction(input, { id: "canvas.chain.run", kind: "action", label: input.tt("运行这条链"), icon: "animate", placement: "more" }, "canvas.chain.run") : []),
    ...(node.kind === "script" || node.kind === "text"
      ? availableAction(
          input,
          {
            id: "canvas.script.structure",
            kind: "action",
            label: "Structure shots",
            icon: "pages",
            placement: "more",
          },
          "canvas.script.structure",
        )
      : []),
    ...(node.kind === "composite" || node.kind === "delivery"
      ? [
          ...availableAction(
            input,
            {
              id: "canvas.session.view.set",
              kind: "action",
              label: "Open timeline",
              icon: "pages",
            },
            "canvas.session.view.set",
            { view: "timeline" },
          ),
          ...availableAction(
            input,
            {
              id: "canvas.timeline.build-approved",
              kind: "action",
              label: "Build approved takes",
              icon: "layers",
            },
            "canvas.timeline.build-approved",
          ),
        ]
      : []),
    {
      id: "canvas.node.delete",
      kind: "action",
      label: input.tt("删除"),
      icon: "delete",
      danger: true,
      placement: "more",
    },
  ] satisfies SelectionControl[];
  const visibleControls = node.legacySourceNode
    ? controls.filter((control) =>
        [
          "canvas.selection.title.set",
          "canvas.selection.position-x.set",
          "canvas.selection.position-y.set",
          "canvas.node.delete",
        ].includes(control.id),
      )
    : controls;
  return {
    version: 1,
    kind: `video-canvas-${node.kind}`,
    id: node.nodeId,
    label: node.title,
    revision: input.project.headVersionId,
    epoch: input.selectionEpoch,
    ...(input.anchor ? { anchor: input.anchor } : {}),
    controls: visibleControls,
  };
}

function scalar(value: SelectionControlValue | undefined) {
  return value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
    ? value
    : undefined;
}

export function canvasSelectionDispatch(
  command: SelectionCommand,
  context: SelectionContext | null,
): CanvasSelectionDispatch | null {
  const phase = command.phase;
  const transactionId = command.transactionId;
  if (
    !context ||
    typeof command.requestId !== "string" ||
    !command.requestId ||
    command.selectionId !== context.id ||
    command.selectionRevision !== context.revision ||
    command.selectionEpoch !== context.epoch ||
    !context.controls.some((control) => control.id === command.controlId) ||
    Boolean(phase) !== Boolean(transactionId) ||
    (phase !== undefined &&
      !["start", "update", "commit", "cancel"].includes(phase))
  ) {
    return null;
  }
  const value = scalar(command.value);
  const field = (
    {
      "canvas.selection.title.set": "title",
      "canvas.selection.text.set": "text",
      "canvas.selection.prompt.set": "prompt",
      "canvas.selection.model.set": "model",
      "canvas.selection.ratio.set": "ratio",
      "canvas.selection.duration.set": "durationSeconds",
      "canvas.selection.audio-mode.set": "audioMode",
    } as const
  )[command.controlId as
    | "canvas.selection.title.set"
    | "canvas.selection.text.set"
    | "canvas.selection.prompt.set"
    | "canvas.selection.model.set"
    | "canvas.selection.ratio.set"
    | "canvas.selection.duration.set"
    | "canvas.selection.audio-mode.set"];
  let commandId = command.controlId;
  let args: Record<string, unknown> = {};
  if (field) {
    commandId = "canvas.node.field.update";
    args = { field, value };
  } else if (
    command.controlId === "canvas.selection.position-x.set" ||
    command.controlId === "canvas.selection.position-y.set"
  ) {
    commandId = "canvas.node.position.update";
    args = {
      axis:
        command.controlId === "canvas.selection.position-x.set" ? "x" : "y",
      value,
    };
  } else if (command.controlId === "canvas.selection.image-mode.set") {
    commandId = "canvas.session.image-mode.set";
    args = { mode: value };
  } else if (command.controlId === "canvas.selection.mask-url.set") {
    commandId = "canvas.session.inpaint-mask.set";
    args = { maskUrl: value };
  } else if (
    command.controlId === "canvas.node.update.local.adjust" ||
    (ADJUST_RANGE_IDS as readonly string[]).includes(command.controlId)
  ) {
    commandId = "canvas.node.update.local.adjust";
    args = adjustArgsFromContext(context, command);
  } else if (command.controlId === "canvas.session.view.set") {
    commandId = "canvas.session.view.set";
    args = { view: "timeline" };
  } else if (command.controlId === "canvas.timeline.build-approved") {
    commandId = "canvas.timeline.build-approved";
    args = {};
  } else if (
    command.controlId.startsWith("canvas.node.generate.")
  ) {
    commandId = command.controlId;
    args = {
      prompt: contextText(context, "canvas.selection.prompt.set"),
      model: contextText(context, "canvas.selection.model.set"),
      ...(command.controlId === "canvas.node.generate.inpaint"
        ? { maskUrl: contextText(context, "canvas.selection.mask-url.set") }
        : {}),
    };
  } else if (
    ![
      "canvas.node.update.local.crop",
      "canvas.node.update.local.rotate",
      "canvas.node.update.local.flip-horizontal",
      "canvas.node.update.local.flip-vertical",
      "canvas.node.update.local.brightness",
      "canvas.node.update.local.contrast",
      "canvas.node.update.local.saturation",
      "canvas.node.update.local.grayscale",
      "canvas.node.update.local.grid-split-4",
      "canvas.node.update.local.grid-split-9",
      "canvas.node.update.local.grid-split-25",
      "canvas.node.generate.script",
      "canvas.script.structure",
      "canvas.chain.run",
      "canvas.node.delete",
    ].includes(command.controlId)
  ) {
    return null;
  }
  return {
    commandId,
    args,
    ...(phase ? { phase } : {}),
    ...(transactionId ? { transactionId } : {}),
    incoming: {
      requestId: command.requestId,
      projectVersionId: String(context.revision),
      selectionEpoch: Number(context.epoch),
    },
  };
}
