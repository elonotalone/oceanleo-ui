"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import type { AdvancedWorkbenchDrawer } from "../advanced-editor-adapter";
import type { AdvancedFlushResult } from "../advanced-session-context";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import type { EditorMaterialInsertion } from "../editor-protocol";
import { uploadFile } from "../../lib/database";
import { SelectionToolbar } from "../SelectionToolbar";
import { EmbedEditorPane } from "../workbench-embed";
import { editorRouteFor, editorToolLabel } from "../workbench-routes";
import type { LibraryItem } from "../library-data";
import type {
  SelectionCommand,
  SelectionContext,
  SelectionControl,
} from "../selection-context";
import { selectionRequestId } from "../selection-context";
import {
  useWorkbenchMaterialAdapter,
  type WorkbenchMaterialAdapter,
} from "../workbench-material-provider";
import { UnsupportedRoute } from "./UnsupportedRoute";

interface RemoteChoice {
  value: string;
  label: string;
  swatch?: string;
}

function RemoteChoicePanel({
  title,
  controlId,
  choices,
  selectionId,
  onCommand,
}: {
  title: string;
  controlId: string;
  choices: RemoteChoice[];
  selectionId: string;
  onCommand: (command: SelectionCommand) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-3">
      <p className="mb-3 text-[12px] font-semibold text-[var(--fg,#292524)]">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() =>
              onCommand({
                requestId: selectionRequestId(),
                selectionId,
                controlId,
                value: choice.value,
              })
            }
            className="flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] px-3 py-2 text-left text-[11px] font-medium text-[var(--fg-2,#57534e)] transition hover:border-[var(--border-strong,#d6d3d1)] hover:bg-[var(--surface-hover,#fafaf9)]"
          >
            {choice.swatch && (
              <span
                className="h-6 w-6 shrink-0 rounded-md border border-black/10"
                style={
                  choice.swatch.startsWith("#")
                    ? { backgroundColor: choice.swatch }
                    : { backgroundImage: choice.swatch }
                }
              />
            )}
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const DESIGN_HOST_TOOLS: SelectionControl[] = [
  { id: "undo", kind: "action", label: "撤销", icon: "undo", placement: "tools" },
  { id: "redo", kind: "action", label: "重做", icon: "redo", placement: "tools" },
  { id: "design-templates", kind: "panel", label: "模板", icon: "templates", placement: "tools", panelId: "materials", panelAction: "replace" },
  { id: "design-materials", kind: "panel", label: "素材", icon: "materials", placement: "tools", panelId: "materials", panelAction: "insert" },
  { id: "design-shapes", kind: "panel", label: "形状", icon: "shape", placement: "tools", panelId: "design-shapes" },
  { id: "design-text", kind: "panel", label: "文字", icon: "text", placement: "tools", panelId: "design-text" },
  { id: "design-background", kind: "panel", label: "背景", icon: "background", placement: "tools", panelId: "design-background" },
];

const VIDEO_HOST_TOOLS: SelectionControl[] = [
  { id: "undo", kind: "action", label: "撤销", icon: "undo", placement: "tools" },
  { id: "redo", kind: "action", label: "重做", icon: "redo", placement: "tools" },
  { id: "video-nodes", kind: "panel", label: "节点", icon: "add", placement: "tools", panelId: "video-nodes" },
  { id: "video-materials", kind: "panel", label: "素材", icon: "materials", placement: "tools", panelId: "materials", panelAction: "insert" },
  { id: "run-all", kind: "action", label: "运行全部", icon: "animate", placement: "tools" },
];

const WEBSITE_HOST_TOOLS: SelectionControl[] = [
  { id: "site-device", kind: "panel", label: "设备", icon: "pages", placement: "tools", panelId: "site-device" },
  { id: "site-materials", kind: "panel", label: "素材", icon: "materials", placement: "tools", panelId: "materials", panelAction: "insert" },
  { id: "refresh-preview", kind: "action", label: "刷新", icon: "redo", placement: "tools" },
];

const DESIGN_SHAPES: RemoteChoice[] = [
  ["rect", "矩形"],
  ["circle", "圆形"],
  ["triangle", "三角形"],
  ["line", "线条"],
  ["arrow", "箭头"],
  ["star", "星形"],
  ["polygon", "多边形"],
  ["bubble", "对话泡泡"],
  ["ribbon", "丝带横幅"],
].map(([value, label]) => ({ value, label }));

const DESIGN_TEXT: RemoteChoice[] = [
  ["h1", "H1 标题"],
  ["h2", "H2 副标题"],
  ["body", "正文"],
  ["emphasis", "强调文本"],
  ["warp", "变形文字"],
].map(([value, label]) => ({ value, label }));

const DESIGN_BACKGROUND: RemoteChoice[] = [
  { value: "#ffffff", label: "纯白", swatch: "#ffffff" },
  { value: "#f8fafc", label: "浅灰", swatch: "#f8fafc" },
  { value: "#fef3c7", label: "暖黄", swatch: "#fef3c7" },
  { value: "#dbeafe", label: "浅蓝", swatch: "#dbeafe" },
  { value: "#fce7f3", label: "浅粉", swatch: "#fce7f3" },
  { value: "#111827", label: "深色", swatch: "#111827" },
];

const VIDEO_NODES: RemoteChoice[] = [
  ["text", "剧本 / 文本"],
  ["script", "脚本"],
  ["model", "模型"],
  ["image", "图片生成"],
  ["video", "视频生成"],
  ["imageInput", "图片素材"],
  ["videoInput", "视频素材"],
  ["audioInput", "音频素材"],
  ["subtitle", "字幕"],
  ["bgm", "背景音乐"],
  ["compose", "视频合成"],
  ["output", "输出"],
].map(([value, label]) => ({ value, label }));

export function EmbeddedRoute({
  item,
  previewContent,
  linkUrl,
  taskId,
  siteId = "",
  accent = "#4f46e5",
  onClose,
}: AdvancedContentWorkbenchProps) {
  const route = editorRouteFor(item);
  const [saveRequestId, setSaveRequestId] = useState("");
  const [editRevision, setEditRevision] = useState(0);
  const [closeRequestRevision, setCloseRequestRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [selectionCommand, setSelectionCommand] =
    useState<SelectionCommand | null>(null);
  const [materialInsertion, setMaterialInsertion] =
    useState<EditorMaterialInsertion | null>(null);
  const materialResolversRef = useRef(
    new Map<
      string,
      {
        resolve: () => void;
        reject: (error: Error) => void;
        timer: number;
      }
    >(),
  );
  const pendingSaveIdRef = useRef("");
  const saveResolverRef = useRef<
    ((result: AdvancedFlushResult) => void) | null
  >(null);
  const saveTimerRef = useRef<number | null>(null);
  const remoteRevisionRef = useRef(0);
  const hostedMediaType = route.type === "embed" ? route.mediaType : null;
  const hostToolControls =
    hostedMediaType === "canvas"
      ? DESIGN_HOST_TOOLS
      : hostedMediaType === "video_canvas"
        ? VIDEO_HOST_TOOLS
        : hostedMediaType === "website"
          ? WEBSITE_HOST_TOOLS
          : [];
  const hostedSelection = useMemo<SelectionContext | null>(() => {
    if (!hostedMediaType || !selection) return selection;
    const hostIds = new Set(hostToolControls.map((control) => control.id));
    if (
      selection.id === "design-canvas" ||
      selection.id === "video-canvas" ||
      selection.id === "website-canvas"
    ) {
      return null;
    }
    return {
      version: 1,
      kind: selection.kind,
      id: selection.id,
      label: selection.label,
      ...(selection.text ? { text: selection.text } : {}),
      ...(selection.anchor ? { anchor: selection.anchor } : {}),
      controls: [
        ...hostToolControls,
        ...selection.controls.filter((control) => !hostIds.has(control.id)),
      ].slice(0, 32),
    };
  }, [hostToolControls, hostedMediaType, route, selection]);
  const remoteDrawers = useMemo<AdvancedWorkbenchDrawer[]>(() => {
    const selectionId = hostedSelection?.id || `host:${hostedMediaType || "editor"}`;
    const panel = (
      id: string,
      label: string,
      controlId: string,
      choices: RemoteChoice[],
    ): AdvancedWorkbenchDrawer => ({
      id,
      label,
      icon:
        id === "design-text"
          ? "text"
          : id === "design-background"
            ? "background"
            : id === "video-nodes"
              ? "add"
              : "elements",
      content: (
        <RemoteChoicePanel
          title={label}
          controlId={controlId}
          choices={choices}
          selectionId={selectionId}
          onCommand={setSelectionCommand}
        />
      ),
    });
    if (hostedMediaType === "canvas") {
      return [
        panel("design-shapes", "形状", "insert-shape", DESIGN_SHAPES),
        panel("design-text", "文字", "insert-text", DESIGN_TEXT),
        panel(
          "design-background",
          "背景",
          "background-color",
          DESIGN_BACKGROUND,
        ),
      ];
    }
    if (hostedMediaType === "video_canvas") {
      return [panel("video-nodes", "添加节点", "add-node", VIDEO_NODES)];
    }
    if (hostedMediaType === "website") {
      return [
        panel("site-device", "预览设备", "set-device", [
          { value: "desktop", label: "桌面" },
          { value: "mobile", label: "手机" },
        ]),
      ];
    }
    return [];
  }, [hostedMediaType, hostedSelection?.id]);
  useEffect(() => {
    setSelection(null);
    setSelectionCommand(null);
    setMaterialInsertion(null);
    setDirty(false);
    setEditRevision(0);
    remoteRevisionRef.current = 0;
  }, [item.key]);
  const handleDirtyChange = useCallback(
    (nextDirty: boolean, remoteRevision?: number) => {
      setDirty(nextDirty);
      if (!nextDirty) return;
      if (Number.isSafeInteger(remoteRevision) && Number(remoteRevision) >= 0) {
        const nextRemote = Number(remoteRevision);
        if (nextRemote === remoteRevisionRef.current) return;
        remoteRevisionRef.current = nextRemote;
      }
      setEditRevision((value) => value + 1);
    },
    [],
  );
  useEffect(
    () => () => {
      materialResolversRef.current.forEach((pending) => {
        window.clearTimeout(pending.timer);
        pending.reject(new Error("嵌入编辑器已关闭。"));
      });
      materialResolversRef.current.clear();
    },
    [],
  );
  const settleSave = useCallback((result: AdvancedFlushResult) => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const resolve = saveResolverRef.current;
    saveResolverRef.current = null;
    pendingSaveIdRef.current = "";
    resolve?.(result);
  }, []);
  useEffect(
    () => () => {
      settleSave({ ok: false });
    },
    [settleSave],
  );
  const saveBeforeNewConversation = useCallback(
    () =>
      new Promise<AdvancedFlushResult>((resolve) => {
        settleSave({ ok: false });
        const requestId = `host-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`;
        pendingSaveIdRef.current = requestId;
        saveResolverRef.current = resolve;
        setSaveRequestId(requestId);
        saveTimerRef.current = window.setTimeout(
          () => settleSave({ ok: false, error: "编辑器保存超时" }),
          item.kind === "website" ? 5 * 60_000 : 25_000,
        );
      }),
    [item.kind, settleSave],
  );
  const handleSaveResult = useCallback(
    (result: { ok: boolean; saveId?: string; item?: LibraryItem }) => {
      if (
        saveResolverRef.current &&
        result.saveId === pendingSaveIdRef.current
      ) {
        settleSave(
          result.ok
            ? { ok: true, item: result.item }
            : { ok: false, error: "编辑器保存失败" },
        );
      }
    },
    [settleSave],
  );
  const requestEditorClose = useCallback(() => {
    setCloseRequestRevision((value) => value + 1);
  }, []);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter | null>(() => {
    if (!hostedMediaType) return null;
    return {
      id: `embed-materials:${hostedMediaType}@2`,
      actions:
        hostedMediaType === "canvas"
          ? ["insert", "replace", "apply"]
          : ["insert"],
      accepts: (material) => {
        const urls = [
          material.url,
          material.previewUrl,
          material.thumbUrl,
        ].filter(Boolean);
        const mime = String(material.meta.mime || "").toLowerCase();
        if (hostedMediaType === "website" || hostedMediaType === "canvas") {
          return (
            Boolean(material.previewUrl || material.thumbUrl) ||
            material.kind === "image" ||
            mime.startsWith("image/") ||
            urls.some((url) =>
              /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url || ""),
            )
          );
        }
        return (
          ["image", "video", "audio"].includes(material.kind) ||
          /^(?:image|video|audio)\//.test(mime) ||
          urls.some((url) =>
            /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i.test(
              url || "",
            ),
          )
        );
      },
      mutate: (action, material, placement) => {
        const candidates = (
          hostedMediaType === "video_canvas"
            ? [material.url, material.previewUrl, material.thumbUrl]
            : [material.previewUrl, material.thumbUrl, material.url]
        ).filter(Boolean) as string[];
        const supportedUrl =
          hostedMediaType === "video_canvas"
            ? /\.(?:png|jpe?g|webp|gif|svg|mp4|webm|mov|mp3|wav|m4a|ogg)(?:$|[?#])/i
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i;
        const url =
          candidates.find((candidate) => supportedUrl.test(candidate)) ||
          candidates[0] ||
          "";
        if (!url) throw new Error("这个素材没有可用地址。");
        const resolvedKind = /\.(?:mp4|webm|mov)(?:$|[?#])/i.test(url)
          ? "video"
          : /\.(?:mp3|wav|m4a|ogg)(?:$|[?#])/i.test(url)
            ? "audio"
            : /\.(?:png|jpe?g|webp|gif|svg)(?:$|[?#])/i.test(url)
              ? "image"
              : material.kind;
        const commandId = `material-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
        return new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            materialResolversRef.current.delete(commandId);
            setMaterialInsertion((current) =>
              current?.commandId === commandId ? null : current,
            );
            reject(new Error("嵌入编辑器添加素材超时。"));
          }, 20_000);
          materialResolversRef.current.set(commandId, {
            resolve,
            reject,
            timer,
          });
          setMaterialInsertion({
            commandId,
            action,
            material: {
              id: material.key || material.id,
              kind: resolvedKind,
              title: material.title,
              url,
              previewUrl: material.previewUrl || material.thumbUrl,
              meta: {
                format: material.meta.format,
                mime: material.meta.mime,
                content_type: material.meta.content_type,
                subtype: material.meta.subtype,
                template_doc_url: material.meta.template_doc_url,
              },
              writable: false,
            },
            ...(placement?.source === "drop" &&
            Number.isFinite(placement.clientX) &&
            Number.isFinite(placement.clientY)
              ? {
                  point: {
                    x: placement.clientX as number,
                    y: placement.clientY as number,
                  },
                }
              : {}),
          });
        });
      },
    };
  }, [hostedMediaType]);
  useWorkbenchMaterialAdapter(materialAdapter);
  const handleMaterialResult = useCallback(
    (result: { commandId: string; ok: boolean; message?: string }) => {
      const pending = materialResolversRef.current.get(result.commandId);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      materialResolversRef.current.delete(result.commandId);
      setMaterialInsertion((current) =>
        current?.commandId === result.commandId ? null : current,
      );
      if (result.ok) pending.resolve();
      else pending.reject(new Error(result.message || "素材添加失败。"));
    },
    [],
  );
  const websiteId = useMemo(
    () =>
      String(
        item.meta.website_id ||
          item.meta.project_id ||
          item.meta.slug ||
          item.meta.site_id ||
          "",
      ),
    [item.meta],
  );
  const starterId = useMemo(
    () => String(item.meta.starter_id || "").trim(),
    [item.meta],
  );
  const githubRepo = useMemo(
    () => String(item.meta.github_repo || "").trim(),
    [item.meta],
  );
  const commitSha = useMemo(
    () => String(item.meta.commit_sha || "").trim(),
    [item.meta],
  );
  const extraParams = useMemo(
    () => {
      const blank: Record<string, string> =
        item.meta.draft === true && !item.url && !item.previewUrl
          ? { blank: "1" }
          : {};
      if (item.kind !== "website") {
        return Object.keys(blank).length ? blank : undefined;
      }
      if (websiteId) {
        return {
          ...blank,
          siteId: websiteId,
          projectId: websiteId,
          ...(starterId ? { starterId } : {}),
          ...(githubRepo ? { githubRepo } : {}),
          ...(commitSha ? { commitSha } : {}),
        };
      }
      return Object.keys(blank).length || starterId || githubRepo
        ? {
            ...blank,
            ...(starterId ? { starterId } : {}),
            ...(githubRepo ? { githubRepo } : {}),
            ...(commitSha ? { commitSha } : {}),
          }
        : undefined;
    },
    [
      item.kind,
      item.meta.draft,
      item.previewUrl,
      item.url,
      starterId,
      websiteId,
      githubRepo,
      commitSha,
    ],
  );

  if (route.type !== "embed") {
    return (
      <UnsupportedRoute
        item={item}
        previewContent={previewContent}
        linkUrl={linkUrl}
        taskId={taskId}
        siteId={siteId}
        accent={accent}
        onClose={onClose}
      />
    );
  }

  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      adapter={{
        id:
          route.mediaType === "website"
            ? "website"
            : route.mediaType === "video_canvas"
              ? "video-canvas"
              : "design-canvas",
        label: editorToolLabel(route),
        stage: (
          <EmbedEditorPane
            key={`${item.key}:${item.url || ""}:${item.previewUrl || ""}:${item.title}`}
            item={item}
            editorBase={route.base}
            mediaType={route.mediaType}
            siteId={siteId}
            extraParams={extraParams}
            onCloseRequest={requestEditorClose}
            onDirtyChange={handleDirtyChange}
            onSelectionChange={setSelection}
            selectionCommand={selectionCommand}
            materialInsertion={materialInsertion}
            onMaterialResult={handleMaterialResult}
            onSaveResult={handleSaveResult}
            saveRequestId={saveRequestId}
          />
        ),
        contextToolbar: (
          <SelectionToolbar
            context={hostedSelection}
            onCommand={setSelectionCommand}
            accent={accent}
          />
        ),
        drawers: remoteDrawers,
        nativeChrome: { toolbar: true, viewport: true },
        persistence: {
          dirty,
          editRevision,
          flush: saveBeforeNewConversation,
        },
        upload: materialAdapter
          ? {
              accept:
                route.mediaType === "video_canvas"
                  ? "image/*,video/*,audio/*"
                  : "image/*",
              multiple: true,
              onFiles: async (files) => {
                for (const file of files) {
                  const uploaded = await uploadFile(file, {
                    siteId: siteId || route.mediaType,
                    title: file.name,
                  });
                  const row = uploaded.data?.file;
                  if (!uploaded.ok || !row?.url) {
                    throw new Error(uploaded.error || "文件上传失败");
                  }
                  await materialAdapter.mutate(
                    "insert",
                    {
                      key: `upload:${row.id || row.url}`,
                      source: "creation",
                      id: row.id || row.url,
                      title: row.title || file.name,
                      kind: file.type.startsWith("video/")
                        ? "video"
                        : file.type.startsWith("audio/")
                          ? "audio"
                          : "image",
                      siteId: siteId || route.mediaType,
                      url: row.url,
                      previewUrl: row.thumb_url || row.url,
                      thumbUrl: row.thumb_url || row.url,
                      favorite: false,
                      meta: {
                        mime: file.type,
                        format: file.name.split(".").pop()?.toLowerCase() || "",
                      },
                    },
                    { source: "click" },
                  );
                }
              },
            }
          : undefined,
        closeRequestRevision,
      }}
      onClose={onClose}
    />
  );
}
