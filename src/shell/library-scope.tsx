"use client";

import { createContext, type ReactNode } from "react";

/** Read-only projection of GET /v1/devices used by the computer surface. */
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
 * Device facade + fs.list adapter. Kept for the computer surface
 * (`LocalActionConsole` / settings devices). Library no longer lists devices.
 */
export interface LibraryScopeAdapter {
  listDevices?: () => Promise<readonly LibraryDevice[]>;
  refreshLocalLibrary?: (
    device: LibraryDevice,
    path: string,
  ) => Promise<LocalLibrarySnapshot>;
}

/**
 * Host slot previously rendered inside a Library local-device panel.
 * Library no longer mounts that panel; computers live under Settings → 我的设备.
 */
export type LocalScopeExtraRender = (
  device: LibraryDevice | null,
  path: string,
) => ReactNode;

export interface LibraryScopeIntegration extends LibraryScopeAdapter {
  devices?: readonly LibraryDevice[];
  snapshots?: Readonly<Record<string, LocalLibrarySnapshot | undefined>>;
  cloudItems?: readonly CloudLibraryReference[];
  now?: () => number;
  onOpenCloudItem?: (itemId: string) => void;
  localScopeExtra?: LocalScopeExtraRender;
}

const LocalScopeExtraContext = createContext<LocalScopeExtraRender | undefined>(
  undefined,
);

/**
 * Kept as a public no-op-compatible wrapper so existing hosts compile.
 * Library ignores the slot; local work belongs on the devices page.
 */
export function LibraryLocalScopeProvider({
  render,
  children,
}: {
  render: LocalScopeExtraRender;
  children: ReactNode;
}) {
  return (
    <LocalScopeExtraContext.Provider value={render}>
      {children}
    </LocalScopeExtraContext.Provider>
  );
}

export interface LibraryScopeProps extends LibraryScopeIntegration {
  children: ReactNode;
  className?: string;
  /** Rendered above the library body (page title + search). */
  header?: ReactNode;
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

function normalizedFileName(name: string): string {
  return name.trim().normalize("NFKC").toLocaleLowerCase();
}

/** One account shelf. Local computers are Settings → 我的设备, not a Library tab. */
export function LibraryScope({
  children,
  className = "",
  header,
}: LibraryScopeProps) {
  return (
    <div className={`flex h-full min-h-0 flex-col ${className}`} data-library-scope="cloud">
      {header}
      <div className="min-h-0 flex-1" data-library-state="cloud">
        {children}
      </div>
    </div>
  );
}
