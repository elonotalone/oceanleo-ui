/**
 * 嵌入编辑器 → 宿主 `commit` 消息里 meta 的校验器（从 `editor-protocol.ts` 拆出，
 * 600 行拆分闸）。判定规则一个字没动；`editor-protocol.ts` 只 import 两个入口。
 */
import {
  boundedString,
  recordValue,
  validAssetUrl,
} from "./editor-protocol-validation.mjs";

const DESIGN_SOURCE_FORMAT = "oceanleo.design-document.v1";
const EDITOR_MESSAGE_SEVERITIES = new Set(["fatal", "warning", "info"]);

export function validIssueMetadata(record: Record<string, unknown>): boolean {
  return (
    (record.code === undefined ||
      (boundedString(record.code, 100, true) &&
        /^[A-Z0-9][A-Z0-9_.:-]*$/i.test(String(record.code)))) &&
    (record.severity === undefined ||
      EDITOR_MESSAGE_SEVERITIES.has(String(record.severity))) &&
    (record.retryable === undefined || typeof record.retryable === "boolean")
  );
}

/**
 * 除 `composite_image` 外，还有哪些类型可以由嵌入式画布提交 typed revision。
 *
 * A12：这三类过去一次 revision 都提交不了，因为本校验器写死了 `composite_image`。
 * 放行它们**不等于放宽 source 约束**——`source_format` 属不属于该类型由
 * `design-composite-commit.ts` 的 `embeddedTypedCommitAccepts()` fail-closed 把关，
 * 那份清单与 `artifact-contract.ts` 的 `SOURCE_FORMAT_EXACT` 逐字镜像。
 */
const EMBEDDED_TYPED_COMMIT_ARTIFACT_TYPES = new Set([
  "vector_image",
  "workflow",
  "website",
]);

/** `composite_image`：scene 闭包是它的本体，逐项保持原样，一个字没放松。 */
function validCompositeCommitMeta(
  meta: Record<string, unknown>,
  revision: unknown,
): boolean {
  return Boolean(
    meta.artifact_type === "composite_image" &&
      meta.editor_project_schema === DESIGN_SOURCE_FORMAT &&
      meta.source_format === DESIGN_SOURCE_FORMAT &&
      boundedString(meta.editor_project_url, 2_000, true) &&
      meta.design_document_url === meta.editor_project_url &&
      validAssetUrl(meta.editor_project_url) &&
      Number.isSafeInteger(meta.design_document_revision) &&
      Number(meta.design_document_revision) >= 0 &&
      meta.preview_revision === meta.design_document_revision &&
      revision === meta.design_document_revision,
  );
}

/**
 * `vector_image` / `workflow` / `website`：没有 scene 闭包，因此不要求
 * `design_document_*` 那一组字段（W1 A9 第 2 条：这几类的闭包由后端从已验签的
 * `request.source` 推导，客户端不该发 `scene`）。仍然要求一份可校验的 source URL
 * 与非空 `source_format`——具体格式合不合法由提交层按类型判。
 */
function validEmbeddedTypedCommitMeta(
  meta: Record<string, unknown>,
): boolean {
  return Boolean(
    EMBEDDED_TYPED_COMMIT_ARTIFACT_TYPES.has(String(meta.artifact_type)) &&
      boundedString(meta.source_format, 120, true) &&
      boundedString(meta.editor_project_url, 2_000, true) &&
      validAssetUrl(meta.editor_project_url),
  );
}

export function validTypedCompositeCommitMeta(
  value: unknown,
  revision: unknown,
): boolean {
  const meta = recordValue(value);
  if (
    !meta ||
    meta.requires_typed_artifact_commit !== true ||
    !boundedString(meta.artifact_id, 300, true) ||
    !boundedString(meta.expected_artifact_revision_id, 300, true) ||
    (meta.artifact_revision_id !== undefined &&
      meta.artifact_revision_id !== meta.expected_artifact_revision_id) ||
    meta.preview_static_frame !== "final"
  ) {
    return false;
  }
  return (
    validCompositeCommitMeta(meta, revision) ||
    validEmbeddedTypedCommitMeta(meta)
  );
}
