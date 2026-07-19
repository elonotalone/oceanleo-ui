import type { Model3DOperation } from "./model3d-operations.mjs";
import type { Model3DAnnotation } from "./model3d-view";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";

export interface Model3DRouteSnapshot {
  checkpointUrl: string;
  operations: Model3DOperation[];
  view: {
    sourceUrl: string;
    azimuth: number;
    elevation: number;
    zoom: number;
    autoRotate: boolean;
    exposure: number;
    shadowIntensity: number;
    shadowSoftness: number;
    shadowEnabled: boolean;
    background: string;
    animationName: string;
    animationPlaying: boolean;
    animationSpeed: number;
    animationTime: number;
    environmentUrl: string;
    environmentIntensity: number;
    materialOverrides: [];
    annotations: Model3DAnnotation[];
  };
}

function cloneSnapshot(snapshot: Model3DRouteSnapshot): Model3DRouteSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as Model3DRouteSnapshot;
}

function sameSnapshot(
  left: Model3DRouteSnapshot,
  right: Model3DRouteSnapshot,
): boolean {
  const authored = (snapshot: Model3DRouteSnapshot) => ({
    ...snapshot,
    view: {
      ...snapshot.view,
      azimuth: 0,
      elevation: 0,
      zoom: 0,
      autoRotate: false,
    },
  });
  return JSON.stringify(authored(left)) === JSON.stringify(authored(right));
}

function preserveViewport(
  target: Model3DRouteSnapshot,
  current: Model3DRouteSnapshot,
): Model3DRouteSnapshot {
  const next = cloneSnapshot(target);
  next.view.azimuth = current.view.azimuth;
  next.view.elevation = current.view.elevation;
  next.view.zoom = current.view.zoom;
  next.view.autoRotate = current.view.autoRotate;
  return next;
}

export function captureModel3DRouteSnapshot(
  editor: Pick<
    Model3DWorkbenchState,
    | "sourceUrl"
    | "operationJournal"
    | "azimuth"
    | "elevation"
    | "zoom"
    | "autoRotate"
    | "exposure"
    | "shadowIntensity"
    | "shadowSoftness"
    | "shadowEnabled"
    | "background"
    | "animationName"
    | "animationPlaying"
    | "animationSpeed"
    | "animationTime"
    | "environmentUrl"
    | "environmentIntensity"
    | "annotations"
  >,
): Model3DRouteSnapshot {
  return cloneSnapshot({
    checkpointUrl: editor.sourceUrl,
    operations: editor.operationJournal,
    view: {
      sourceUrl: editor.sourceUrl,
      azimuth: editor.azimuth,
      elevation: editor.elevation,
      zoom: editor.zoom,
      autoRotate: editor.autoRotate,
      exposure: editor.exposure,
      shadowIntensity: editor.shadowIntensity,
      shadowSoftness: editor.shadowSoftness,
      shadowEnabled: editor.shadowEnabled,
      background: editor.background,
      animationName: editor.animationName,
      animationPlaying: editor.animationPlaying,
      animationSpeed: editor.animationSpeed,
      animationTime: editor.animationTime,
      environmentUrl: editor.environmentUrl,
      environmentIntensity: editor.environmentIntensity,
      materialOverrides: [],
      annotations: editor.annotations,
    },
  });
}

export class Model3DRouteHistory {
  #past: Model3DRouteSnapshot[] = [];
  #future: Model3DRouteSnapshot[] = [];
  #current: Model3DRouteSnapshot | null = null;
  #revision: string | number | null = null;

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  reset(revision: string | number, snapshot: Model3DRouteSnapshot): void {
    this.#past = [];
    this.#future = [];
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
  }

  observe(revision: string | number, snapshot: Model3DRouteSnapshot): boolean {
    if (!this.#current) {
      this.reset(revision, snapshot);
      return true;
    }
    if (revision === this.#revision) {
      this.#current = cloneSnapshot(snapshot);
      return false;
    }
    const changed = !sameSnapshot(this.#current, snapshot);
    if (changed) {
      this.#past = [...this.#past, cloneSnapshot(this.#current)].slice(-80);
      this.#future = [];
    }
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
    return changed;
  }

  accept(revision: string | number, snapshot: Model3DRouteSnapshot): void {
    this.#current = cloneSnapshot(snapshot);
    this.#revision = revision;
  }

  undo(current: Model3DRouteSnapshot): Model3DRouteSnapshot | null {
    const previous = this.#past.pop();
    if (!previous) return null;
    this.#future.push(cloneSnapshot(current));
    const target = preserveViewport(previous, current);
    this.#current = cloneSnapshot(target);
    return target;
  }

  redo(current: Model3DRouteSnapshot): Model3DRouteSnapshot | null {
    const next = this.#future.pop();
    if (!next) return null;
    this.#past.push(cloneSnapshot(current));
    const target = preserveViewport(next, current);
    this.#current = cloneSnapshot(target);
    return target;
  }

  rollbackUndo(): void {
    const original = this.#future.pop();
    if (!original || !this.#current) return;
    this.#past.push(cloneSnapshot(this.#current));
    this.#current = cloneSnapshot(original);
  }

  rollbackRedo(): void {
    const original = this.#past.pop();
    if (!original || !this.#current) return;
    this.#future.push(cloneSnapshot(this.#current));
    this.#current = cloneSnapshot(original);
  }
}
