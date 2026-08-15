"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { defaultLibraryScopeAdapter } from "./library-scope-client";

/** Read-only projection of GET /v1/devices used by the library surface. */
export interface LibraryDevice {
  device_id: string;
  platform: string;
  device_name: string;
  online: boolean;
  local_exec_enabled: boolean;
  granted_kinds: string[];
  last_seen_at?: string | null;
}

/** The only fields an fs.list result may expose for one local file. */
export interface LocalLibraryFile {
  name: string;
  bytes: number;
  kind: string;
}

export interface LocalLibrarySnapshot {
  files: LocalLibraryFile[];
  updatedAt: string | number | Date;
}

export interface CloudLibraryReference {
  id: string;
  name: string;
  bytes?: number;
  href?: string;
}

/**
 * W5 owns the device facade and W7 owns task creation/polling. This adapter is
 * deliberately dependency-injected so the library never forks either HTTP
 * client. `refreshLocalLibrary` must resolve from a completed fs.list summary.
 */
export interface LibraryScopeAdapter {
  listDevices?: () => Promise<readonly LibraryDevice[]>;
  refreshLocalLibrary?: (
    device: LibraryDevice,
  ) => Promise<LocalLibrarySnapshot>;
}

export interface LibraryScopeIntegration extends LibraryScopeAdapter {
  devices?: readonly LibraryDevice[];
  snapshots?: Readonly<Record<string, LocalLibrarySnapshot | undefined>>;
  cloudItems?: readonly CloudLibraryReference[];
  now?: () => number;
  onOpenCloudItem?: (itemId: string) => void;
}

export interface LibraryScopeProps extends LibraryScopeIntegration {
  children: ReactNode;
  className?: string;
}

type LibraryScopeId = "cloud" | "local-empty" | `device:${string}`;

function deviceScope(deviceId: string): LibraryScopeId {
  return `device:${deviceId}`;
}

function deviceIdFromScope(scope: LibraryScopeId): string | null {
  return scope.startsWith("device:") ? scope.slice("device:".length) : null;
}

function normalizedFileName(name: string): string {
  return name.trim().normalize("NFKC").toLocaleLowerCase();
}

export function cloudReferenceForLocalFile(
  file: LocalLibraryFile,
  cloudItems: readonly CloudLibraryReference[],
): CloudLibraryReference | undefined {
  const name = normalizedFileName(file.name);
  return cloudItems.find(
    (item) =>
      normalizedFileName(item.name) === name &&
      item.bytes !== undefined &&
      item.bytes === file.bytes,
  );
}

export function formatLibraryUpdatedAt(
  updatedAt: LocalLibrarySnapshot["updatedAt"],
  now = Date.now(),
): string {
  const timestamp =
    updatedAt instanceof Date
      ? updatedAt.getTime()
      : typeof updatedAt === "number"
        ? updatedAt
        : Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return "时间未知";
  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (elapsedSeconds < 60) return "刚刚";
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LocalLibraryPanel({
  device,
  snapshot,
  loading,
  error,
  cloudItems,
  now,
  canRefresh,
  onRefresh,
  onOpenCloudItem,
}: {
  device: LibraryDevice;
  snapshot?: LocalLibrarySnapshot;
  loading: boolean;
  error?: string;
  cloudItems: readonly CloudLibraryReference[];
  now: number;
  canRefresh: boolean;
  onRefresh: () => void;
  onOpenCloudItem?: (itemId: string) => void;
}) {
  if (!device.online) {
    return (
      <div data-library-state="offline" className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-8 text-center">
        <h2 className="text-base font-semibold text-amber-950">{device.device_name} · 本地库</h2>
        <p className="mt-2 text-sm text-amber-800">
          {device.device_name} 现在离线，看不到它的本地库。它上线后这里会恢复。
        </p>
      </div>
    );
  }

  return (
    <section
      data-library-state={
        snapshot ? (snapshot.files.length === 0 ? "empty" : "ready") : "not-loaded"
      }
      className="space-y-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{device.device_name} · 本地库</h2>
          <p className="mt-1 text-xs leading-relaxed text-stone-500">
            文件正文从未上传到 OceanLeo。列表来自这台电脑最近一次返回的结构摘要。
          </p>
          {snapshot && (
            <p className="mt-1 text-xs font-medium text-stone-600">
              更新于 {formatLibraryUpdatedAt(snapshot.updatedAt, now)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={!canRefresh || loading}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
        >
          {loading ? "正在刷新…" : "手动刷新"}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading && !snapshot ? (
        <p className="py-10 text-center text-sm text-stone-500">正在向 {device.device_name} 获取文件列表…</p>
      ) : snapshot?.files.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-10 text-center">
          <p className="text-sm font-medium text-stone-700">{device.device_name} 的本地库是空的。</p>
          <p className="mt-1 text-xs text-stone-500">这台电脑在线，但最近一次列表里没有文件。</p>
        </div>
      ) : snapshot ? (
        <div className="space-y-2">
          {snapshot.files.map((file, index) => {
            const cloudCopy = cloudReferenceForLocalFile(file, cloudItems);
            return (
              <article
                key={`${file.name}:${file.bytes}:${index}`}
                className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
              >
                <span aria-hidden="true" className="text-lg">📄</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{file.name}</p>
                  <p className="text-xs text-stone-500">{file.kind} · {formatBytes(file.bytes)}</p>
                </div>
                {cloudCopy && (
                  <a
                    href={cloudCopy.href || `#cloud-library-${encodeURIComponent(cloudCopy.id)}`}
                    onClick={(event) => {
                      if (onOpenCloudItem) event.preventDefault();
                      onOpenCloudItem?.(cloudCopy.id);
                    }}
                    className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                  >
                    云端库的副本
                  </a>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-10 text-center">
          <p className="text-sm text-stone-600">还没有获取过这台电脑的本地库列表。</p>
          <p className="mt-1 text-xs text-stone-500">点“手动刷新”后会下发一个 fs.list 任务。</p>
        </div>
      )}

      <p className="rounded-xl bg-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-600">
        本地文件的内容不会上传，预览需要在 {device.device_name} 上打开。
      </p>
    </section>
  );
}

/** Cloud/local partition shell. The first render is always the cloud library. */
export function LibraryScope({
  children,
  className = "",
  devices: controlledDevices,
  snapshots: controlledSnapshots,
  cloudItems = [],
  listDevices = defaultLibraryScopeAdapter.listDevices,
  refreshLocalLibrary = defaultLibraryScopeAdapter.refreshLocalLibrary,
  now = Date.now,
  onOpenCloudItem,
}: LibraryScopeProps) {
  const [activeScope, setActiveScope] = useState<LibraryScopeId>("cloud");
  const [loadedDevices, setLoadedDevices] = useState<readonly LibraryDevice[]>([]);
  const [loadedSnapshots, setLoadedSnapshots] = useState<Record<string, LocalLibrarySnapshot>>({});
  const [loadingDeviceId, setLoadingDeviceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const devices = controlledDevices ?? loadedDevices;
  const snapshots = controlledSnapshots ?? loadedSnapshots;

  useEffect(() => {
    if (controlledDevices !== undefined || !listDevices) return;
    let active = true;
    listDevices()
      .then((next) => {
        if (active) setLoadedDevices(next);
      })
      .catch(() => {
        if (active) setLoadedDevices([]);
      });
    return () => {
      active = false;
    };
  }, [controlledDevices, listDevices]);

  useEffect(() => {
    const selectedId = deviceIdFromScope(activeScope);
    if (selectedId && !devices.some((device) => device.device_id === selectedId)) {
      setActiveScope("cloud");
    }
  }, [activeScope, devices]);

  const selectedDeviceId = deviceIdFromScope(activeScope);
  const selectedDevice = useMemo(
    () => devices.find((device) => device.device_id === selectedDeviceId),
    [devices, selectedDeviceId],
  );

  const refresh = useCallback(
    async (device: LibraryDevice) => {
      if (!refreshLocalLibrary || !device.online) return;
      setLoadingDeviceId(device.device_id);
      setErrors((current) => ({ ...current, [device.device_id]: "" }));
      try {
        const next = await refreshLocalLibrary(device);
        if (controlledSnapshots === undefined) {
          setLoadedSnapshots((current) => ({
            ...current,
            [device.device_id]: next,
          }));
        }
      } catch (caught) {
        setErrors((current) => ({
          ...current,
          [device.device_id]:
            caught instanceof Error
              ? caught.message
              : "本地库刷新失败，请稍后重试。",
        }));
      } finally {
        setLoadingDeviceId(null);
      }
    },
    [controlledSnapshots, refreshLocalLibrary],
  );

  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`} data-library-scope={activeScope}>
      <nav aria-label="库位置" className="mb-4 flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 p-2">
        <button
          type="button"
          aria-pressed={activeScope === "cloud"}
          onClick={() => setActiveScope("cloud")}
          className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
            activeScope === "cloud"
              ? "bg-white text-stone-900 shadow-sm"
              : "text-stone-600 hover:bg-white/70"
          }`}
        >
          云端库
        </button>
        {devices.map((device) => {
          const scope = deviceScope(device.device_id);
          return (
            <button
              key={device.device_id}
              type="button"
              aria-pressed={activeScope === scope}
              onClick={() => setActiveScope(scope)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                activeScope === scope
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-600 hover:bg-white/70"
              }`}
            >
              {device.device_name} · 本地库
              {!device.online && <span className="ml-1 text-xs text-amber-700">（离线）</span>}
            </button>
          );
        })}
        {devices.length === 0 && (
          <button
            type="button"
            aria-pressed={activeScope === "local-empty"}
            onClick={() => setActiveScope("local-empty")}
            className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeScope === "local-empty"
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-600 hover:bg-white/70"
            }`}
          >
            本地库
          </button>
        )}
      </nav>

      <div className="min-h-0 flex-1">
        {activeScope === "cloud" ? (
          <div className="flex h-full min-h-0 flex-col" data-library-state="cloud">
            <div className="mb-3 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800">
              云端库保存在 OceanLeo 服务器上；关机也在，换电脑也在，并且可以分享。
            </div>
            <div className="min-h-0 flex-1">{children}</div>
          </div>
        ) : activeScope === "local-empty" ? (
          <div data-library-state="no-device" className="rounded-2xl border border-stone-200 bg-stone-50 px-5 py-10 text-center">
            <p className="text-sm font-medium text-stone-800">还没有连接任何电脑。</p>
            <p className="mt-1 text-xs text-stone-500">本地库属于某一台电脑；连接后，每台电脑会分别显示自己的本地库。</p>
          </div>
        ) : selectedDevice ? (
          <LocalLibraryPanel
            device={selectedDevice}
            snapshot={snapshots[selectedDevice.device_id]}
            loading={loadingDeviceId === selectedDevice.device_id}
            error={errors[selectedDevice.device_id]}
            cloudItems={cloudItems}
            now={now()}
            canRefresh={Boolean(refreshLocalLibrary)}
            onRefresh={() => void refresh(selectedDevice)}
            onOpenCloudItem={(itemId) => {
              setActiveScope("cloud");
              onOpenCloudItem?.(itemId);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
