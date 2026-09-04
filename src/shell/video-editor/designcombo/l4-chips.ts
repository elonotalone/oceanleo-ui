/**
 * L4 chips + review-proposal for video. Validator is the host's, not a copy.
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  validReviewProposal,
  type EditorAgentChip,
  type EditorReviewObjectChange,
  type EditorReviewProposal,
} from "../../hosted-editor/index";
import type { SelectionContext } from "../../selection-context-types";

export const VIDEO_SELECTION_KINDS = [
  "video-clip",
  "audio-clip",
  "image-clip",
  "caption-clip",
  "text-clip",
  "video-timeline",
] as const;

export const VIDEO_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "video.chip.umms",
    label: "删口头语与静音",
    kind: "cleanup",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt:
      "请标出这段视频里的口头语和过长静音，给出要剪掉的时间范围，不要直接改时间线：{selection}。",
  },
  {
    id: "video.chip.captions",
    label: "加字幕",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请为当前时间线生成字幕文案（每句 ≤200 字），按时间顺序列出：{document}。",
  },
  {
    id: "video.chip.cut-transcript",
    label: "按文字稿剪",
    kind: "cleanup",
    appliesTo: ["caption-clip", "text-clip", CHIP_ANY_SELECTION],
    prompt: "请按这段文字稿标出要从时间线上剪掉的句子及其时间：{selection}。",
  },
  {
    id: "video.chip.intro-outro",
    label: "加片头片尾",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请给这条片子建议片头和片尾（时长、文案、画面），先出方案：{document}。",
  },
  {
    id: "video.chip.bgm",
    label: "换 BGM",
    kind: "restyle",
    appliesTo: ["audio-clip", CHIP_ANY_SELECTION],
    prompt: "请为这条片子推荐一条可替换的 BGM，并说明该放在哪条音轨：{document}。",
  },
  {
    id: "video.chip.vertical",
    label: "竖版适配",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请把当前画布改成竖版 9:16 的裁切建议（哪些画面要裁、字幕要不要下移）：{document}。",
  },
  {
    id: "video.chip.cover",
    label: "生成封面",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请从时间线里挑一帧做封面，说明为什么这一帧能代表整条片子：{document}。",
  },
  {
    id: "video.chip.export-preset",
    label: "导出预设",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: "请根据用途（横屏社媒 / 竖屏短视频 / 方形）给出导出分辨率和码率建议：{document}。",
  },
];

export function videoAgentChipsAreValid(): boolean {
  return validAgentChips(VIDEO_AGENT_CHIPS);
}

export function videoToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return { manifestVersion: 2, chips: [...VIDEO_AGENT_CHIPS] };
}

export function buildVideoReviewProposal(input: {
  proposalId: string;
  commandId: string;
  summaryBefore: string;
  summaryAfter: string;
  objects: EditorReviewObjectChange[];
  revision: number;
  targetSelection?: SelectionContext | null;
}): EditorReviewProposal | null {
  if (!input.objects.length || input.objects.length > 200) return null;
  const proposal = {
    proposalId: input.proposalId,
    commandId: input.commandId,
    summary: { before: input.summaryBefore, after: input.summaryAfter },
    objects: input.objects,
    targetSelection: input.targetSelection ?? null,
    revision: input.revision,
  } as EditorReviewProposal;
  return validReviewProposal(proposal) ? proposal : null;
}

void VIDEO_SELECTION_KINDS;
