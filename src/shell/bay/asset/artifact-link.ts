// 成品链接的地址参数：`/bay?kind=asset&artifactId=<成品号>&revisionId=<版本号>`。
// 纯函数，单独一个文件，素材栏的打开件与测试都读它。

export interface BayArtifactLinkTarget {
  artifactId: string;
  revisionId: string;
}

/** 从地址参数里读成品号与版本号；没有成品号就不是成品链接。 */
export function artifactLinkTargetFromSearch(search: string): BayArtifactLinkTarget | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  } catch {
    return null;
  }
  const artifactId = (params.get("artifactId") || "").trim();
  if (!artifactId) return null;
  return { artifactId, revisionId: (params.get("revisionId") || "").trim() };
}

/** 拿掉成品链接的参数（`taxonomy` 是随成品链接一起带来的，一并拿掉），其余参数原样留下。 */
export function searchWithoutArtifactLink(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  params.delete("artifactId");
  params.delete("revisionId");
  params.delete("taxonomy");
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}
