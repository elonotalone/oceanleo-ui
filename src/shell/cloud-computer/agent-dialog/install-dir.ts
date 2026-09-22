// 安装目录原样交给网关。空值和输入框里的默认 `~/.local` 都发空串，由网关取默认。
// 用户改过的字不在这里展开 `~`。

import type { DirCapability } from "./types";

export const DEFAULT_INSTALL_DIR = "~/.local";

export function installDirPayload(dir: string, capability: DirCapability): string {
  if (capability === "none") return "";
  if (!dir.trim() || dir.trim() === DEFAULT_INSTALL_DIR) return "";
  return dir;
}
