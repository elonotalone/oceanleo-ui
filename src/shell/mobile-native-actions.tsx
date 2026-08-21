"use client";

// ============================================================================
// @oceanleo/ui — 手机原生上传口（拍照 / 相册 / 文件）+ 任务完成通知
// ----------------------------------------------------------------------------
// 背景：`mobile-bridge.ts` 早就把相机、相册、系统文件选择器、本地通知接通了，但
// 界面上没有任何一个按钮会去调它 —— 能力在，入口不在，等于没有。这个模块就是那个入口。
//
// 铁律：**我们不为手机单独维护一套 UI。** 手机壳 `server.url = https://oceanleo.com`，
// 用户在手机上看到的就是这个网站。所以入口写在网页端组件里，靠「宿主是不是原生」在
// 运行时决定显不显示：
//   - 普通浏览器 / SSR → `useNativeAttachActions()` 返回空数组，组件渲染 `null`，
//     网页端 DOM 一个字节都不多。
//   - 原生宿主 → 三项挂进**既有的**「＋」附件菜单 / 既有的上传按钮，不另立一排按钮。
//
// 拿到的字节一律包成 `File` 交给上传口既有的 `onAttachFiles` / `onFiles`，
// 不另开一条上传实现 —— 附件缩略条、上传中转圈、发送键可用性全都自动跟着走。
// ============================================================================

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  MOBILE_BRIDGE_GLOBAL,
  detectNativeHost,
  pickFilesWithSystemPicker,
  pickPhotosWithSystemPicker,
  readNativeMediaUrl,
  resolvePlugin,
  scanWithSystemCamera,
  type MobileBridgeHandle,
  type MobileResult,
  type NativeHost,
} from "./mobile-bridge";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

/** 站点在任务真的跑完时派发这个事件，手机上就会收到系统通知。 */
export const TASK_FINISHED_EVENT = "oceanleo:task-finished";

/** 一项原生入口（「＋」菜单里的一行 / 上传按钮弹出的一项）。 */
export interface NativeAttachAction {
  id: "camera" | "photos" | "files";
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

function bridgeHandle(): MobileBridgeHandle | null {
  if (typeof window === "undefined") return null;
  const handle = (window as any)[MOBILE_BRIDGE_GLOBAL];
  return handle && typeof handle === "object" ? (handle as MobileBridgeHandle) : null;
}

/**
 * 原生宿主检测放进 effect，而不是渲染期直接读 `window`：
 * 服务端首帧与客户端首帧因此逐字相同，不会撞 hydration mismatch。
 */
function useNativeHost(): NativeHost | null {
  const [host, setHost] = useState<NativeHost | null>(null);
  useEffect(() => {
    setHost(detectNativeHost());
  }, []);
  return host;
}

/** 把原生选择器给的 webview URL 读成 `File`，好走既有的附件通路。 */
async function urlToFile(url: string, fallbackName: string): Promise<File | null> {
  const media = await readNativeMediaUrl(url);
  if (!media) return null;
  const name = media.name || fallbackName;
  try {
    return new File([media.bytes as BlobPart], name, { type: media.mime });
  } catch {
    return null;
  }
}

function photoPaths(result: MobileResult): string[] {
  if (!result.ok) return [];
  const photos = (result as any).photos;
  const single = (result as any).photo;
  const list = Array.isArray(photos) ? photos : single ? [single] : [];
  return list
    .map((p: any) => String(p?.webPath || p?.path || ""))
    .filter((p: string) => p.length > 0);
}

/**
 * 三项原生入口。**非原生宿主下返回空数组**（引用恒定），调用方据此渲染 `null`。
 *
 * 不传 `onFiles` 也返回空数组：拿到了字节却没有地方交，那三项就是死按钮。
 */
export function useNativeAttachActions({
  onFiles,
  accept,
  multiple = true,
}: {
  onFiles?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
} = {}): NativeAttachAction[] {
  const tt = useUI();
  const host = useNativeHost();
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  const deliver = useCallback((files: Array<File | null>) => {
    const usable = files.filter((f): f is File => Boolean(f));
    if (usable.length) onFilesRef.current?.(usable);
  }, []);

  const camera = useCallback(async () => {
    const handle = bridgeHandle();
    const result = handle
      ? await handle.scanWithCamera()
      : await (async () => {
          const plugin = await resolvePlugin("Camera", host);
          return plugin
            ? await scanWithSystemCamera(plugin)
            : ({ ok: false } as MobileResult);
        })();
    const paths = photoPaths(result);
    deliver(await Promise.all(paths.map((p) => urlToFile(p, "photo.jpg"))));
  }, [deliver, host]);

  const photos = useCallback(async () => {
    const handle = bridgeHandle();
    const result = handle
      ? await handle.pickPhotos()
      : await (async () => {
          const plugin = await resolvePlugin("Camera", host);
          return plugin
            ? await pickPhotosWithSystemPicker(plugin)
            : ({ ok: false } as MobileResult);
        })();
    const paths = photoPaths(result);
    deliver(await Promise.all(paths.map((p) => urlToFile(p, "photo.jpg"))));
  }, [deliver, host]);

  const files = useCallback(async () => {
    const handle = bridgeHandle();
    const result = handle
      ? await handle.pickFiles({ accept, multiple })
      : await pickFilesWithSystemPicker({ accept, multiple });
    if (!result.ok) return;
    const picked = (result as any).files;
    deliver(Array.isArray(picked) ? picked : []);
  }, [accept, deliver, multiple]);

  return useMemo(() => {
    if (!host || !onFiles) return EMPTY_ACTIONS;
    return [
      {
        id: "camera" as const,
        label: tt("拍照"),
        icon: <CameraGlyph />,
        onClick: () => void camera(),
      },
      {
        id: "photos" as const,
        label: tt("从相册选择"),
        icon: <AlbumGlyph />,
        onClick: () => void photos(),
      },
      {
        id: "files" as const,
        label: tt("选择文件"),
        icon: <FolderGlyph />,
        onClick: () => void files(),
      },
    ];
  }, [camera, files, host, onFiles, photos, tt]);
}

const EMPTY_ACTIONS: NativeAttachAction[] = [];

/**
 * 三选一列表：给「只有一颗上传按钮、没有＋菜单」的上传口用（`InputCard`）——
 * 那颗按钮在原生态下不再直接开文件选择器，而是展开这三项，**不多出一颗按钮**。
 *
 * 没有原生项、或没展开，就渲染 `null` —— 浏览器里这个组件不产生任何 DOM。
 * 它是在流内渲染的，所以宿主不必为它加 `relative` 定位类（那会改到网页端的 DOM）。
 */
export function NativeAttachSheet({
  actions,
  open,
  onClose,
}: {
  actions: NativeAttachAction[];
  open: boolean;
  onClose: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (actions.length === 0 || !open) return null;

  return (
    <div
      ref={rootRef}
      className="v-fade-up overflow-hidden rounded-xl border border-neutral-200 bg-white py-1.5 shadow-sm"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => {
            onClose();
            action.onClick();
          }}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-neutral-700 transition hover:bg-neutral-100"
        >
          <span className="shrink-0 text-neutral-500">{action.icon}</span>
          <span className="flex-1">{action.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 通知：只在第一次真的派活时要权限，只在用户没在看的时候推
 * ------------------------------------------------------------------ */

/**
 * 用户第一次真的派出一个任务时调这个。
 *
 * 通知权限**不在启动时问** —— 一装上来就弹权限框，用户直接拒，而拒绝是永久的。
 * 浏览器里没有桥，这就是个空操作。桥自己保证「至多问一次、拒过不再问」。
 */
export function requestTaskNotificationsOnce(): void {
  const handle = bridgeHandle();
  if (!handle?.ensureTaskNotifications) return;
  void handle.ensureTaskNotifications().catch(() => {});
}

let notifiedTaskIds: Set<string> | null = null;
let taskNoticeSubscribers = 0;
let taskNoticeDispose: (() => void) | null = null;
let taskNoticeTranslate: UITranslate = (zh) => zh;

function notificationIdFor(taskId: string): number {
  let hash = 0;
  for (let i = 0; i < taskId.length; i += 1) {
    hash = (hash * 31 + taskId.charCodeAt(i)) % 2147483647;
  }
  return hash || 1;
}

async function onTaskFinished(event: Event) {
  const handle = bridgeHandle();
  if (!handle) return;
  const detail = (event as CustomEvent)?.detail ?? {};
  const taskId = String(detail.taskId ?? "").trim();
  if (!taskId) return;

  notifiedTaskIds ??= new Set();
  if (notifiedTaskIds.has(taskId)) return;
  notifiedTaskIds.add(taskId);

  const tt = taskNoticeTranslate;
  try {
    await handle.notifyTask({
      notificationId: notificationIdFor(taskId),
      title: String(detail.title || tt("任务已完成")),
      body: String(detail.body || tt("回到 OceanLeo 查看结果")),
      taskId,
    });
  } catch {
    // 通知失败绝不影响任务本身。
  }
}

/**
 * 监听任务完成 → 推系统通知。多处输入框同时挂载也只装一个监听（同一个 taskId 只推一次），
 * 否则用户一次任务会收到好几条。浏览器里 `bridgeHandle()` 恒为 `null`，什么都不会发生。
 */
export function useNativeTaskNotifications(): void {
  const tt = useUI();
  taskNoticeTranslate = tt;

  useEffect(() => {
    taskNoticeSubscribers += 1;
    if (taskNoticeSubscribers === 1) {
      const handler = (event: Event) => void onTaskFinished(event);
      window.addEventListener(TASK_FINISHED_EVENT, handler);
      taskNoticeDispose = () =>
        window.removeEventListener(TASK_FINISHED_EVENT, handler);
    }
    return () => {
      taskNoticeSubscribers = Math.max(0, taskNoticeSubscribers - 1);
      if (taskNoticeSubscribers === 0) {
        taskNoticeDispose?.();
        taskNoticeDispose = null;
      }
    };
  }, []);
}

/* --- 图标（与输入框既有工具条同一档尺寸/描边） --------------------------- */

function CameraGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

function AlbumGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.4" />
      <path d="M21 16l-5-5-8 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" strokeLinejoin="round" />
    </svg>
  );
}
