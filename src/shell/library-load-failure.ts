export type LibraryFailureStage = "mine" | "favorites" | "pagination" | "intent";
export type LibraryPageCollection = "mine" | "favorites" | "document" | "pdf";

export interface LibraryLoadFailure {
  stage: LibraryFailureStage;
  status?: number;
  diagnostic?: string;
  reason?: "owner-mismatch";
  collection?: LibraryPageCollection;
  page?: number;
  retry?: "refresh" | "page" | "intent";
}

export class LibraryPaginationReadError extends Error {
  readonly collection: LibraryPageCollection;
  readonly page: number;
  readonly status?: number;

  constructor(
    message: string,
    collection: LibraryPageCollection,
    page: number,
    status?: number,
  ) {
    super(message);
    this.collection = collection;
    this.page = page;
    this.status = status;
  }
}

export function libraryLoadFailureCopy(
  failure: LibraryLoadFailure,
  hasSnapshot = false,
): { title: string; description: string; retryLabel: string } {
  if (failure.stage === "intent") {
    return {
      title: failure.status === 404
        ? "这份条目已不存在或无法访问"
        : "暂时无法打开这份条目",
      description: "可以重试打开；我的库列表仍可继续使用。",
      retryLabel: "重试打开条目",
    };
  }
  if (failure.stage === "pagination") {
    const collection = { mine: "作品", favorites: "收藏", document: "文档", pdf: "PDF" }[failure.collection || "mine"];
    return {
      title: failure.page
        ? `未能加载${collection}第 ${failure.page} 页`
        : `未能完整读取${collection}列表`,
      description: failure.reason === "owner-mismatch"
        ? "分页归属与当前账号不一致，已拒绝合并。请稍后重试。"
        : failure.status === 403
          ? "当前账号暂时无法读取这页内容，请确认登录账号后重试。"
          : "已保留成功加载的内容。请稍后重试。",
      retryLabel: failure.retry === "refresh" ? "重新读取列表" : "重试本页",
    };
  }
  if (failure.stage === "favorites" && failure.reason === "owner-mismatch") {
    return {
      title: "收藏归属与当前账号不一致",
      description: "已拒绝合并不同账号的列表。请稍后重试。",
      retryLabel: "重新读取列表",
    };
  }
  if (failure.stage === "favorites") {
    return {
      title: failure.status === 503 ? "收藏素材服务暂时不可用" : "收藏暂时未刷新",
      description: "作品列表仍可使用；已验证的收藏会保留。",
      retryLabel: "重试刷新收藏",
    };
  }
  if (failure.status === 401 && !hasSnapshot) {
    return {
      title: "登录后查看我的库",
      description: "登录任意 OceanLeo 站点后，跨站作品会在这里汇总。",
      retryLabel: "重试刷新作品",
    };
  }
  if (failure.status === 403) {
    return {
      title: "当前账号无权访问我的库",
      description: "当前账号暂时无法读取我的库，请确认登录的是保存作品的账号。",
      retryLabel: "重试刷新作品",
    };
  }
  return {
    title: hasSnapshot ? "作品列表暂未刷新" : "暂时无法加载我的库",
    description: hasSnapshot
      ? "显示上次成功加载的作品；列表暂未刷新。"
      : failure.status === 503
        ? "作品服务暂时不可用，可能正在维护或过载。请稍后重试。已保存作品链接仍可单独打开。"
        : "请稍后重试。已保存作品链接仍可单独打开。",
    retryLabel: "重试刷新作品",
  };
}
