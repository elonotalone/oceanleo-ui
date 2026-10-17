/**
 * When a remote iframe editor should use its local core instead.
 *
 * Web default stays the live iframe (D9). Local cores turn on when:
 * the existing editor-core flag is `next`, the injected host is not `web`,
 * or the host capability `local-editor-cores` is present.
 *
 * `video-canvas` has no nextCore in the ledger, so it never flips via
 * `resolveEditorCore`; desktop/mobile hosts still get the local canvas.
 */

export const LOCAL_EDITOR_CORES_CAPABILITY = "local-editor-cores";

export const LOCAL_CORE_FLAG_EDITORS = Object.freeze([
  "website",
  "design-canvas",
  "deck",
  "richdoc",
]);

export function preferLocalRemoteEditor(
  editorId: string,
  options: {
    platform?: string;
    capabilities?: readonly string[];
    coreChoice?: "legacy" | "next";
  } = {},
): boolean {
  if (options.coreChoice === "next") return true;
  const capabilities = options.capabilities || [];
  if (capabilities.includes(LOCAL_EDITOR_CORES_CAPABILITY)) return true;
  const platform = options.platform;
  if (platform && platform !== "web") return true;
  return false;
}
