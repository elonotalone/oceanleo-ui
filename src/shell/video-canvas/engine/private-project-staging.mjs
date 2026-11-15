async function sha256(file) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Private video project staging requires SHA-256 support.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const OWNER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function descriptorFromUpload(receipt, file, expectedDigest) {
  const value = receipt && typeof receipt === "object"
    ? receipt
    : {};
  const blobId = typeof value.blob_id === "string" ? value.blob_id : "";
  const path = blobId.split("/");
  const digest = typeof value.digest === "string" ? value.digest : "";
  const mediaType = typeof value.mime === "string" ? value.mime : "";
  const byteSize = value.bytes;
  if (
    value.url !== "" ||
    blobId.length > 2_048 ||
    path.length < 3 ||
    path[0] !== "project-assets:u" ||
    !OWNER_UUID_RE.test(path[1] || "") ||
    path.slice(2).some((part) => !part || part === "." || part === "..") ||
    /[?#%\\\0\s]/.test(blobId) ||
    !/^[a-f0-9]{64}$/i.test(digest) ||
    digest.toLowerCase() !== expectedDigest ||
    mediaType !== file.type ||
    !Number.isSafeInteger(byteSize) ||
    byteSize !== file.size
  ) {
    throw new Error("Private video project staging receipt does not match its file bytes.");
  }
  return {
    blobId,
    digest: digest.toLowerCase(),
    mediaType,
    byteSize,
  };
}

/** Upload both typed-commit files only to owner-private staging and verify each exact receipt. */
export async function stagePrivateProjectSnapshot(
  sourceFile,
  previewFile,
  identity,
  upload,
) {
  const uploadOne = async (file, purpose) => {
    const expectedDigest = await sha256(file);
    const response = await upload(file, {
      siteId: "video",
      title: `${identity.projectId}-${identity.versionId}-${purpose}`,
      registerAsset: false,
      privateUpload: true,
      idempotencyKey: `leovideo-private-snapshot:${identity.artifactId}:${identity.expectedRevisionId}:${identity.projectId}:${identity.versionId}:${purpose}:${expectedDigest}`,
    });
    const result = response && typeof response === "object" ? response : {};
    const uploadedFile = result.data && typeof result.data === "object"
      ? result.data.file
      : undefined;
    if (!result.ok || !uploadedFile) {
      throw new Error("Private video project staging failed; no Library revision was committed.");
    }
    return descriptorFromUpload(uploadedFile, file, expectedDigest);
  };

  const settled = await Promise.allSettled([
    uploadOne(sourceFile, "source"),
    uploadOne(previewFile, "preview"),
  ]);
  const failed = settled.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return {
    source: settled[0].value,
    preview: settled[1].value,
  };
}
