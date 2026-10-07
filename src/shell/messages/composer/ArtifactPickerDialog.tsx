"use client";

// 「+」→ 分享作品：搜我的作品 → 选一个 → 可勾「让这个会话的人一起改」→ 发出作品卡（card.type="artifact"）。
// 勾了「一起改」就先走 W11 `grantCoeditToConversation` 把整个会话授为 editor，再发卡。
import { useEffect, useMemo, useState } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import type { ImCard, ImEditorKind } from "../../../lib/im/types";
import { listMyArtifacts } from "../../artifact-client";
import { advancedFeatureHrefForItem } from "../../advanced-features";
import { collabEditorKindForAdapter } from "../../collab/collab-editor-kinds";
import { grantCoeditToConversation } from "../../collab/grants-api";
import type { LibraryItem } from "../../library-data";
import { editorCapabilityFor } from "../../workbench-routes";
import { safeMediaUrl } from "../conversation/AttachmentView";
import { ImCloseIcon } from "../messages-surface";

/** 作品 → 契约里的编辑器族；这个作品不在 12 族里（如网站）就是 null，不能一起改。 */
export function editorKindOfItem(item: LibraryItem): ImEditorKind | null {
  try {
    const capability = editorCapabilityFor(item);
    if (!capability.available) return null;
    return collabEditorKindForAdapter(capability.adapter, item.artifact?.artifactType ?? null);
  } catch {
    return null;
  }
}

/** 选中的作品 → 要发的卡。`open_path` 存绝对地址，别的站点的人点「打开」才跳得对。 */
export function cardForItem(item: LibraryItem, origin: string, coedit: boolean): ImCard {
  const artifactId = item.artifact?.artifactId ?? item.id;
  const path = advancedFeatureHrefForItem(item);
  const editorKind = editorKindOfItem(item);
  return {
    type: "artifact",
    id: artifactId,
    title: item.title,
    thumb_url: safeMediaUrl(item.posterUrl ?? item.thumbUrl ?? null),
    editor_kind: editorKind,
    open_path: path ? new URL(path, origin).toString() : null,
    coedit: coedit && editorKind ? { room_key: `artifact:${artifactId}`, role: "editor" } : null,
  };
}

export function ArtifactPickerDialog({
  open,
  conversationId,
  onClose,
  onPick,
}: {
  open: boolean;
  conversationId: string;
  onClose: () => void;
  onPick: (card: ImCard) => void;
}) {
  const tt = useUI();
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [coedit, setCoedit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [grantFailed, setGrantFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setItems(null);
    setError(false);
    setSelected(null);
    setCoedit(false);
    setGrantFailed(false);
    void listMyArtifacts({ limit: 100, signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok && result.data) setItems(result.data.items);
      else setError(true);
    });
    return () => controller.abort();
  }, [open]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return [];
    return q ? items.filter((item) => item.title.toLowerCase().includes(q)) : items;
  }, [items, query]);

  if (!open) return null;
  const selectedKind = selected ? editorKindOfItem(selected) : null;

  const send = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setGrantFailed(false);
    const origin = window.location.origin;
    let wantCoedit = coedit && Boolean(selectedKind);
    if (wantCoedit) {
      try {
        await grantCoeditToConversation(`artifact:${selected.artifact?.artifactId ?? selected.id}`, conversationId, "editor");
      } catch {
        setGrantFailed(true);
        setBusy(false);
        return;
      }
    }
    if (!selectedKind) wantCoedit = false;
    onPick(cardForItem(selected, origin, wantCoedit));
    setBusy(false);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("分享作品")}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-neutral-900">{tt("分享作品")}</h2>
          <button type="button" onClick={onClose} data-im-chrome-btn aria-label={tt("关闭")}>
            <ImCloseIcon />
          </button>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tt("搜索我的作品")}
        className="mb-2 rounded-lg bg-neutral-100/80 px-3 py-2 text-[13px] focus:outline-none"
          autoFocus
        />
        <div className="min-h-[160px] flex-1 overflow-y-auto">
          {items === null && !error ? <p className="py-8 text-center text-[13px] text-neutral-400">{tt("正在加载…")}</p> : null}
          {error ? <p className="py-8 text-center text-[13px] text-red-600">{tt("作品加载失败，请稍后重试。")}</p> : null}
          {items && shown.length === 0 ? <p className="py-8 text-center text-[13px] text-neutral-400">{tt("没有找到作品")}</p> : null}
          <ul className="space-y-1">
            {shown.map((item) => {
              const thumb = safeMediaUrl(item.posterUrl ?? item.thumbUrl ?? null);
              const active = selected?.key === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    aria-pressed={active}
                    className={
                      "flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left " +
                      (active ? "border-neutral-300 bg-neutral-100" : "border-transparent hover:bg-neutral-50")
                    }
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-100 text-[10px] text-neutral-400">
                      {thumb ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-800">{item.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {selected ? (
          <label className={"mt-3 flex items-start gap-2 text-[12.5px] " + (selectedKind ? "text-neutral-700" : "text-neutral-400")}>
            <input
              type="checkbox"
              checked={coedit && Boolean(selectedKind)}
              disabled={!selectedKind}
              onChange={(event) => setCoedit(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              {tt("让这个会话的人一起改")}
              {!selectedKind ? <span className="block text-[11.5px]">{tt("这个作品暂时不支持一起改")}</span> : null}
            </span>
          </label>
        ) : null}
        {grantFailed ? <p className="mt-2 text-[12.5px] text-red-600">{tt("没能授权一起改，请重试，或取消勾选后只分享。")}</p> : null}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-[13px] text-neutral-600 hover:bg-neutral-100">
            {tt("取消")}
          </button>
          <button
            type="button"
            disabled={!selected || busy}
            onClick={() => void send()}
            className="rounded-lg bg-neutral-900 px-4 py-1.5 text-[13px] text-white disabled:opacity-40"
          >
            {busy ? tt("发送中") : tt("发送")}
          </button>
        </div>
      </div>
    </div>
  );
}
