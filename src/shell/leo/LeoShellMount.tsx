"use client";

import { LeoAssistant } from "../LeoAssistant";
import { LeoMountKindContext } from "./leo-instance-guard";

export interface LeoShellMountProps {
  /** 站点 key（TSV key；历史别名也认，统一经 canonicalLeoSiteId 收口）。 */
  siteKey?: string;
  /** 不传时取该站 layout 原来给 leo 的 docType（leoDocTypeForSite）。 */
  docType?: string;
}

/**
 * 共享壳挂 leo 的入口。同一文档里只出一个面板：这里挂的实例优先，
 * 子站 layout 里直接写的 <LeoAssistant> 检测到它之后渲染 null。
 */
export function LeoShellMount({ siteKey, docType }: LeoShellMountProps) {
  return (
    <LeoMountKindContext.Provider value="shell">
      <LeoAssistant siteId={siteKey ?? ""} docType={docType} />
    </LeoMountKindContext.Provider>
  );
}
