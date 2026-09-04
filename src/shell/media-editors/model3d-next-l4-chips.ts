/**
 * L4：3D 的 agent 快捷动作 chips 与「agent 改动进审阅」的提案。
 *
 * 八条照抄五层规范 §3「3D（three.js editor）」L4 列：
 * 换环境光 / 出图（四视角）/ 转 GLB / 生成材质 / 加地面阴影 / 自转预览
 * 再补两条占满上限：总结场景、提取材质清单。
 *
 * 校验器只用来自 `hosted-editor` 的那一份。
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  validReviewProposal,
  type EditorAgentChip,
  type EditorReviewObjectChange,
  type EditorReviewProposal,
} from "../hosted-editor/index";
import type { SelectionContext } from "../selection-context-types";

/** 与 `Model3DContextToolbar` / 新核浮条发出的 `SelectionContext.kind` 同源。 */
export const MODEL3D_SELECTION_KIND = "model-3d";

export const MODEL3D_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "threed.chip.environment",
    label: "换环境光",
    kind: "restyle",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "image",
    prompt:
      "请为当前 3D 场景换一套环境光：说明用什么 HDRI/颜色、曝光怎么配，以及为什么适合这个模型。场景：{document}",
  },
  {
    id: "threed.chip.four-views",
    label: "出图（四视角）",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "image",
    prompt:
      "请按前/后/左/俯四个视角各出一张图。先复述四个相机方位，等我确认后再执行。当前相机：{selection}",
  },
  {
    id: "threed.chip.export-glb",
    label: "转 GLB",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "download",
    prompt:
      "把当前场景导出为自包含 GLB。导出前后对照节点名、材质色、位移；会丢掉的属性要点名。场景：{document}",
  },
  {
    id: "threed.chip.generate-material",
    label: "生成材质",
    kind: "generate",
    appliesTo: [MODEL3D_SELECTION_KIND, CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "为选中对象生成一套 PBR 材质（基础色/金属度/粗糙度），只给改动清单，不要直接写进模型：{selection}",
  },
  {
    id: "threed.chip.ground-shadow",
    label: "加地面阴影",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "给当前模型加地面接触阴影：强度与软度怎么设、会不会裁掉脚底。场景：{document}",
  },
  {
    id: "threed.chip.auto-rotate",
    label: "自转预览",
    kind: "analyze",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "animate",
    prompt:
      "打开自转预览并说明合适的转速。这是查看动作，不要改模型本身。当前：{selection}",
  },
  {
    id: "threed.chip.summarize-scene",
    label: "总结场景",
    kind: "summarize",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "note",
    prompt:
      "用三到五句话总结这个 3D 场景：有哪些网格、材质、动画，以及普通模式能改什么。场景：{document}",
  },
  {
    id: "threed.chip.extract-materials",
    label: "提取材质",
    kind: "extract",
    appliesTo: [MODEL3D_SELECTION_KIND, CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "列出场景里每条材质的名称、基础色、金属度、粗糙度。认不出的项留空并写明为什么。选区：{selection}",
  },
];

export function model3dAgentChipsAreValid(): boolean {
  return validAgentChips(MODEL3D_AGENT_CHIPS as unknown as EditorAgentChip[]);
}

export function model3dToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return {
    manifestVersion: 2,
    chips: MODEL3D_AGENT_CHIPS.map((chip) => ({ ...chip })),
  };
}

export interface Model3DObjectChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

/**
 * agent 打算改的材质色/可见性等，包成待审阅提案。只造消息，不写模型。
 * 契约要求 `objects` 与 `diff` 恰好给一个——3D 给 objects。
 */
export function buildModel3DReviewProposal(input: {
  proposalId: string;
  commandId: string;
  changes: readonly Model3DObjectChange[];
  revision: number;
  targetSelection?: SelectionContext | null;
}): EditorReviewProposal | null {
  const changes = input.changes || [];
  if (changes.length === 0 || changes.length > 200) return null;
  const objects: EditorReviewObjectChange[] = changes.map((change) => ({
    id: change.id,
    op: "update",
    label: change.label,
    before: change.before,
    after: change.after,
  }));
  const proposal = {
    proposalId: input.proposalId,
    commandId: input.commandId,
    summary: {
      before: `${changes.length} 处保持原值`,
      after: `${changes.length} 处将被改写`,
    },
    objects,
    targetSelection: input.targetSelection ?? null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}
