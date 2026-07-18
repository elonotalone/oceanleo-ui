export interface TimelineGestureHistory<T> {
  document: T;
  base: T | null;
  undo: T[];
  redo: T[];
  revision: number;
  dirty: boolean;
}

export function createTimelineGestureHistory<T>(
  document: T,
  options: Partial<
    Pick<TimelineGestureHistory<T>, "undo" | "redo" | "revision" | "dirty">
  > = {},
): TimelineGestureHistory<T> {
  return {
    document,
    base: null,
    undo: [...(options.undo || [])],
    redo: [...(options.redo || [])],
    revision: options.revision || 0,
    dirty: options.dirty || false,
  };
}

export function beginTimelineGesture<T>(
  state: TimelineGestureHistory<T>,
): TimelineGestureHistory<T> {
  return state.base
    ? state
    : {
        ...state,
        base: state.document,
      };
}

export function updateTimelineGesture<T>(
  state: TimelineGestureHistory<T>,
  updater: (current: T) => T,
): TimelineGestureHistory<T> {
  const document = updater(state.document);
  return document === state.document ? state : { ...state, document };
}

export function commitTimelineGesture<T>(
  state: TimelineGestureHistory<T>,
  historyLimit = 100,
): TimelineGestureHistory<T> {
  if (!state.base) return state;
  if (state.base === state.document) return { ...state, base: null };
  return {
    ...state,
    base: null,
    undo: [...state.undo, state.base].slice(-historyLimit),
    redo: [],
    revision: state.revision + 1,
    dirty: true,
  };
}

export function cancelTimelineGesture<T>(
  state: TimelineGestureHistory<T>,
): TimelineGestureHistory<T> {
  return state.base
    ? {
        ...state,
        document: state.base,
        base: null,
      }
    : state;
}
