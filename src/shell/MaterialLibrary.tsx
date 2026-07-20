"use client";

/**
 * Compatibility facade. The controller/normalization layer and the rendered
 * view are split so existing `MaterialLibrary` imports remain stable.
 */
export { MaterialLibrary } from "./material-library-view";
export type { MaterialLibraryProps } from "./material-library-view";
export {
  platformToEntry,
} from "./material-library-controller";
export type {
  MaterialItem,
  PlatformAsset,
} from "./material-library-controller";
