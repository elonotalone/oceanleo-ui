import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import type { LibraryItem } from "../library-data";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import type { AudioEditOperation } from "./audio-operations";

export interface AudioSelection {
  start: number;
  end: number;
}

export interface AudioProjectData {
  sourceUrl: string;
  operations: AudioEditOperation[];
}

export interface AudioWorkbenchState {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  loading: boolean;
  saving: boolean;
  playing: boolean;
  error: string;
  savedUrl: string;
  duration: number;
  currentTime: number;
  selection: AudioSelection | null;
  fadeDuration: number;
  setFadeDuration: Dispatch<SetStateAction<number>>;
  gain: number;
  setGain: Dispatch<SetStateAction<number>>;
  effectSpeed: number;
  setEffectSpeed: Dispatch<SetStateAction<number>>;
  lowEq: number;
  setLowEq: Dispatch<SetStateAction<number>>;
  midEq: number;
  setMidEq: Dispatch<SetStateAction<number>>;
  highEq: number;
  setHighEq: Dispatch<SetStateAction<number>>;
  speed: number;
  zoom: number;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  editRevision: number;
  playPause: () => void;
  stop: () => void;
  setPlaybackSpeed: (value: number) => void;
  setWaveformZoom: (value: number) => void;
  cropSelection: () => void;
  deleteSelection: () => void;
  applyFade: (edge: "in" | "out") => void;
  applyGain: () => void;
  applyEffectChain: () => void;
  undo: () => void;
  redo: () => void;
  importSource: (file: File) => Promise<void>;
  download: () => void;
  save: () => Promise<PersistedEditorVersion | null>;
  captureRecovery: () => AudioProjectData | null;
  restoreRecovery: (payload: unknown) => Promise<boolean>;
}

export interface AudioWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  onSaved?: (url: string) => void;
}
