"use client";

// OnlyOffice 工作台：pptx/docx/xlsx/pdf 的真 WYSIWYG 编辑。
// config 由网关签名（/v1/office/config），保存由 Document Server 回调网关落库
// （新版本进「我的库」，parent_asset_id 链接原素材，不覆盖）。

import { useCallback, useEffect, useRef, useState } from "react";
import { useUI } from "../../i18n/ui/useUI";
import {
  fetchOfficeConfig,
  loadOfficeScript,
  officeExtensionOf,
  officeKindForExtension,
} from "../../lib/office-client";
import { importMediaUrl } from "../../lib/media-proxy";
import type { LibraryItem } from "../library-data";

interface DocsApiEditor {
  destroyEditor: () => void;
  requestClose?: () => void;
}

interface DocsApiGlobal {
  DocEditor: new (
    elementId: string,
    config: Record<string, unknown>,
  ) => DocsApiEditor;
}

export interface OfficeWorkbenchProps {
  item: LibraryItem;
  siteId?: string;
  accent?: string;
  /** DS 保存回调是异步落库的；这个回调用于宿主刷新版本列表。 */
  onSaveQueued?: () => void;
}

export function useOfficeWorkbench(
  item: LibraryItem,
  siteId?: string,
  onCloseApproved?: () => void,
) {
  const tt = useUI();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [saveCount, setSaveCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const editorRef = useRef<DocsApiEditor | null>(null);
  const onCloseApprovedRef = useRef(onCloseApproved);
  const mountGenerationRef = useRef(0);
  const dirtySinceSaveRef = useRef(false);
  const hostIdRef = useRef(
    `oo-host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );

  const url = item.url || "";
  const extension = officeExtensionOf(url);
  const officeKind = officeKindForExtension(extension);

  useEffect(() => {
    onCloseApprovedRef.current = onCloseApproved;
  }, [onCloseApproved]);

  const mount = useCallback(async () => {
    const generation = ++mountGenerationRef.current;
    editorRef.current?.destroyEditor();
    editorRef.current = null;
    dirtySinceSaveRef.current = false;
    setDirty(false);
    setState("loading");
    setError("");
    try {
      if (!url) throw new Error(tt("这个素材没有可编辑的文件地址"));
      if (!extension) throw new Error(tt("此文件类型不支持 Office 编辑"));
      let effectiveUrl = url;
      let result = await fetchOfficeConfig({
        url: effectiveUrl,
        title: item.title,
        kind: officeKind,
        siteId,
        itemId: item.id,
      });
      if (generation !== mountGenerationRef.current) return;
      if (!result.ok && result.error?.includes("必须先保存到我的库")) {
        effectiveUrl = await importMediaUrl(url, {
          kind: "file",
          siteId: siteId || "oceanleo",
          title: item.title,
        });
        if (generation !== mountGenerationRef.current) return;
        result = await fetchOfficeConfig({
          url: effectiveUrl,
          title: item.title,
          kind: officeKind,
          siteId,
          itemId: item.id,
        });
        if (generation !== mountGenerationRef.current) return;
      }
      if (!result.ok || !result.documentServerUrl) {
        throw new Error(result.error || tt("获取编辑器配置失败"));
      }
      await loadOfficeScript(result.documentServerUrl);
      if (generation !== mountGenerationRef.current) return;
      const docsApi = (window as unknown as { DocsAPI?: DocsApiGlobal }).DocsAPI;
      if (!docsApi) throw new Error(tt("OnlyOffice 脚本加载失败"));
      const config = {
        ...result.config,
        width: "100%",
        height: "100%",
        events: {
          onDocumentReady: () => {
            if (generation === mountGenerationRef.current) setState("ready");
          },
          onDocumentStateChange: (event: { data?: boolean }) => {
            if (generation !== mountGenerationRef.current) return;
            if (event.data === true) {
              dirtySinceSaveRef.current = true;
              setDirty(true);
            } else if (dirtySinceSaveRef.current) {
              dirtySinceSaveRef.current = false;
              setDirty(false);
              setSaveCount((value) => value + 1);
              window.setTimeout(() => {
                if (generation === mountGenerationRef.current) {
                  setSaveCount((value) => value + 1);
                }
              }, 2500);
            }
          },
          onError: (event: { data?: { errorDescription?: string } }) => {
            if (generation !== mountGenerationRef.current) return;
            setError(String(event?.data?.errorDescription || tt("编辑器发生错误")));
            setState("error");
          },
          // DS fires this when a save round-trip lands (forcesave/autosave).
          onRequestHistoryClose: () => undefined,
          onRequestClose: () => onCloseApprovedRef.current?.(),
          onInfo: () => undefined,
        },
      };
      editorRef.current = new docsApi.DocEditor(hostIdRef.current, config);
    } catch (caught) {
      if (generation !== mountGenerationRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  }, [
    extension,
    item.id,
    item.title,
    officeKind,
    siteId,
    tt,
    url,
  ]);

  useEffect(() => {
    void mount();
    return () => {
      mountGenerationRef.current += 1;
      editorRef.current?.destroyEditor();
      editorRef.current = null;
    };
  }, [mount]);

  return {
    state,
    error,
    extension,
    hostId: hostIdRef.current,
    saveCount,
    dirty,
    requestClose: () => {
      if (editorRef.current?.requestClose) {
        editorRef.current.requestClose();
      } else if (
        !dirtySinceSaveRef.current ||
        window.confirm(tt("文档还有未同步修改，确定关闭编辑器吗？"))
      ) {
        onCloseApprovedRef.current?.();
      }
    },
    retry: mount,
    noteSaved: () => setSaveCount((value) => value + 1),
  };
}

export type OfficeWorkbenchEditor = ReturnType<typeof useOfficeWorkbench>;

export function OfficeControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: OfficeWorkbenchEditor;
  accent?: string;
}) {
  const tt = useUI();
  return (
    <div className="space-y-3 p-3 text-[12px] leading-relaxed text-stone-600">
      <p className="font-medium text-stone-800">
        {tt("Office 专业编辑")}
        {editor.extension ? ` · .${editor.extension}` : ""}
      </p>
      <p>
        {tt(
          "右侧是完整的 Office 编辑器：排版、样式、表格、图形、批注等全部可用。保存后的新版本会进入我的库，不覆盖原文件。",
        )}
      </p>
      {editor.state === "loading" && (
        <p className="rounded-lg bg-stone-100 px-3 py-2 text-stone-500">
          {tt("正在加载编辑器…")}
        </p>
      )}
      {editor.state === "error" && (
        <div className="space-y-2">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{editor.error}</p>
          <button
            type="button"
            onClick={() => void editor.retry()}
            className="w-full rounded-xl px-3 py-2 text-[12px] font-semibold text-white"
            style={{ background: accent }}
          >
            {tt("重试")}
          </button>
        </div>
      )}
      <p className="text-[11px] text-stone-400">
        {editor.dirty
          ? tt("有修改正在同步；关闭时会先由 Office 编辑器确认。")
          : tt("编辑内容由 OceanLeo 自托管的文档服务处理，自动保存开启。")}
      </p>
    </div>
  );
}

export function OfficeStage({ editor }: { editor: OfficeWorkbenchEditor }) {
  const tt = useUI();
  return (
    <div className="relative h-full w-full bg-stone-100">
      {editor.state === "loading" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/80 text-[13px] text-stone-500">
          {tt("正在加载 Office 编辑器…")}
        </div>
      )}
      {editor.state === "error" && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white text-[13px] text-red-600">
          {editor.error}
        </div>
      )}
      {/* OnlyOffice replaces this div with its iframe. */}
      <div id={editor.hostId} className="h-full w-full" />
    </div>
  );
}

export function OfficeWorkbench({ item, siteId, accent, onSaveQueued }: OfficeWorkbenchProps) {
  const editor = useOfficeWorkbench(item, siteId);
  useEffect(() => {
    if (editor.saveCount > 0) onSaveQueued?.();
  }, [editor.saveCount, onSaveQueued]);
  return (
    <div className="flex h-full">
      <div className="w-72 shrink-0 border-r border-stone-200 bg-white">
        <OfficeControls editor={editor} accent={accent} />
      </div>
      <div className="min-w-0 flex-1">
        <OfficeStage editor={editor} />
      </div>
    </div>
  );
}
