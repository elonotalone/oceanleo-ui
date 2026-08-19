import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import type { LibraryItem } from "../library-data";
import type { PersistedEditorVersion } from "../doc-editors/doc-io";
import type { AudioAttributionEntry } from "./audio-project-carrier";
import type { AudioEditOperation } from "./audio-operations";

export interface AudioSelection {
  start: number;
  end: number;
}

export interface AudioProjectData {
  sourceUrl: string;
  operations: AudioEditOperation[];
  /**
   * audio-project.md §1.3 许可锁的编辑器侧承载。署名与许可义务必须随工程走，
   * 落库时由 `audioLicenseMetadata()` 展开进 revision meta —— 下游素材族靠
   * 这一段判断自己继承了哪些义务，缺了就是导出即断链。
   */
  attribution?: AudioAttributionEntry[];
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
  /** 0–100。WCAG 2.2 SC 1.4.2 要求音频必须有音量控制（§2.3）。 */
  volume: number;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  editRevision: number;
  playPause: () => void;
  stop: () => void;
  setPlaybackSpeed: (value: number) => void;
  setWaveformZoom: (value: number) => void;
  /** §2.3：播放 / 暂停 / 跳转 / 音量四个操作各有键盘通路，这是「跳转」那条。 */
  seekTo: (seconds: number) => void;
  setVolume: (value: number) => void;
  cropSelection: () => void;
  deleteSelection: () => void;
  /** 按明确起止秒数裁剪/删除；给 agent 用，不依赖波形上的鼠标选区。 */
  editRange: (
    mode: "crop" | "delete",
    start: number,
    end: number,
  ) => Promise<boolean>;
  /** 按百分比调音量（100 = 原样）；不给区间就是整段。 */
  applyGainRange: (
    percent: number,
    range?: AudioSelection | null,
  ) => Promise<boolean>;
  /** 当前编辑结果的 WAV 字节；mp3/m4a 交付以它为源。 */
  wavBlob: () => Blob | null;
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
