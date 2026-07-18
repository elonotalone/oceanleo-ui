export const MAX_AUDIO_PROJECT_OPERATIONS = 500;

export function validAudioOperationProject(value, isOperation) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (
    typeof value.sourceUrl !== "string" ||
    !Array.isArray(value.operations) ||
    value.operations.length > MAX_AUDIO_PROJECT_OPERATIONS
  ) {
    return false;
  }
  for (let index = 0; index < value.operations.length; index += 1) {
    if (!(index in value.operations) || !isOperation(value.operations[index])) {
      return false;
    }
  }
  return true;
}

/**
 * Builds the next audio state without mutating the caller's current state.
 * At the journal limit, the rendered source must first become a durable,
 * reloadable checkpoint; only then may the pending operation be applied.
 */
export async function prepareCheckpointedAudioMutation({
  source,
  sourceUrl,
  operations,
  operation,
  isOperation,
  createCheckpoint,
  applyOperation,
}) {
  if (!validAudioOperationProject({ sourceUrl, operations }, isOperation)) {
    return {
      ok: false,
      error:
        "音频操作日志已超过安全上限，本次编辑未应用；原状态仍保留，请先恢复有效工程",
    };
  }
  if (!isOperation(operation)) {
    return { ok: false, error: "音频操作参数无效，本次编辑未应用" };
  }

  let baseSource = source;
  let nextSourceUrl = sourceUrl;
  let baseOperations = [...operations];
  let checkpointed = false;
  if (operations.length === MAX_AUDIO_PROJECT_OPERATIONS) {
    try {
      const checkpoint = await createCheckpoint(source);
      const durableUrl = checkpoint?.sourceUrl?.trim();
      if (!durableUrl) throw new Error("上传未返回持久地址");
      baseSource = checkpoint.source;
      nextSourceUrl = durableUrl;
      baseOperations = [];
      checkpointed = true;
    } catch (caught) {
      const reason =
        caught instanceof Error && caught.message
          ? caught.message
          : "未知错误";
      return {
        ok: false,
        error:
          `音频操作已达 ${MAX_AUDIO_PROJECT_OPERATIONS} 次，无法创建安全 checkpoint：` +
          `${reason}。本次编辑未应用，原状态仍可保存`,
      };
    }
  }

  try {
    return {
      ok: true,
      source: applyOperation(baseSource, operation),
      baseSource,
      sourceUrl: nextSourceUrl,
      operations: [...baseOperations, operation],
      checkpointed,
    };
  } catch (caught) {
    return {
      ok: false,
      error:
        caught instanceof Error && caught.message
          ? `${caught.message}；本次编辑未应用`
          : "音频处理失败，本次编辑未应用",
    };
  }
}
