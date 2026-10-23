import type { VideoCanvasGraph } from "./video-canvas-schema";

const HISTORY_LIMIT = 100;

export function videoCanvasGraphsEqual(
  left: VideoCanvasGraph,
  right: VideoCanvasGraph,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function shouldPreserveDirtyWorkflowGraph(input: {
  dirty: boolean;
  loadedReloadNonce: number;
  reloadNonce: number;
  loadedRootId: string;
  sourceRootId: string;
  loadedRevisionId: string;
  sourceRevisionId: string;
  ownSaveRevisionId: string;
}): boolean {
  if (!input.dirty || input.loadedReloadNonce !== input.reloadNonce) return false;
  if (!input.loadedRootId || input.loadedRootId !== input.sourceRootId) return false;
  return input.loadedRevisionId === input.sourceRevisionId ||
    (Boolean(input.ownSaveRevisionId) &&
      input.ownSaveRevisionId === input.sourceRevisionId);
}

/**
 * Small immutable snapshot stack for the local workflow graph editor. Generic
 * so the v2 project editor (`VideoProjectStage`) reuses the same stack.
 */
export class VideoCanvasGraphHistory<T = VideoCanvasGraph> {
  private undoStack: T[] = [];
  private redoStack: T[] = [];
  private current: T | null = null;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  reset(graph: T): void {
    this.current = graph;
    this.undoStack = [];
    this.redoStack = [];
  }

  record(graph: T): void {
    if (this.current) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    }
    this.current = graph;
    this.redoStack = [];
  }

  undo(): T | null {
    const previous = this.undoStack.pop();
    if (!previous || !this.current) return null;
    this.redoStack.push(this.current);
    this.current = previous;
    return previous;
  }

  redo(): T | null {
    const next = this.redoStack.pop();
    if (!next || !this.current) return null;
    this.undoStack.push(this.current);
    this.current = next;
    return next;
  }
}
