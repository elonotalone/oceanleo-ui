"use client";

/**
 * 上传归一化（视觉影音家族）。
 *
 * 用户手上的文件是什么就该能拖进来：手机随手拍的 heic、老图 bmp/tiff、相机 raw、
 * 手机录的 mov、下载来的 flac。能转的先转成编辑器吃得下的格式，转不了的给一句
 * 人话，不许静默丢弃。
 *
 * 合同 §3.3：不在前端塞新的解析器，一律调既有后端端点。W1 的
 * `normalizeForEditor(file, editorId)` 落盘后，映射表以本文件的
 * `visualImportPlan()` 为准（见 verdicts/W3-delivery.md §5）。
 */

import {
  convertImageBlob,
  convertMediaBlob,
  visualMimeFor,
  withExtension,
} from "./visual-convert-client";
import {
  visualImportPlan,
  type VisualEditorId,
} from "./visual-formats";

export interface VisualImportOutcome {
  /** 能编的文件；打不开时是 null。 */
  file: File | null;
  /** 真的转过一道。 */
  converted: boolean;
  /** 原文件后缀。 */
  from: string;
  /** 转换后的后缀；没转就是空串。 */
  to: string;
  /** 打不开、或转换失败时的人话原因；成功时是空串。 */
  reason: string;
}

function accepted(file: File, extension: string): VisualImportOutcome {
  return { file, converted: false, from: extension, to: "", reason: "" };
}

/**
 * 把一个上传文件归一化成编辑器吃得下的样子。
 *
 * 永远不抛异常：调用方要的是「能不能编」和「不能编的话怎么跟用户说」。
 */
export async function normalizeVisualUpload(
  file: File,
  editorId: VisualEditorId,
): Promise<VisualImportOutcome> {
  const plan = visualImportPlan(editorId, file.name);
  if (plan.action === "accept") return accepted(file, plan.extension);
  if (plan.action === "reject") {
    return {
      file: null,
      converted: false,
      from: plan.extension,
      to: "",
      reason: plan.message || `打不开 .${plan.extension} 这种文件。`,
    };
  }
  const target = plan.target || "";
  try {
    const converted =
      plan.via === "convert-image"
        ? await convertImageBlob(file, file.name, target)
        : await convertMediaBlob(file, file.name, target);
    const name = withExtension(file.name, target);
    return {
      file: new File([converted], name, {
        type: converted.type || visualMimeFor(target),
      }),
      converted: true,
      from: plan.extension,
      to: target,
      reason: "",
    };
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message.trim() : "";
    return {
      file: null,
      converted: false,
      from: plan.extension,
      to: target,
      reason: detail
        ? `${plan.message || `.${plan.extension} 没能转成 .${target}。`}（${detail}）`
        : plan.message || `.${plan.extension} 没能转成 .${target}。`,
    };
  }
}

export interface VisualImportBatch {
  files: File[];
  /** 每条都是给用户看的一句话：转过的说转了什么，没收下的说为什么。 */
  notes: string[];
}

/** 一次拖进来好几个文件时，逐个归一化并汇总人话。 */
export async function normalizeVisualUploads(
  files: readonly File[],
  editorId: VisualEditorId,
): Promise<VisualImportBatch> {
  const accepted: File[] = [];
  const notes: string[] = [];
  for (const file of files) {
    const outcome = await normalizeVisualUpload(file, editorId);
    if (outcome.file) {
      accepted.push(outcome.file);
      if (outcome.converted) {
        notes.push(
          `${file.name} 已自动转成 .${outcome.to} 后打开。`,
        );
      }
      continue;
    }
    notes.push(`${file.name}：${outcome.reason}`);
  }
  return { files: accepted, notes };
}
