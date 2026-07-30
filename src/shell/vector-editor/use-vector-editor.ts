"use client";

/**
 * `vector-editor` workbench state.
 *
 * Spec: docs/specs/oceanleo-material-and-game-v1/L1-carriers/vector.md
 * — §3.3 state machine (`ready → dirty → saving → ready`), §5.1 the three
 * capabilities, §2.4 accessibility.
 *
 * The reducer is exported as a pure function so the state machine can be tested
 * without a renderer; the hook is a thin binding over it. Every mutation goes
 * through `vectorTransitionAllowed`, so the editor cannot walk an illegal edge
 * even under a mis-sequenced UI event.
 */

import { useCallback, useMemo, useReducer } from "react";

import {
  VectorCarrierError,
  serializeVectorProject,
  type VectorProject,
  type VectorShape,
} from "./vector-schema";
import {
  insertVectorAnchor,
  loadVectorSource,
  recolorVectorToken,
  removeVectorAnchor,
  replaceVectorShape,
  vectorCapabilityReport,
  vectorRenderDigest,
  vectorTransitionAllowed,
  type VectorCapabilityReport,
  type VectorLoadInput,
  type VectorState,
} from "./vector-source";

export interface VectorEditorState {
  state: VectorState;
  project: VectorProject | null;
  selectedShapeId: string | null;
  selectedAnchorIndex: number | null;
  capability: VectorCapabilityReport | null;
  renderDigest: string;
  editRevision: number;
  error: string;
  reason: string;
}

export type VectorEditorAction =
  | { type: "loaded"; result: ReturnType<typeof loadVectorSource> }
  | { type: "select-shape"; shapeId: string | null }
  | { type: "select-anchor"; anchorIndex: number | null }
  | { type: "insert-anchor"; point: { x: number; y: number } }
  | { type: "remove-anchor" }
  | { type: "recolor"; token: string; value: string }
  | { type: "replace-shape"; replacement: Omit<VectorShape, "id" | "z"> }
  | { type: "commit-begin" }
  | { type: "commit-settled"; revisionId: string }
  | { type: "commit-failed"; message: string };

export const INITIAL_VECTOR_EDITOR_STATE: VectorEditorState = {
  state: "empty",
  project: null,
  selectedShapeId: null,
  selectedAnchorIndex: null,
  capability: null,
  renderDigest: "",
  editRevision: 0,
  error: "",
  reason: "",
};

function edited(
  current: VectorEditorState,
  project: VectorProject,
): VectorEditorState {
  // §3.3: any anchor / palette / shape change moves `ready → dirty`. From
  // `flattened-only` there is no such edge, which is what stops a flattened
  // vector from being nudged into looking editable.
  const next =
    current.state === "dirty"
      ? "dirty"
      : vectorTransitionAllowed(current.state, "dirty")
        ? "dirty"
        : null;
  if (!next) {
    return {
      ...current,
      error: `${current.state} 状态下 MUST NOT 进入 dirty（§3.3 非法迁移）。`,
    };
  }
  return {
    ...current,
    state: next,
    project,
    capability: vectorCapabilityReport(project),
    renderDigest: vectorRenderDigest(project),
    editRevision: current.editRevision + 1,
    error: "",
  };
}

export function vectorEditorReducer(
  current: VectorEditorState,
  action: VectorEditorAction,
): VectorEditorState {
  switch (action.type) {
    case "loaded": {
      const project = action.result.project;
      return {
        ...INITIAL_VECTOR_EDITOR_STATE,
        state: action.result.state,
        project,
        capability: action.result.capability,
        renderDigest: project ? vectorRenderDigest(project) : "",
        reason: action.result.reason,
        error:
          action.result.state === "invalid" ||
          action.result.state === "flattened-only"
            ? action.result.reason
            : "",
      };
    }
    case "select-shape":
      return {
        ...current,
        selectedShapeId: action.shapeId,
        selectedAnchorIndex: null,
      };
    case "select-anchor":
      return { ...current, selectedAnchorIndex: action.anchorIndex };
    case "insert-anchor": {
      if (!current.project || !current.selectedShapeId) return current;
      try {
        const project = insertVectorAnchor(
          current.project,
          current.selectedShapeId,
          current.selectedAnchorIndex ?? 0,
          action.point,
        );
        return edited(current, project);
      } catch (caught) {
        return { ...current, error: describe(caught) };
      }
    }
    case "remove-anchor": {
      if (
        !current.project ||
        !current.selectedShapeId ||
        current.selectedAnchorIndex === null
      ) {
        return current;
      }
      try {
        const project = removeVectorAnchor(
          current.project,
          current.selectedShapeId,
          current.selectedAnchorIndex,
        );
        return {
          ...edited(current, project),
          selectedAnchorIndex: null,
        };
      } catch (caught) {
        return { ...current, error: describe(caught) };
      }
    }
    case "recolor": {
      if (!current.project) return current;
      try {
        const { project } = recolorVectorToken(
          current.project,
          action.token,
          action.value,
        );
        return edited(current, project);
      } catch (caught) {
        return { ...current, error: describe(caught) };
      }
    }
    case "replace-shape": {
      if (!current.project || !current.selectedShapeId) return current;
      try {
        const project = replaceVectorShape(
          current.project,
          current.selectedShapeId,
          action.replacement,
        );
        return edited(current, project);
      } catch (caught) {
        return { ...current, error: describe(caught) };
      }
    }
    case "commit-begin": {
      if (!vectorTransitionAllowed(current.state, "saving")) {
        return {
          ...current,
          error: `${current.state} 状态下 MUST NOT 进入 saving（§3.3 非法迁移）。`,
        };
      }
      return { ...current, state: "saving", error: "" };
    }
    case "commit-settled": {
      if (!vectorTransitionAllowed(current.state, "ready")) {
        return {
          ...current,
          error: `${current.state} 状态下 MUST NOT 直接回到 ready（§3.3 非法迁移）。`,
        };
      }
      return {
        ...current,
        state: "ready",
        reason: `已收到新 revision ${action.revisionId}。`,
        error: "",
      };
    }
    case "commit-failed":
      return { ...current, state: "dirty", error: action.message };
    default:
      return current;
  }
}

function describe(caught: unknown): string {
  if (caught instanceof VectorCarrierError) {
    return `${caught.code}: ${caught.message}`;
  }
  return caught instanceof Error ? caught.message : "矢量编辑失败。";
}

export interface VectorEditorHandle extends VectorEditorState {
  irBytes: number;
  load: (input: VectorLoadInput) => void;
  selectShape: (shapeId: string | null) => void;
  selectAnchor: (anchorIndex: number | null) => void;
  insertAnchor: (point: { x: number; y: number }) => void;
  removeAnchor: () => void;
  recolor: (token: string, value: string) => void;
  replaceShape: (replacement: Omit<VectorShape, "id" | "z">) => void;
  beginCommit: () => void;
  settleCommit: (revisionId: string) => void;
  failCommit: (message: string) => void;
}

export function useVectorEditor(): VectorEditorHandle {
  const [state, dispatch] = useReducer(
    vectorEditorReducer,
    INITIAL_VECTOR_EDITOR_STATE,
  );

  const load = useCallback((input: VectorLoadInput) => {
    dispatch({ type: "loaded", result: loadVectorSource(input) });
  }, []);

  const irBytes = useMemo(
    () =>
      state.project
        ? new TextEncoder().encode(serializeVectorProject(state.project))
            .byteLength
        : 0,
    [state.project],
  );

  return {
    ...state,
    irBytes,
    load,
    selectShape: useCallback(
      (shapeId: string | null) => dispatch({ type: "select-shape", shapeId }),
      [],
    ),
    selectAnchor: useCallback(
      (anchorIndex: number | null) =>
        dispatch({ type: "select-anchor", anchorIndex }),
      [],
    ),
    insertAnchor: useCallback(
      (point: { x: number; y: number }) =>
        dispatch({ type: "insert-anchor", point }),
      [],
    ),
    removeAnchor: useCallback(() => dispatch({ type: "remove-anchor" }), []),
    recolor: useCallback(
      (token: string, value: string) =>
        dispatch({ type: "recolor", token, value }),
      [],
    ),
    replaceShape: useCallback(
      (replacement: Omit<VectorShape, "id" | "z">) =>
        dispatch({ type: "replace-shape", replacement }),
      [],
    ),
    beginCommit: useCallback(() => dispatch({ type: "commit-begin" }), []),
    settleCommit: useCallback(
      (revisionId: string) => dispatch({ type: "commit-settled", revisionId }),
      [],
    ),
    failCommit: useCallback(
      (message: string) => dispatch({ type: "commit-failed", message }),
      [],
    ),
  };
}
