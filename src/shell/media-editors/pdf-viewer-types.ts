/** Structural interfaces for EmbedPDF 2.15 plugin capabilities; no runtime imports. */
export type Off = () => void;
export type Hook<T> = (listener: (event: T) => void) => Off | void;
export interface TaskLike<T> {
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

export interface UiScope {
  setActiveToolbar(placement: string, slot: string, toolbarId: string): void;
  getActiveToolbar(placement: string, slot: string): string | null;
  closeToolbarSlot(placement: string, slot: string): void;
  isToolbarOpen(placement: string, slot: string, toolbarId?: string): boolean;
  closeSidebarSlot(placement: string, slot: string): void;
  closeModal?(): void;
  closeAllMenus?(): void;
}
export interface UiCap {
  forDocument(id: string): UiScope;
  setDisabledCategories(categories: string[]): void;
  getSchema?(): { toolbars?: Record<string, Record<string, unknown>> };
  mergeSchema?(partial: unknown): void;
}
export interface AnnotationScope {
  getState(): { selectedUids: string[]; activeToolId: string | null };
  getSelectedAnnotation(): { object: PdfAnnotationLike } | null;
  getAnnotations(options?: { pageIndex?: number }): { object: PdfAnnotationLike }[];
  exportAnnotations(): TaskLike<{ annotation: PdfAnnotationLike; ctx?: { data?: ArrayBuffer; mimeType?: string } }[]>;
  setActiveTool(toolId: string | null): void;
  createAnnotation(pageIndex: number, annotation: unknown, context?: unknown): void;
  updateAnnotation(pageIndex: number, id: string, patch: Record<string, unknown>): void;
  deleteAnnotation(pageIndex: number, id: string): void;
  selectAnnotation(pageIndex: number, id: string): void;
  deselectAnnotation(): void;
  setLocked?(mode: { type: string; categories?: string[] }): void;
  commit(): TaskLike<boolean>;
}
export interface AnnotationCap {
  forDocument(id: string): AnnotationScope;
  setToolDefaults(toolId: string, patch: Record<string, unknown>): void;
  getTool(toolId: string): { defaults: Record<string, unknown> } | undefined;
  onStateChange: Hook<{ documentId: string }>;
}
export interface DocsCap {
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
