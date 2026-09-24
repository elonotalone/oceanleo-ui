// 2026-09-24 editors-and-shell 波 W19 的分表。只由 W19 改；注册在 shell-overhaul-copy.ts（父改）。
// 写法：const SOURCE = { key: "简体中文原文" } as const;
//       export const EAS_W19_MESSAGES = assembleCopy(SOURCE, { en: {...}, ... 16 个语种 });
import { useCallback, useSyncExternalStore } from "react";
import { assembleCopy } from "./shell-overhaul-copy-shared";

export type W19SavedItem = {
  id?: string;
  artifactId?: string;
  revisionId?: string;
  versionId?: string;
  url?: string;
  previewUrl?: string;
  content?: unknown;
  meta?: Record<string, unknown>;
};

const SOURCE = {
  proSavedAsNewVersion:
    "专业编辑的改动会作为新版本保存，快速编辑显示最新版本预览",
} as const;

export const EAS_W19_MESSAGES = assembleCopy(SOURCE, {
  en: {
    proSavedAsNewVersion:
      "Changes you make in Pro are saved as a new version. Quick edit shows a preview of that latest version.",
  },
  de: {
    proSavedAsNewVersion:
      "Änderungen in der Profi-Ansicht werden als neue Version gespeichert. Die Schnellbearbeitung zeigt eine Vorschau der neuesten Version.",
  },
  es: {
    proSavedAsNewVersion:
      "Los cambios en edición profesional se guardan como una versión nueva. La edición rápida muestra una vista previa de la versión más reciente.",
  },
  "es-419": {
    proSavedAsNewVersion:
      "Los cambios en edición profesional se guardan como una versión nueva. La edición rápida muestra una vista previa de la versión más reciente.",
  },
  fr: {
    proSavedAsNewVersion:
      "Les modifications en mode Pro sont enregistrées comme une nouvelle version. L'édition rapide affiche un aperçu de la dernière version.",
  },
  it: {
    proSavedAsNewVersion:
      "Le modifiche in Pro vengono salvate come nuova versione. La modifica rapida mostra un'anteprima della versione più recente.",
  },
  "pt-BR": {
    proSavedAsNewVersion:
      "As alterações no modo profissional são salvas como uma nova versão. A edição rápida mostra uma prévia da versão mais recente.",
  },
  "pt-PT": {
    proSavedAsNewVersion:
      "As alterações no modo profissional são guardadas como uma nova versão. A edição rápida mostra uma pré-visualização da versão mais recente.",
  },
  vi: {
    proSavedAsNewVersion:
      "Thay đổi trong chế độ chuyên nghiệp được lưu thành phiên bản mới. Chỉnh sửa nhanh hiển thị bản xem trước phiên bản mới nhất.",
  },
  tr: {
    proSavedAsNewVersion:
      "Profesyonel düzenlemedeki değişiklikler yeni sürüm olarak kaydedilir. Hızlı düzenleme en son sürümün önizlemesini gösterir.",
  },
  "zh-TW": {
    proSavedAsNewVersion:
      "專業編輯的變更會存成新版本，快速編輯顯示最新版本預覽",
  },
  ja: {
    proSavedAsNewVersion:
      "プロ編集での変更は新しいバージョンとして保存されます。クイック編集には最新バージョンのプレビューが表示されます。",
  },
  ko: {
    proSavedAsNewVersion:
      "프로 편집에서 바꾼 내용은 새 버전으로 저장됩니다. 빠른 편집에는 최신 버전 미리보기가 보입니다.",
  },
  ar: {
    proSavedAsNewVersion:
      "تُحفظ التعديلات في التحرير الاحترافي كنسخة جديدة. يعرض التحرير السريع معاينة لأحدث نسخة.",
  },
  th: {
    proSavedAsNewVersion:
      "การเปลี่ยนแปลงในโหมดมืออาชีพจะบันทึกเป็นเวอร์ชันใหม่ การแก้ไขด่วนแสดงตัวอย่างเวอร์ชันล่าสุด",
  },
  hi: {
    proSavedAsNewVersion:
      "प्रो संपादन में किए बदलाव नई संस्करण के रूप में सहेजे जाते हैं। त्वरित संपादन नवीनतम संस्करण का पूर्वावलोकन दिखाता है।",
  },
});

export const W19_PRO_SAVED_AS_NEW_VERSION =
  SOURCE.proSavedAsNewVersion;

/**
 * W17 的 `editor-handoff.ts` 已落地：专业面走 `useEditorHandoffSource` /
 * `useModeSwitchHandoff`。这份 store 留下三件事——next 档不经过渡门、
 * 耐久素材不许回落到预览、五件用插件前缀 key 回流。门仍丢掉
 * `beforeEnterPro` 返回值时也能靠 stash 交稿。
 */
export type W19Handoff =
  | { kind: "inline"; json: unknown; revision: string | null }
  | { kind: "url"; url: string; format: string | null; revision: string | null }
  | { kind: "empty" };

type W19Store = {
  pending: Map<string, W19Handoff>;
  saved: Map<string, W19SavedItem>;
  listeners: Set<() => void>;
};

function w19Store(): W19Store {
  const bag = globalThis as typeof globalThis & { __oceanleoEasW19?: W19Store };
  if (!bag.__oceanleoEasW19) {
    bag.__oceanleoEasW19 = {
      pending: new Map(),
      saved: new Map(),
      listeners: new Set(),
    };
  }
  return bag.__oceanleoEasW19;
}

function notifyW19(): void {
  for (const listener of w19Store().listeners) listener();
}

export function resetW19HandoffStore(): void {
  const store = w19Store();
  store.pending.clear();
  store.saved.clear();
  notifyW19();
}

export function w19ItemKey(
  plugin: "audio" | "threed" | "video-timeline" | "chart-editor" | "pdf",
  item: { id?: string; artifactId?: string },
): string {
  return `${plugin}:${item.artifactId || item.id || ""}`;
}

export function w19RemountKey(item: {
  id?: string;
  revisionId?: string;
  versionId?: string;
}): string {
  return String(item.revisionId || item.versionId || item.id || "");
}

function formatFromUrl(url: string): string | null {
  const match = url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : null;
}

function revisionOf(item: {
  revisionId?: string;
  versionId?: string;
}): string | null {
  return item.revisionId || item.versionId || null;
}

export function resolveW19Handoff(
  item: {
    url?: string;
    previewUrl?: string;
    versionId?: string;
    revisionId?: string;
    artifactId?: string;
    meta?: Record<string, unknown>;
  },
  handoff?: W19Handoff | null,
  renditionUrl = "",
): W19Handoff {
  if (handoff && handoff.kind !== "empty") return handoff;
  const meta = item.meta ?? {};
  const working = String(meta.editor_working_head_url || "").trim();
  if (working) {
    return {
      kind: "url",
      url: working,
      format: formatFromUrl(working),
      revision: revisionOf(item),
    };
  }
  const project = String(meta.editor_project_url || "").trim();
  if (project) {
    return {
      kind: "url",
      url: project,
      format: formatFromUrl(project),
      revision: revisionOf(item),
    };
  }
  const rendition = renditionUrl.trim();
  if (rendition) {
    return {
      kind: "url",
      url: rendition,
      format: formatFromUrl(rendition),
      revision: revisionOf(item),
    };
  }
  const url = String(item.url || "").trim();
  if (url) {
    return {
      kind: "url",
      url,
      format: formatFromUrl(url),
      revision: revisionOf(item),
    };
  }
  const durable = Boolean(item.artifactId && item.revisionId);
  const preview = String(item.previewUrl || "").trim();
  if (!durable && preview) {
    return {
      kind: "url",
      url: preview,
      format: formatFromUrl(preview),
      revision: revisionOf(item),
    };
  }
  return { kind: "empty" };
}

/** 已经能从内存 / 现成 url 交稿时，不要把同一地址再交给 Office 源去 fetch。 */
export function w19OfficeProbeItem<
  T extends {
    url?: string;
    previewUrl?: string;
    artifactId?: string;
    revisionId?: string;
    meta?: Record<string, unknown>;
  },
>(item: T, handoff?: W19Handoff | null): T {
  if (resolveW19Handoff(item, handoff).kind === "empty") return item;
  return { ...item, url: undefined, previewUrl: undefined };
}

export function applyW19HandoffToItem<
  T extends {
    url?: string;
    content?: unknown;
    versionId?: string;
    meta?: Record<string, unknown>;
  },
>(item: T, source: W19Handoff): T {
  if (source.kind === "empty") return item;
  if (source.kind === "url") {
    return {
      ...item,
      url: source.url,
      versionId: source.revision || item.versionId,
    };
  }
  const json = source.json;
  if (
    json &&
    typeof json === "object" &&
    json !== null &&
    "pdfBytes" in json
  ) {
    return item;
  }
  const content =
    typeof json === "string" ? json : JSON.stringify(json ?? null);
  return {
    ...item,
    content,
    versionId: source.revision || item.versionId,
  };
}

export function stashW19EnterHandoff(
  itemKey: string,
  handoff: W19Handoff,
): void {
  w19Store().pending.set(itemKey, handoff);
}

export function peekW19EnterHandoff(itemKey: string): W19Handoff | null {
  return w19Store().pending.get(itemKey) ?? null;
}

export function reportW19ProSaved(
  itemKey: string,
  item: W19SavedItem,
): void {
  w19Store().saved.set(itemKey, item);
  notifyW19();
}

export function peekW19ProSaved<T extends W19SavedItem = W19SavedItem>(
  itemKey: string,
): T | null {
  return (w19Store().saved.get(itemKey) as T | undefined) ?? null;
}

export function subscribeW19ProSaved(listener: () => void): () => void {
  const listeners = w19Store().listeners;
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useW19ProSavedRevision<T extends W19SavedItem = W19SavedItem>(
  itemKey: string,
): T | null {
  const getSnapshot = useCallback(
    () => peekW19ProSaved<T>(itemKey),
    [itemKey],
  );
  return useSyncExternalStore(subscribeW19ProSaved, getSnapshot, () => null);
}

export function w19PdfBytesFromHandoff(
  handoff: W19Handoff | null,
): Uint8Array | null {
  if (!handoff || handoff.kind !== "inline") return null;
  const json = handoff.json;
  if (!json || typeof json !== "object" || json === null) return null;
  const bytes = (json as { pdfBytes?: unknown }).pdfBytes;
  return bytes instanceof Uint8Array ? bytes : null;
}
