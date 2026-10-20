export function imageSaveAdmitted(input: {
  loading: boolean;
  sourceReady: boolean;
  sceneDiagnostic: unknown;
}): { ok: true } | { ok: false; error: string } {
  if (input.loading) {
    return {
      ok: false,
      error: "图片源尚未载入完成，未把空白画布当作可保存稿。",
    };
  }
  if (!input.sourceReady) {
    return {
      ok: false,
      error: "图片源未成功载入，拒绝把空白画布写回原件。",
    };
  }
  if (input.sceneDiagnostic) {
    const message =
      typeof input.sceneDiagnostic === "string"
        ? input.sceneDiagnostic
        : input.sceneDiagnostic &&
            typeof input.sceneDiagnostic === "object" &&
            "message" in input.sceneDiagnostic
          ? String(
              (input.sceneDiagnostic as { message?: unknown }).message || "",
            ).trim()
          : "";
    return {
      ok: false,
      error:
        message || "图片分层工程源未成功载入，未改用空白画布覆盖原件。",
    };
  }
  return { ok: true };
}
