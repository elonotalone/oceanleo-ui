/**
 * L4：音频的 agent 快捷动作 chips 与「agent 改动进审阅」的提案。
 *
 * 八条照抄五层规范 §3「音频（waveform-playlist）」L4 列：
 * 转写、按文字删段、降噪、匀响度（−14 LUFS）、去口头语、加 BGM、分章节、导出预设。
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

export const AUDIO_SELECTION_KIND_TRACK = "audio-track";
export const AUDIO_SELECTION_KIND_REGION = "audio-region";
export const AUDIO_SELECTION_KIND_SENTENCE = "audio-sentence";

export const AUDIO_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "audio.chip.transcribe",
    label: "转写",
    kind: "extract",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "note",
    prompt:
      "请用百炼 Paraformer/SenseVoice 转写当前音频，按句子列出文字和时间。工程：{document}",
  },
  {
    id: "audio.chip.cut-by-text",
    label: "按文字删段",
    kind: "cleanup",
    appliesTo: [AUDIO_SELECTION_KIND_SENTENCE, CHIP_ANY_SELECTION],
    icon: "delete",
    prompt:
      "根据转写稿删掉指定句子对应的音频段。只给将要剪掉的起止秒数，不要直接改工程：{selection}",
  },
  {
    id: "audio.chip.denoise",
    label: "降噪",
    kind: "cleanup",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "effects",
    prompt:
      "给当前音频做降噪：说明会动哪几轨、预期损失什么高频。工程：{document}",
  },
  {
    id: "audio.chip.loudness",
    label: "匀响度（−14 LUFS）",
    kind: "restyle",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "effects",
    prompt:
      "把混音对齐到 −14 LUFS（容差 1 LU）。先报当前响度再给增益。工程：{document}",
  },
  {
    id: "audio.chip.de-um",
    label: "去口头语",
    kind: "cleanup",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "delete",
    prompt:
      "根据转写稿标出「嗯/啊/那个」等口头语的时间段，列出将要剪掉的句子，等确认。稿：{selection}",
  },
  {
    id: "audio.chip.add-bgm",
    label: "加 BGM",
    kind: "generate",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "timeline",
    prompt:
      "给当前工程加一条背景音乐轨：风格、响度、淡入淡出怎么配。不要直接写进工程：{document}",
  },
  {
    id: "audio.chip.chapters",
    label: "分章节",
    kind: "layout",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "layers",
    prompt:
      "按转写稿给音频分章节，列出每章起止秒与标题。稿：{document}",
  },
  {
    id: "audio.chip.export-preset",
    label: "导出预设",
    kind: "export",
    appliesTo: [CHIP_ANY_SELECTION],
    icon: "download",
    prompt:
      "按用途给出导出预设（播客 mp3 / 成片 wav / 短视频 m4a），不要直接导出。工程：{document}",
  },
];

export function audioAgentChipsAreValid(): boolean {
  return validAgentChips(AUDIO_AGENT_CHIPS as unknown as EditorAgentChip[]);
}

export function audioToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return {
    manifestVersion: 2,
    chips: AUDIO_AGENT_CHIPS.map((chip) => ({ ...chip })),
  };
}

export interface AudioObjectChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

/**
 * agent 打算剪的句子/轨，包成待审阅提案。只造消息，不写音频。
 * 契约要求 `objects` 与 `diff` 恰好给一个——音频给 objects。
 */
export function buildAudioReviewProposal(input: {
  proposalId: string;
  commandId: string;
  changes: readonly AudioObjectChange[];
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
