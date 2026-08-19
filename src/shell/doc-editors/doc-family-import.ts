"use client";

/**
 * 文档家族四条路由共用的「上传一个文件」入口。
 *
 * 做的事只有三件：
 *   1. 按本家族的声明表决定要不要先转（表在 `doc-family-formats.ts`）；
 *   2. 转换交给共享助手 `normalizeForEditor()`（合同 §3.3，真转换在后端）；
 *   3. 打不开时给出**一句用户看得懂的原因**，绝不把空白编辑器留在那里。
 *
 * 这里没有解析器，也没有第二条转换通道。
 */

import {
  normalizeForEditor,
  type EditorImportResult,
} from "../import-normalize";
import {
  docFamilyAcceptsNatively,
  docFamilyImportPlan,
  docFamilyIsImage,
  docFamilyRefusalReason,
  type DocFamilyEditorId,
} from "./doc-family-formats";

export interface DocFamilyImportOutcome {
  /** 能不能交给编辑器打开。 */
  ok: boolean;
  /** 能开就是（可能已转换过的）文件，开不了时是原文件。 */
  file: File;
  /** 是不是真转过一次。 */
  converted: boolean;
  /** 这是一张插图，应该走「插入图片」而不是「顶掉整份文档」。 */
  image: boolean;
  /** 一句中文；顺利放行时是空串。 */
  message: string;
}

/**
 * 归一化一个上传/拖进来的文件。
 *
 * `richdoc`/`deck` 上的图片当插图放行（`image: true`），路由自己决定插到哪里。
 * 已知打不开的格式（iWork、epub 之类）用本家族更具体的那句话，
 * 而不是助手那句通用的「这里打不开 X 文件」。
 */
export async function importDocFamilyFile(
  file: File,
  editorId: DocFamilyEditorId,
): Promise<DocFamilyImportOutcome> {
  if (
    (editorId === "richdoc" || editorId === "deck") &&
    (docFamilyIsImage(file.name) || file.type.startsWith("image/"))
  ) {
    return { ok: true, file, converted: false, image: true, message: "" };
  }
  const refusal = docFamilyRefusalReason(editorId, file.name);
  if (refusal) {
    return { ok: false, file, converted: false, image: false, message: refusal };
  }
  if (docFamilyAcceptsNatively(editorId, file.name)) {
    return { ok: true, file, converted: false, image: false, message: "" };
  }
  let result: EditorImportResult;
  try {
    result = await normalizeForEditor(
      file,
      editorId,
      docFamilyImportPlan(editorId),
    );
  } catch (caught) {
    return {
      ok: false,
      file,
      converted: false,
      image: false,
      message:
        caught instanceof Error && caught.message
          ? caught.message
          : "这个文件没能转成编辑器认得的格式，已停下没有打开空白文档。",
    };
  }
  if (!result.ok) {
    return {
      ok: false,
      file: result.file || file,
      converted: false,
      image: false,
      message:
        result.message ||
        docFamilyRefusalReason(editorId, file.name) ||
        "这个文件没能打开，原因未知。",
    };
  }
  return {
    ok: true,
    file: result.file,
    converted: result.converted,
    image: false,
    message: "",
  };
}
