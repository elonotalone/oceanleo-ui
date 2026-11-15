import type { SelectionCommand } from "../../selection-context";
import {
  projectHead,
  replaceProjectGraph,
  type ProjectVersion,
  type VideoProject,
} from "./project-model";

export const WORKFLOW_HISTORY_SELECTION_ID = "host:video-canvas";

type VersionContent = Omit<
  ProjectVersion,
  "versionId" | "parentVersionId" | "revision" | "createdAt" | "reason"
>;

function snapshot(project: VideoProject): VersionContent {
  const {
    versionId: _versionId,
    parentVersionId: _parentVersionId,
    revision: _revision,
    createdAt: _createdAt,
    reason: _reason,
    ...content
  } = projectHead(project);
  return JSON.parse(JSON.stringify(content)) as VersionContent;
}

function sameVersionContent(left: VersionContent, right: VersionContent): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function restoreGraph(
  project: VideoProject,
  content: VersionContent,
  reason: "canvas.history.undo" | "canvas.history.redo",
): VideoProject {
  const advanced = replaceProjectGraph(
    project,
    content.graph.nodes,
    content.graph.edges,
    reason,
    content.graph.viewport,
  );
  const advancedHead = projectHead(advanced);
  const restored: ProjectVersion = {
    ...content,
    versionId: advancedHead.versionId,
    parentVersionId: advancedHead.parentVersionId,
    revision: advancedHead.revision,
    createdAt: advancedHead.createdAt,
    reason,
  };
  return {
    ...advanced,
    versions: { ...advanced.versions, [advanced.headVersionId]: restored },
  };
}

/**
 * Immutable graph snapshots that leave durable Project versions monotonic:
 * undo/redo create a new version containing the prior graph instead of
 * rewinding the persisted head pointer.
 */
export class WorkflowGraphHistory {
  private undoStack: VersionContent[] = [];
  private redoStack: VersionContent[] = [];
  private current: VersionContent | null = null;

  private readonly limit: number;

  constructor(limit = 100, project?: VideoProject) {
    this.limit = limit;
    if (project) this.reset(project);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  reset(project: VideoProject): void {
    this.current = snapshot(project);
    this.undoStack = [];
    this.redoStack = [];
  }

  record(project: VideoProject): void {
    const next = snapshot(project);
    if (this.current && sameVersionContent(this.current, next)) return;
    if (this.current) {
      this.undoStack.push(this.current);
      if (this.undoStack.length > this.limit) this.undoStack.shift();
    }
    this.current = next;
    this.redoStack = [];
  }

  undo(project: VideoProject): VideoProject | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    const current = snapshot(project);
    this.redoStack.push(current);
    this.current = previous;
    return restoreGraph(project, previous, "canvas.history.undo");
  }

  redo(project: VideoProject): VideoProject | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    const current = snapshot(project);
    this.undoStack.push(current);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.current = next;
    return restoreGraph(project, next, "canvas.history.redo");
  }
}

/** Only the host's closed document-history command shape is accepted here. */
export function workflowHistoryActionForCommand(
  command: SelectionCommand,
  currentProjectVersionId: string,
  canUndo: boolean,
  canRedo: boolean,
): "undo" | "redo" | null {
  if (
    command.selectionId !== WORKFLOW_HISTORY_SELECTION_ID ||
    (command.controlId !== "undo" && command.controlId !== "redo") ||
    !command.requestId ||
    command.selectionRevision !== currentProjectVersionId ||
    command.selectionEpoch !== undefined ||
    command.value !== undefined ||
    command.history !== undefined ||
    command.phase !== undefined ||
    command.transactionId !== undefined
  ) {
    return null;
  }
  if (command.controlId === "undo") return canUndo ? "undo" : null;
  return canRedo ? "redo" : null;
}
