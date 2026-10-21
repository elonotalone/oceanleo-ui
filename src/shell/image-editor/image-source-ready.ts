export interface ImageSourceSession {
  /** Identity of the currently open picture, independent of revision URLs. */
  key: string;
  nonce: number;
  artifactId?: string;
  rootAssetId?: string;
}

function trimmed(value: unknown): string {
  return String(value || "").trim();
}

/**
 * Identity for one selected image. Artifact IDs distinguish durable forks;
 * non-artifact inputs use their namespaced source ID so two legacy copies that
 * share a root are still separate opens. The root is used to correlate save
 * receipts, not to guess that two items are the same session.
 */
export function imageEditorOpenIdentity(item: {
  artifactId?: string;
  id?: string;
  key?: string;
  meta?: { root_asset_id?: unknown; parent_asset_id?: unknown } | Record<string, unknown>;
}): string {
  const artifactId = trimmed(item.artifactId);
  if (artifactId) return `artifact:${artifactId}`;
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  const root = trimmed(
    (meta as { root_asset_id?: unknown; parent_asset_id?: unknown }).root_asset_id ||
      (meta as { parent_asset_id?: unknown }).parent_asset_id,
  );
  const sourceId = trimmed(item.id || item.key);
  return sourceId ? `source:${sourceId}` : root ? `root:${root}` : "";
}

export function imageSourceStableIdentity(session: ImageSourceSession): string {
  const artifactId = trimmed(session.artifactId);
  if (artifactId) return `artifact:${artifactId}`;
  const key = trimmed(session.key);
  if (key) return key;
  const root = trimmed(session.rootAssetId);
  return root ? `root:${root}` : "";
}

/**
 * Revisions and signed URLs are receipts for the open picture, not a new open.
 * The source-to-first-fork transition with the same root also remains mounted;
 * a later selection of another artifact with that root is a genuine change.
 */
export function isNewImageSourceSession(
  previous: ImageSourceSession | null,
  next: ImageSourceSession,
): boolean {
  if (previous === null || previous.nonce !== next.nonce) return true;
  return imageSourceStableIdentity(previous) !== imageSourceStableIdentity(next);
}

export function firstForkReceiptMatches(input: {
  current: ImageSourceSession | null;
  nonce: number;
  rootAssetId: string;
  artifactId: string;
  receipt: { rootAssetId: string; artifactId: string } | null;
}): boolean {
  return Boolean(
    input.current &&
      !input.current.artifactId &&
      input.current.nonce === input.nonce &&
      input.current.rootAssetId &&
      input.current.rootAssetId === input.rootAssetId &&
      input.receipt?.rootAssetId === input.rootAssetId &&
      input.receipt.artifactId === input.artifactId,
  );
}

/** First source load / explicit reload only. */
export function imageStageShowsSourceLoadOverlay(input: {
  loading: boolean;
  sourceReady: boolean;
}): boolean {
  return Boolean(input.loading) && input.sourceReady !== true;
}

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
