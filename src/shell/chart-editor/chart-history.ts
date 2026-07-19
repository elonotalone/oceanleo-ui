import type { ChartDocumentV1 } from "./chart-schema";

const CHART_HISTORY_LIMIT = 80;

function cloneChartDocument(document: ChartDocumentV1): ChartDocumentV1 {
  return JSON.parse(JSON.stringify(document)) as ChartDocumentV1;
}

function sameChartDocument(
  left: ChartDocumentV1,
  right: ChartDocumentV1,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * One document history shared by every Chart surface. Selection changes never
 * enter the stack; each successful model mutation records exactly one snapshot.
 */
export class ChartDocumentHistory {
  readonly limit: number;
  #past: ChartDocumentV1[] = [];
  #future: ChartDocumentV1[] = [];

  constructor(limit = CHART_HISTORY_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit));
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  reset(): void {
    this.#past = [];
    this.#future = [];
  }

  record(before: ChartDocumentV1, after: ChartDocumentV1): boolean {
    if (sameChartDocument(before, after)) return false;
    this.#past = [...this.#past, cloneChartDocument(before)].slice(-this.limit);
    this.#future = [];
    return true;
  }

  undo(current: ChartDocumentV1): ChartDocumentV1 | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(cloneChartDocument(current));
    return cloneChartDocument(previous);
  }

  redo(current: ChartDocumentV1): ChartDocumentV1 | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(cloneChartDocument(current));
    return cloneChartDocument(next);
  }
}
