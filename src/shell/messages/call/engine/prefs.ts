// 本机记忆：上次的麦克风/摄像头开关与三类设备（合同 §1 A1：默认麦克风开、摄像头关；记住上次的选择）。
// 只记用户自己点的开关（权限被拒等被动关掉的不记）。存 localStorage；取不到存储就只用默认值。

export interface CallPrefs {
  mic: boolean;
  camera: boolean;
  micDeviceId: string | null;
  cameraDeviceId: string | null;
  speakerDeviceId: string | null;
}

export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PREFS_KEY = "oceanleo.call.prefs.v1";
export const DEFAULT_PREFS: CallPrefs = { mic: true, camera: false, micDeviceId: null, cameraDeviceId: null, speakerDeviceId: null };

function deviceId(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value.length <= 512 ? value : null;
}

export function readPrefs(storage: PrefsStorage | null): CallPrefs {
  if (!storage) return { ...DEFAULT_PREFS };
  let raw: unknown = null;
  try {
    const text = storage.getItem(PREFS_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFS };
  const row = raw as Record<string, unknown>;
  return {
    mic: typeof row.mic === "boolean" ? row.mic : DEFAULT_PREFS.mic,
    camera: typeof row.camera === "boolean" ? row.camera : DEFAULT_PREFS.camera,
    micDeviceId: deviceId(row.micDeviceId),
    cameraDeviceId: deviceId(row.cameraDeviceId),
    speakerDeviceId: deviceId(row.speakerDeviceId),
  };
}

export function writePrefs(storage: PrefsStorage | null, patch: Partial<CallPrefs>): CallPrefs {
  const next = { ...readPrefs(storage), ...patch };
  if (storage) {
    try {
      storage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* 存储满或被禁用：本次会话照常 */
    }
  }
  return next;
}

/** 浏览器里的 localStorage（隐私模式/禁用时为 null）。 */
export function browserPrefsStorage(): PrefsStorage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
