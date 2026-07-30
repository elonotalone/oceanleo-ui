import type { InteractiveDocProject } from "./interactive-doc-schema";
import type { InteractiveDocParameterValue } from "./interactive-doc-controls";

const INTERACTIVE_DOC_HISTORY_LIMIT = 80;

/** One quiz block's self-test state (§3.2 `blocks[].quiz`). */
export interface InteractiveDocQuizProgress {
  submitted: InteractiveDocParameterValue | readonly InteractiveDocParameterValue[] | null;
  correct: boolean;
  attempts: number;
  explanationVisible: boolean;
}

/** One schedule block's SM-2 state (§4 C26–C30). */
export interface InteractiveDocScheduleProgress {
  step: number;
  lastQuality: number | null;
  easeFactor: number;
  repetition: number;
  intervalDays: number;
}

export interface InteractiveDocProgress {
  quiz: Record<string, InteractiveDocQuizProgress>;
  schedule: Record<string, InteractiveDocScheduleProgress>;
}

export function emptyInteractiveDocProgress(): InteractiveDocProgress {
  return { quiz: {}, schedule: {} };
}

/**
 * The undoable unit of an interactive document. Parameter values are part of it
 * because "改一个输入" is a document edit here: the recompute it triggers is the
 * product, so undo must restore the input and the derived presentation together.
 * Scenario slots (§4 C17) travel with the snapshot for the same reason.
 */
export interface InteractiveDocSnapshot {
  project: InteractiveDocProject;
  values: Record<string, InteractiveDocParameterValue>;
  progress: InteractiveDocProgress;
  scenarios: Array<Record<string, InteractiveDocParameterValue> | null>;
}

export function cloneInteractiveDocSnapshot(
  snapshot: InteractiveDocSnapshot,
): InteractiveDocSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as InteractiveDocSnapshot;
}

export function sameInteractiveDocSnapshot(
  left: InteractiveDocSnapshot,
  right: InteractiveDocSnapshot,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One document history shared by every interactive-doc surface. Recompute
 * results are never recorded: they are a pure function of `project` + `values`
 * (§5.4 determinism), so replaying a snapshot reproduces them bit-for-bit.
 */
export class InteractiveDocHistory {
  readonly limit: number;
  #past: InteractiveDocSnapshot[] = [];
  #future: InteractiveDocSnapshot[] = [];

  constructor(limit = INTERACTIVE_DOC_HISTORY_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  get depth(): number {
    return this.#past.length;
  }

  reset(): void {
    this.#past = [];
    this.#future = [];
  }

  record(
    before: InteractiveDocSnapshot,
    after: InteractiveDocSnapshot,
  ): boolean {
    if (sameInteractiveDocSnapshot(before, after)) return false;
    this.#past = [...this.#past, cloneInteractiveDocSnapshot(before)].slice(
      -this.limit,
    );
    this.#future = [];
    return true;
  }

  undo(current: InteractiveDocSnapshot): InteractiveDocSnapshot | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(cloneInteractiveDocSnapshot(current));
    return cloneInteractiveDocSnapshot(previous);
  }

  redo(current: InteractiveDocSnapshot): InteractiveDocSnapshot | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(cloneInteractiveDocSnapshot(current));
    return cloneInteractiveDocSnapshot(next);
  }
}
