/**
 * 私有工作运行时判定。按完整 path segment 判断，兼容 `/zh/workspace/...` 等语言前缀，
 * 同时避免把 `/workspace-public` 之类普通页面误判成私有。
 */
export function isPrivateWorkspaceRuntime(
  pathname: string,
  embedded = false,
): boolean {
  if (embedded) return true;
  const segments = (pathname || "").split("/").filter(Boolean);
  return segments.includes("workspace") || segments.includes("history");
}
