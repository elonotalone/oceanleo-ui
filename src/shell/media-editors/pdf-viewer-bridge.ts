/**
 * PDF 编辑器只有**一个** EmbedPDF 查看器实例（操作员裁定 D4）。这一层把它的插件
 * 注册表包成路由直接用的几件事：
 *   - 基础 / 专业两档外观：同一实例上开关官方工具栏、侧栏、浮动菜单，不重载文档；
 *   - 工具、缩放、页码、历史、批注、导出字节、换文档（页面整理）、图章、查找、缩略图。
 *
 * 只依赖结构化的最小接口，不 import `@embedpdf/*`：主包不被拖大，`node --test`
 * 用假 registry 就能钉住行为。注册表的形状实读自 `@embedpdf/plugin-*` 2.15.0 的 d.ts。
 */

export type PdfChromeMode = "basic" | "pro";

/** 标准批注子类型（`@embedpdf/models` 的 `PdfAnnotationSubtype`，测试钉住同值）。 */
export const PDF_SUBTYPE = {
  TEXT: 1,
  FREETEXT: 3,
  HIGHLIGHT: 9,
  UNDERLINE: 10,
  STRIKEOUT: 12,
  STAMP: 13,
  INK: 15,
} as const;

/**
 * 两档都关：文件级动作归 OceanLeo 顶栏（打开/关闭/打印/导出/加密/截图下载）；
 * 「视图旋转」不写进文件，留着会让人以为转好了；全屏归外壳的全屏键。
 */
export const PDF_VIEWER_ALWAYS_DISABLED: readonly string[] = [
  "document-menu",
  "document-open",
  "document-close",
  "document-print",
  "document-export",
  "document-protect",
  "document-capture",
  "document-fullscreen",
  "capture",
  "rotate",
];

/** 基础档额外藏起：官方选中菜单、选字菜单、侧栏开关（我们的编辑栏与缩略图栏顶替）。 */
export const PDF_VIEWER_BASIC_HIDDEN: readonly string[] = [
  "annotation",
  "selection",
  "redaction",
  "panel",
  "mode",
  "insert",
  "form",
];

/** 基础档关掉的快捷指令：Ctrl+F 不许打开官方查找侧栏（由我们的查找栏接管）。 */
export const PDF_VIEWER_BASIC_COMMANDS_OFF: readonly string[] = ["panel", "mode"];

type Off = () => void;
type Hook<T> = (listener: (event: T) => void) => Off | void;
interface TaskLike<T> {
  toPromise(): Promise<T>;
}

export interface PdfViewerRegistryLike {
  getPlugin(id: string): { provides?: () => unknown } | null;
}

export interface PdfRect {
  origin: { x: number; y: number };
  size: { width: number; height: number };
}

export interface PdfAnnotationLike {
  id: string;
  type: number;
  pageIndex: number;
  rect: PdfRect;
  [field: string]: unknown;
}

export interface PdfSearchHit {
  pageIndex: number;
  rects: PdfRect[];
}

interface UiScope {
  setActiveToolbar(placement: string, slot: string, toolbarId: string): void;
  getActiveToolbar(placement: string, slot: string): string | null;
  closeToolbarSlot(placement: string, slot: string): void;
  isToolbarOpen(placement: string, slot: string, toolbarId?: string): boolean;
  closeSidebarSlot(placement: string, slot: string): void;
  closeModal?(): void;
  closeAllMenus?(): void;
}
interface UiCap {
  forDocument(id: string): UiScope;
  setDisabledCategories(categories: string[]): void;
  getSchema?(): { toolbars?: Record<string, Record<string, unknown>> };
  mergeSchema?(partial: unknown): void;
}
interface AnnotationScope {
  getState(): { selectedUids: string[]; activeToolId: string | null };
  getSelectedAnnotation(): { object: PdfAnnotationLike } | null;
  getAnnotations(options?: { pageIndex?: number }): { object: PdfAnnotationLike }[];
  setActiveTool(toolId: string | null): void;
  createAnnotation(pageIndex: number, annotation: unknown, context?: unknown): void;
  updateAnnotation(pageIndex: number, id: string, patch: Record<string, unknown>): void;
  deleteAnnotation(pageIndex: number, id: string): void;
  selectAnnotation(pageIndex: number, id: string): void;
  deselectAnnotation(): void;
  setLocked?(mode: { type: string; categories?: string[] }): void;
  commit(): TaskLike<boolean>;
}
interface AnnotationCap {
  forDocument(id: string): AnnotationScope;
  setToolDefaults(toolId: string, patch: Record<string, unknown>): void;
  getTool(toolId: string): { defaults: Record<string, unknown> } | undefined;
  onStateChange: Hook<{ documentId: string }>;
}
interface DocsCap {
  getActiveDocumentId(): string | null;
  getActiveDocument(): {
    pages: { index: number; size: { width: number; height: number }; rotation: number }[];
  } | null;
  /** 2.15：外层 Task 给出 documentId，内层 task 才是文档真正载好。 */
  openDocumentBuffer(options: {
    buffer: ArrayBuffer;
    name: string;
    autoActivate?: boolean;
  }): TaskLike<{ documentId: string; task: TaskLike<unknown> }>;
  closeDocument(id: string): TaskLike<void>;
  setActiveDocument(id: string): void;
  onDocumentOpened: Hook<{ id: string }>;
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

export function createPdfViewerBridge(registry: PdfViewerRegistryLike, name: string) {
  const cap = <T,>(id: string): T | null =>
    (registry.getPlugin(id)?.provides?.() as T | undefined) ?? null;
  const ui = cap<UiCap>("ui");
  const commands = cap<{ setDisabledCategories(c: string[]): void }>("commands");
  const annotations = cap<AnnotationCap>("annotation");
  const docs = cap<DocsCap>("document-manager");
  const zoom = cap<{
    forDocument(id: string): {
      requestZoom(level: number | string): void;
      getState(): { currentZoomLevel: number };
    };
    onZoomChange: Hook<{ documentId: string; newZoom: number }>;
  }>("zoom");
  const scroll = cap<{
    forDocument(id: string): {
      getCurrentPage(): number;
      getTotalPages(): number;
      scrollToPage(options: Record<string, unknown>): void;
      getMetrics(): {
        pageVisibilityMetrics: {
          pageNumber: number;
          viewportX: number;
          viewportY: number;
          scaled: { pageX: number; pageY: number; visibleWidth: number; visibleHeight: number; scale: number };
        }[];
      };
    };
    onPageChange: Hook<{ documentId: string; pageNumber: number }>;
  }>("scroll");
  const history = cap<{
    forDocument(id: string): { canUndo(): boolean; canRedo(): boolean; undo(): void; redo(): void };
    onHistoryChange: Hook<{ documentId: string }>;
  }>("history");
  const exporter = cap<{ forDocument(id: string): { saveAsCopy(): TaskLike<ArrayBuffer> } }>("export");
  const search = cap<{
    forDocument(id: string): {
      startSearch(): void;
      stopSearch(): void;
      searchAllPages(keyword: string): TaskLike<{ results: PdfSearchHit[]; total: number }>;
      nextResult(): number;
      previousResult(): number;
      getState(): { results: PdfSearchHit[]; activeResultIndex: number; total: number };
    };
  }>("search");
  const thumbs = cap<{
    forDocument(id: string): { renderThumb(page: number, dpr: number): TaskLike<Blob> };
    onRefreshPages: Hook<{ documentId: string; pages: number[] }>;
  }>("thumbnail");
  const form = cap<{ onFieldValueChange?: Hook<{ documentId: string }> }>("form");
  const selection = cap<{
    forDocument(id: string): { clear(): void };
  }>("selection");

  let mode: PdfChromeMode = "basic";
  let proSecondary: string | null = null;
  let readOnly = false;
  const offs: Off[] = [];

  const doc = () => docs?.getActiveDocumentId() ?? null;

  /** 后续换进来的文档不再自动打开官方主工具栏（专业档时由我们打开）。 */
  try {
    const main = ui?.getSchema?.()?.toolbars?.["main-toolbar"];
    if (main && ui?.mergeSchema) {
      ui.mergeSchema({ toolbars: { "main-toolbar": { ...main, permanent: false } } });
    }
  } catch {
    /* 拿不到 schema 时换文档会闪一下官方工具栏，功能不受影响 */
  }

  function applyChrome(): void {
    const id = doc();
    if (!id || !ui) return;
    const scope = ui.forDocument(id);
    if (mode === "basic") {
      if (scope.isToolbarOpen("top", "secondary")) {
        proSecondary = scope.getActiveToolbar("top", "secondary");
      }
      scope.closeToolbarSlot("top", "main");
      scope.closeToolbarSlot("top", "secondary");
      scope.closeSidebarSlot("left", "main");
      scope.closeSidebarSlot("right", "main");
      scope.closeModal?.();
      scope.closeAllMenus?.();
      ui.setDisabledCategories([...PDF_VIEWER_ALWAYS_DISABLED, ...PDF_VIEWER_BASIC_HIDDEN]);
      commands?.setDisabledCategories([...PDF_VIEWER_ALWAYS_DISABLED, ...PDF_VIEWER_BASIC_COMMANDS_OFF]);
    } else {
      ui.setDisabledCategories([...PDF_VIEWER_ALWAYS_DISABLED]);
      commands?.setDisabledCategories([...PDF_VIEWER_ALWAYS_DISABLED]);
      scope.setActiveToolbar("top", "main", "main-toolbar");
      if (proSecondary) scope.setActiveToolbar("top", "secondary", proSecondary);
    }
    // 只读：所有批注都不能动；平时只锁表单控件（点它是填写，不是选中拖动）。
    annotations
      ?.forDocument(id)
      .setLocked?.(readOnly ? { type: "all" } : { type: "include", categories: ["form"] });
  }

  const goToPage = (pageNumber: number, pageCoordinates?: { x: number; y: number }) => {
    const id = doc();
    if (!id || !scroll) return;
    scroll.forDocument(id).scrollToPage({
      pageNumber,
      ...(pageCoordinates ? { pageCoordinates, alignY: 30 } : {}),
      behavior: "smooth",
    });
  };
  const revealHit = (hit: PdfSearchHit) => {
    const rect = hit.rects[0];
    goToPage(hit.pageIndex + 1, rect ? { x: rect.origin.x, y: rect.origin.y } : undefined);
  };
  const pages = () => docs?.getActiveDocument()?.pages ?? [];

  const annotationScope = () => {
    const id = doc();
    return id && annotations ? annotations.forDocument(id) : null;
  };

  return {
    ready: Boolean(docs && exporter && annotations && ui),
    documentId: doc,
    get mode() {
      return mode;
    },
    setChrome(next: PdfChromeMode) {
      mode = next;
      annotationScope()?.setActiveTool(null);
      applyChrome();
    },
    applyChrome,
    setReadOnly(value: boolean) {
      readOnly = value;
      if (value) annotationScope()?.setActiveTool(null);
      applyChrome();
    },

    // ---- 工具与批注 ----
    activeTool: () => annotationScope()?.getState().activeToolId ?? null,
    setTool(toolId: string | null) {
      if (readOnly && toolId) return;
      annotationScope()?.setActiveTool(toolId);
    },
    toolDefaults: (toolId: string) => annotations?.getTool(toolId)?.defaults ?? {},
    setToolDefaults(toolId: string, patch: Record<string, unknown>) {
      annotations?.setToolDefaults(toolId, patch);
    },
    selected: (): PdfAnnotationLike | null => {
      const scope = annotationScope();
      if (!scope || scope.getState().selectedUids.length !== 1) return null;
      return scope.getSelectedAnnotation()?.object ?? null;
    },
    annotationCount: () => annotationScope()?.getAnnotations().length ?? 0,
    /** 有没有内容里带拉丁 1 以外字符的 FreeText（PDFium 的外观流画不出，导出时要补）。 */
    hasWideFreeText: () =>
      (annotationScope()?.getAnnotations() ?? []).some(({ object }) => {
        if (object.type !== PDF_SUBTYPE.FREETEXT) return false;
        for (const char of String(object.contents ?? "")) if ((char.codePointAt(0) ?? 0) > 0xff) return true;
        return false;
      }),
    updateAnnotation(annotation: PdfAnnotationLike, patch: Record<string, unknown>) {
      annotationScope()?.updateAnnotation(annotation.pageIndex, annotation.id, patch);
    },
    deleteAnnotation(annotation: PdfAnnotationLike) {
      annotationScope()?.deleteAnnotation(annotation.pageIndex, annotation.id);
    },
    deselect: () => annotationScope()?.deselectAnnotation(),
    createAnnotation(pageIndex: number, annotation: Record<string, unknown>, context?: unknown) {
      const scope = annotationScope();
      if (!scope || readOnly) return false;
      scope.createAnnotation(pageIndex, annotation, context);
      scope.selectAnnotation(pageIndex, String(annotation.id));
      return true;
    },
    clearTextSelection: () => {
      const id = doc();
      if (id) selection?.forDocument(id).clear();
    },

    // ---- 页面、缩放、历史 ----
    pages,
    currentPage: () => {
      const id = doc();
      return id && scroll ? scroll.forDocument(id).getCurrentPage() : 1;
    },
    goToPage,
    zoomPercent: () => {
      const id = doc();
      return id && zoom ? Math.round(zoom.forDocument(id).getState().currentZoomLevel * 100) : 100;
    },
    setZoomPercent(percent: number) {
      const id = doc();
      if (id && zoom) zoom.forDocument(id).requestZoom(Math.max(0.25, Math.min(4, percent / 100)));
    },
    fitPage() {
      const id = doc();
      if (id && zoom) zoom.forDocument(id).requestZoom("fit-page");
    },
    canUndo: () => {
      const id = doc();
      return Boolean(id && history?.forDocument(id).canUndo());
    },
    canRedo: () => {
      const id = doc();
      return Boolean(id && history?.forDocument(id).canRedo());
    },
    undo() {
      const id = doc();
      if (id && !readOnly) history?.forDocument(id).undo();
    },
    redo() {
      const id = doc();
      if (id && !readOnly) history?.forDocument(id).redo();
    },

    // ---- 字节 ----
    /** 当前文档字节（批注先提交进引擎，再整份导出：标准 PDF 批注）。 */
    async exportBytes(): Promise<Uint8Array> {
      const id = doc();
      if (!id || !exporter) throw new Error("查看器里没有打开的文档。");
      await annotations?.forDocument(id).commit().toPromise().catch(() => false);
      const buffer = await exporter.forDocument(id).saveAsCopy().toPromise();
      return new Uint8Array(buffer);
    },
    /**
     * 同一查看器里换一份字节（页面整理 / 撤销页面整理 / 恢复草稿）：先在后台打开新文档，
     * 载好再切过去、关掉旧的——没有空白页、也没有「打开文件」空态。
     */
    async replaceDocument(bytes: Uint8Array, keepPage?: number) {
      if (!docs) throw new Error("查看器没有文档管理能力。");
      const previous = doc();
      const opened = await docs
        .openDocumentBuffer({ buffer: bytesBuffer(bytes), name, autoActivate: false })
        .toPromise();
      await opened.task.toPromise();
      docs.setActiveDocument(opened.documentId);
      applyChrome();
      if (previous && previous !== opened.documentId) {
        await docs.closeDocument(previous).toPromise().catch(() => undefined);
      }
      if (keepPage && scroll) {
        const scope = scroll.forDocument(opened.documentId);
        const total = scope.getTotalPages() || keepPage;
        scope.scrollToPage({ pageNumber: Math.min(keepPage, total), behavior: "instant" });
      }
    },

    // ---- 查找 ----
    async find(keyword: string): Promise<{ total: number; active: number }> {
      const id = doc();
      if (!id || !search) return { total: 0, active: -1 };
      const scope = search.forDocument(id);
      if (!keyword.trim()) {
        scope.stopSearch();
        return { total: 0, active: -1 };
      }
      scope.startSearch();
      const result = await scope.searchAllPages(keyword).toPromise();
      if (result.total > 0) revealHit(result.results[0]);
      return { total: result.total, active: result.total > 0 ? 0 : -1 };
    },
    stepFind(direction: 1 | -1): number {
      const id = doc();
      if (!id || !search) return -1;
      const scope = search.forDocument(id);
      const index = direction > 0 ? scope.nextResult() : scope.previousResult();
      const hit = scope.getState().results[index];
      if (hit) revealHit(hit);
      return index;
    },
    stopFind() {
      const id = doc();
      if (id) search?.forDocument(id).stopSearch();
    },
    async searchHits(keyword: string): Promise<PdfSearchHit[]> {
      const id = doc();
      if (!id || !search || !keyword.trim()) return [];
      const result = await search.forDocument(id).searchAllPages(keyword).toPromise();
      return result.results;
    },
    revealHit,

    // ---- 缩略图 ----
    renderThumb(pageIndex: number, dpr: number): Promise<Blob> {
      const id = doc();
      if (!id || !thumbs) return Promise.reject(new Error("没有缩略图能力。"));
      // 换文档（删页 / 撤销）的那一拍，旧页号可能已不在新文档里：引擎会同步抛，
      // 一律转成被拒的 promise，不许冒到 React 的 effect 里把编辑器打崩。
      if (pageIndex < 0 || pageIndex >= pages().length) {
        return Promise.reject(new Error("这一页已经不在文档里。"));
      }
      try {
        return thumbs.forDocument(id).renderThumb(pageIndex, dpr).toPromise();
      } catch (caught) {
        return Promise.reject(caught);
      }
    },

    /**
     * 屏幕坐标 → 页面坐标（素材拖放的落点）。`viewport` 是查看器的滚动容器；
     * 落在页外或页面有旋转时返回 null，调用方退回放在当前页中央。
     */
    pagePointAt(clientX: number, clientY: number, viewport: Element | null) {
      const id = doc();
      if (!id || !scroll || !viewport) return null;
      const box = viewport.getBoundingClientRect();
      const x = clientX - box.left;
      const y = clientY - box.top;
      for (const page of scroll.forDocument(id).getMetrics().pageVisibilityMetrics) {
        const { scaled } = page;
        if (
          x < page.viewportX || y < page.viewportY ||
          x > page.viewportX + scaled.visibleWidth || y > page.viewportY + scaled.visibleHeight
        ) continue;
        const info = pages()[page.pageNumber - 1];
        if (!info || info.rotation % 4 !== 0 || !scaled.scale) return null;
        return {
          pageIndex: page.pageNumber - 1,
          x: (x - page.viewportX + scaled.pageX) / scaled.scale,
          y: (y - page.viewportY + scaled.pageY) / scaled.scale,
        };
      }
      return null;
    },

    // ---- 事件 ----
    subscribe(listeners: {
      onEdit?: () => void;
      onAnnotations?: () => void;
      onZoom?: (percent: number) => void;
      onPage?: (pageNumber: number) => void;
      onDocument?: () => void;
      onThumbs?: (pages: number[]) => void;
    }) {
      const mine = (event: { documentId: string }) => event.documentId === doc();
      const own: Off[] = [];
      const hold = (off: Off | void) => {
        if (typeof off === "function") own.push(off);
      };
      hold(history?.onHistoryChange((event) => mine(event) && listeners.onEdit?.()));
      hold(form?.onFieldValueChange?.((event) => mine(event) && listeners.onEdit?.()));
      hold(annotations?.onStateChange((event) => mine(event) && listeners.onAnnotations?.()));
      hold(zoom?.onZoomChange((event) => mine(event) && listeners.onZoom?.(Math.round(event.newZoom * 100))));
      hold(scroll?.onPageChange((event) => mine(event) && listeners.onPage?.(event.pageNumber)));
      hold(thumbs?.onRefreshPages((event) => mine(event) && listeners.onThumbs?.(event.pages)));
      hold(
        docs?.onDocumentOpened(() => {
          applyChrome();
          listeners.onDocument?.();
        }),
      );
      own.forEach((off) => offs.push(off));
      return () => {
        own.splice(0).forEach((off) => {
          off();
          const at = offs.indexOf(off);
          if (at >= 0) offs.splice(at, 1);
        });
      };
    },
    dispose() {
      offs.splice(0).forEach((off) => off());
    },
  };
}

export type PdfViewerBridge = ReturnType<typeof createPdfViewerBridge>;
