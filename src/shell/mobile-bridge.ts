/**
 * Native capability bridge for the OceanLeo phone shell, website side.
 *
 * The phone app does not ship a website: `capacitor.config.json` sets
 * `server.url = https://oceanleo.com`, so the page the user actually sees is
 * this site. The bundled `capacitor/webroot/` copy only serves `errorPath`,
 * i.e. the offline fallback. That is why the phone-side policy module
 * (`oceanleo-app/capacitor/webroot/mobile-runtime.mjs`) cannot light anything
 * up while the phone is online — nothing on the live site ever imported it.
 *
 * This module is that missing half. Capacitor injects its bridge into the
 * remote page, so `window.Capacitor` is reachable here; the HarmonyOS shell
 * will inject the same shape under `window.__oceanleoNative`.
 *
 * Two hard rules govern everything below.
 *
 * 1. No native host, no behaviour. In a plain desktop or mobile browser
 *    `startMobileBridge()` returns `null` before importing a single plugin or
 *    registering a single listener. Importing this module must stay free of
 *    observable effects, including during SSR where `window` does not exist.
 * 2. A phone is a remote control, never an execution device. There is no
 *    pairing, no local execution, and no call to `/v1/devices/register` here.
 *
 * The policy (degradation reasons, trusted origin, permission handling) is
 * kept verbatim in step with the phone-side module. The duplication is
 * deliberate: that side is bare ESM served from a local page with no build
 * step, this side is a TypeScript package.
 */

/** User-facing reason shown whenever a system surface cannot be used. */
export const MOBILE_DEGRADATION = Object.freeze({
  files:
    "未选择文件或系统文件选择器不可用；未读取手机文件，你仍可浏览 OceanLeo 中已有内容。",
  photos:
    "未获得相册访问权限；未读取任何照片，你可以改用系统文件选择器。",
  share:
    "没有收到可读取的分享内容；你可以回到 OceanLeo 后手动选择文件。",
  camera:
    "未获得相机权限，无法扫描；你可以改用系统文件或相册选择器。",
  notifications:
    "通知权限未开启；任务仍会继续，你可以回到 OceanLeo 查看进度。",
  deepLink:
    "此链接不属于 oceanleo.com，已在客户端内拒绝打开。",
});

export type MobileCapability = keyof typeof MOBILE_DEGRADATION;

/**
 * The only origin the client trusts. Deep links, share landings and offline
 * retries all collapse to it.
 *
 * User-generated code, sites, games and previews are served from a separate
 * untrusted content domain which is deliberately absent from this file: it is
 * never a deep-link host and never passes a trust check. It is opened in the
 * ordinary external browser instead, with no native capability attached.
 */
export const TRUSTED_ORIGIN = "https://oceanleo.com";

/** Window event the Android shell dispatches for an ACTION_SEND intent. */
export const SHARE_EVENT_NAME = "oceanleoShare";

/** Fixed first-party landing for an inbound share. */
export const SHARE_LANDING_PATH = "/?source=share";

/** Site-facing event carrying a degradation notice or a capability result. */
export const MOBILE_NOTICE_EVENT = "oceanleo:mobile-notice";

/** Site-facing event carrying content another app shared into OceanLeo. */
export const MOBILE_SHARE_EVENT = "oceanleo:mobile-share";

/** Global the site reads to decide whether native surfaces are available. */
export const MOBILE_BRIDGE_GLOBAL = "oceanleoMobile";

export type MobileResult =
  | ({ ok: true; capability?: MobileCapability } & Record<string, unknown>)
  | {
      ok: false;
      capability: MobileCapability;
      reason: string;
      message: string;
    };

export type MobileEmit = (result: MobileResult) => void;

function accepted(value: Record<string, unknown> = {}): MobileResult {
  return { ok: true, ...value } as MobileResult;
}

function declined(capability: MobileCapability, reason = "denied"): MobileResult {
  return {
    ok: false,
    capability,
    reason,
    message: MOBILE_DEGRADATION[capability],
  };
}

function isGranted(state: unknown): boolean {
  return state === "granted" || state === "limited";
}

/* ------------------------------------------------------------------ *
 * Native host detection
 * ------------------------------------------------------------------ */

export interface NativeHost {
  /** `"capacitor"` for Android/iOS, `"oceanleo"` for the HarmonyOS shell. */
  kind: "capacitor" | "oceanleo";
  /** `"android" | "ios" | "harmony"` when the shell reports it. */
  platform: string;
  /**
   * Plugin objects the shell already injected. Capacitor's injected bridge
   * exposes every installed native plugin here without any npm package, which
   * is what makes this work on a remote origin.
   */
  plugins: Record<string, unknown>;
}

type MaybeWindow = (Window & typeof globalThis) | undefined;

function currentWindow(windowRef?: MaybeWindow): MaybeWindow {
  if (windowRef) return windowRef;
  return typeof window === "undefined" ? undefined : window;
}

/**
 * Returns the native host, or `null` in every ordinary browser and during SSR.
 * This is the single gate: everything else in this module stays dormant when
 * it answers `null`.
 */
export function detectNativeHost(windowRef?: MaybeWindow): NativeHost | null {
  const win = currentWindow(windowRef) as Record<string, any> | undefined;
  if (!win) return null;

  const capacitor = win.Capacitor;
  if (capacitor && typeof capacitor.isNativePlatform === "function") {
    let native = false;
    try {
      native = capacitor.isNativePlatform() === true;
    } catch {
      native = false;
    }
    if (native) {
      return {
        kind: "capacitor",
        platform:
          typeof capacitor.getPlatform === "function"
            ? String(capacitor.getPlatform())
            : "unknown",
        plugins:
          capacitor.Plugins && typeof capacitor.Plugins === "object"
            ? capacitor.Plugins
            : {},
      };
    }
  }

  // HarmonyOS: the ArkTS `Web` component injects this shape through
  // `javaScriptProxy`, so the shell needs no Capacitor runtime.
  const oceanleo = win.__oceanleoNative;
  if (oceanleo && typeof oceanleo === "object") {
    return {
      kind: "oceanleo",
      platform:
        typeof oceanleo.platform === "string" ? oceanleo.platform : "harmony",
      plugins:
        oceanleo.plugins && typeof oceanleo.plugins === "object"
          ? oceanleo.plugins
          : {},
    };
  }

  return null;
}

/* ------------------------------------------------------------------ *
 * Plugin resolution — never a static import
 * ------------------------------------------------------------------ */

/** npm specifier and export name for the plugins this bridge can use. */
const PLUGIN_MODULES: Record<string, string> = {
  Camera: "@capacitor/camera",
  App: "@capacitor/app",
  LocalNotifications: "@capacitor/local-notifications",
  PushNotifications: "@capacitor/push-notifications",
};

export type PluginLoader = (name: string) => unknown | Promise<unknown>;

/**
 * A computed specifier, so no bundler pulls these packages into the website
 * build. The site is served to ordinary browsers where none of them exist;
 * a failed resolve degrades silently by design.
 */
async function importPluginModule(name: string): Promise<unknown> {
  const specifier = PLUGIN_MODULES[name];
  if (!specifier) return undefined;
  const module: any = await import(
    /* webpackIgnore: true */ /* @vite-ignore */ /* turbopackIgnore: true */
    specifier
  );
  return module?.[name] ?? module?.default?.[name] ?? module?.default;
}

/**
 * Resolves a plugin without ever throwing at the call site.
 *
 * Order matters: the host registry comes first because that is the only path
 * that works on a remote origin, where the page was never bundled with the
 * Capacitor npm packages. The dynamic import is the fallback for a shell that
 * serves the site from its own webroot.
 */
export async function resolvePlugin(
  name: string,
  host: NativeHost | null,
  loadPlugin?: PluginLoader,
): Promise<any> {
  if (!host) return undefined;

  if (loadPlugin) {
    try {
      const injected = await loadPlugin(name);
      if (injected) {
        const module = injected as any;
        return module?.[name] ?? module?.default?.[name] ?? module;
      }
    } catch {
      // fall through to the remaining strategies
    }
  }

  const registered = host.plugins?.[name];
  if (registered) return registered;

  try {
    return await importPluginModule(name);
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------------------ *
 * System surfaces
 * ------------------------------------------------------------------ */

interface CameraPlugin {
  checkPermissions: () => Promise<Record<string, unknown>>;
  requestPermissions: (options: {
    permissions: string[];
  }) => Promise<Record<string, unknown>>;
  pickImages: (options: Record<string, unknown>) => Promise<any>;
  getPhoto: (options: Record<string, unknown>) => Promise<any>;
}

async function requestCameraPermission(
  camera: CameraPlugin,
  permission: string,
): Promise<boolean> {
  const current = await camera.checkPermissions();
  if (isGranted(current[permission])) return true;
  const requested = await camera.requestPermissions({ permissions: [permission] });
  return isGranted(requested[permission]);
}

/**
 * The browser file input delegates to the Android/iOS document picker. The
 * native shell learns nothing until the user explicitly selects an item.
 */
export function pickFilesWithSystemPicker(
  options: { accept?: string; multiple?: boolean } = {},
  documentRef: any = typeof document === "undefined" ? undefined : document,
): Promise<MobileResult> {
  if (!documentRef?.createElement) {
    return Promise.resolve(declined("files", "picker_unavailable"));
  }

  return new Promise((resolve) => {
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = options.accept ?? "*/*";
    input.multiple = options.multiple ?? true;

    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      resolve(
        files.length > 0
          ? accepted({ capability: "files", files })
          : declined("files", "cancelled"),
      );
    };
    input.oncancel = () => resolve(declined("files", "cancelled"));

    try {
      input.click();
    } catch {
      resolve(declined("files", "picker_unavailable"));
    }
  });
}

/** System photo library. Denied permission returns the reason, never silence. */
export async function pickPhotosWithSystemPicker(
  camera: CameraPlugin,
  options: { quality?: number; limit?: number } = {},
): Promise<MobileResult> {
  try {
    if (!(await requestCameraPermission(camera, "photos"))) {
      return declined("photos");
    }
    const result = await camera.pickImages({
      quality: options.quality ?? 90,
      limit: options.limit ?? 10,
      presentationStyle: "fullscreen",
    });
    return result?.photos?.length
      ? accepted({ capability: "photos", photos: result.photos })
      : declined("photos", "cancelled");
  } catch {
    return declined("photos", "picker_failed");
  }
}

/** System camera. */
export async function scanWithSystemCamera(
  camera: CameraPlugin,
  options: { quality?: number } = {},
): Promise<MobileResult> {
  try {
    if (!(await requestCameraPermission(camera, "camera"))) {
      return declined("camera");
    }
    const photo = await camera.getPhoto({
      quality: options.quality ?? 90,
      source: "CAMERA",
      resultType: "uri",
      saveToGallery: false,
      correctOrientation: true,
      promptLabelCancel: "取消",
      promptLabelPicture: "拍照扫描",
    });
    return photo?.webPath || photo?.path
      ? accepted({ capability: "camera", photo })
      : declined("camera", "cancelled");
  } catch {
    return declined("camera", "camera_failed");
  }
}

/* ------------------------------------------------------------------ *
 * Share intake
 * ------------------------------------------------------------------ */

const SHARED_URL_SCHEMES = new Set(["file:", "content:"]);

/**
 * Native share receivers pass only user-selected handles/text in here. The
 * bridge never enumerates storage and never uploads anything by itself.
 */
export function receiveSharedContent(payload: any): MobileResult {
  const items = Array.isArray(payload?.items) ? payload.items.filter(Boolean) : [];
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  if (items.length === 0 && text.length === 0) {
    return declined("share", "empty_share");
  }
  return accepted({ capability: "share", items, text });
}

export function sharedContentLandingUrl(): string {
  return new URL(SHARE_LANDING_PATH, `${TRUSTED_ORIGIN}/`).toString();
}

export function isSharedContentUrl(rawUrl: string): boolean {
  try {
    return SHARED_URL_SCHEMES.has(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

function parseNativePayload(detail: unknown): any {
  if (typeof detail !== "string") return detail ?? {};
  try {
    return JSON.parse(detail);
  } catch {
    return { text: detail };
  }
}

/**
 * A share that carries nothing readable still reports its degradation reason,
 * so "分享进来但什么也没发生" cannot happen silently.
 *
 * Returns the disposer. Route changes must call it, otherwise every navigation
 * stacks another receiver on the same window.
 */
export function installShareReceiver({
  windowRef,
  onShared,
  emit = () => {},
}: {
  windowRef: any;
  onShared?: (result: MobileResult) => void;
  emit?: MobileEmit;
}): () => void {
  const handler = (event: any) => {
    const result = receiveSharedContent(parseNativePayload(event?.detail));
    if (result.ok && typeof onShared === "function") onShared(result);
    else emit(result.ok ? declined("share", "no_receiver") : result);
  };
  windowRef.addEventListener(SHARE_EVENT_NAME, handler);
  return () => windowRef.removeEventListener(SHARE_EVENT_NAME, handler);
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

interface NotificationPlugins {
  localNotifications: any;
  pushNotifications: any;
}

export async function enableSystemNotifications(
  { localNotifications, pushNotifications }: NotificationPlugins,
  emit: MobileEmit = () => {},
): Promise<MobileResult> {
  try {
    let localPermission = await localNotifications.checkPermissions();
    if (!isGranted(localPermission.display)) {
      localPermission = await localNotifications.requestPermissions();
    }
    if (!isGranted(localPermission.display)) return declined("notifications");

    let pushPermission = await pushNotifications.checkPermissions();
    if (!isGranted(pushPermission.receive)) {
      pushPermission = await pushNotifications.requestPermissions();
    }
    if (!isGranted(pushPermission.receive)) return declined("notifications");

    await pushNotifications.addListener("registration", ({ value }: any) => {
      emit(accepted({ capability: "notifications", token: value }));
    });
    await pushNotifications.addListener("registrationError", () => {
      emit(declined("notifications", "registration_failed"));
    });
    await pushNotifications.register();
    return accepted({ capability: "notifications", registration: "pending" });
  } catch {
    return declined("notifications", "notification_failed");
  }
}

export interface TaskNotification {
  notificationId: number;
  title: string;
  body: string;
  taskId: string;
}

export async function showTaskNotification(
  localNotifications: any,
  task: TaskNotification,
): Promise<MobileResult> {
  try {
    const permission = await localNotifications.checkPermissions();
    if (!isGranted(permission.display)) return declined("notifications");
    await localNotifications.schedule({
      notifications: [
        {
          id: task.notificationId,
          title: task.title,
          body: task.body,
          extra: { taskId: task.taskId },
        },
      ],
    });
    return accepted({ capability: "notifications" });
  } catch {
    return declined("notifications", "notification_failed");
  }
}

/* ------------------------------------------------------------------ *
 * Deep links and offline computers
 * ------------------------------------------------------------------ */

export function normalizeTrustedDeepLink(rawUrl: string): MobileResult {
  try {
    const url = new URL(rawUrl);
    if (url.origin !== TRUSTED_ORIGIN) return declined("deepLink", "untrusted_origin");
    return accepted({
      capability: "deepLink",
      path: `${url.pathname}${url.search}${url.hash}`,
    });
  } catch {
    return declined("deepLink", "invalid_url");
  }
}

/**
 * A task aimed at a computer that is offline stays aimed at that computer. It
 * is never rerouted to the cloud and never reported as finished.
 */
export function queuedDeviceTaskMessage(deviceName: string) {
  const safeName = String(deviceName || "所选设备").trim() || "所选设备";
  return {
    status: "queued" as const,
    executionTarget: "device" as const,
    retryOnCloud: false,
    message: `设备离线，任务已排队，等「${safeName}」上线。`,
  };
}

/**
 * Intentionally a no-op: a phone is a remote control and content viewer, never
 * an execution device. Pairing, task execution, interpreters and shells are
 * deliberately absent from this bridge.
 */
export function registerMobileAsExecutionDevice() {
  return Object.freeze({ registered: false, role: "remote_controller" as const });
}

/* ------------------------------------------------------------------ *
 * App lifecycle
 * ------------------------------------------------------------------ */

export async function installAppNavigation({
  app,
  historyRef,
  navigate,
  onShared,
  emit = () => {},
}: {
  app: any;
  historyRef: any;
  navigate: (path: string) => void;
  onShared?: (result: MobileResult) => void;
  emit?: MobileEmit;
}): Promise<void> {
  const open = (rawUrl: string) => {
    // iOS hands a shared document to the app as a file:// URL through the same
    // openURL path as a deep link. Routing it through the deep-link origin
    // check would reject the user's own share as an untrusted origin.
    if (isSharedContentUrl(rawUrl)) {
      const shared = receiveSharedContent({ items: [rawUrl] });
      if (shared.ok && typeof onShared === "function") onShared(shared);
      else emit(shared.ok ? declined("share", "no_receiver") : shared);
      return;
    }
    const result = normalizeTrustedDeepLink(rawUrl);
    if (result.ok) navigate(String((result as any).path));
    else emit(result);
  };

  const launch = await app.getLaunchUrl();
  if (launch?.url) open(launch.url);

  await app.addListener("appUrlOpen", ({ url }: any) => open(url));
  await app.addListener("backButton", async ({ canGoBack }: any) => {
    if (canGoBack) historyRef.back();
    else await app.exitApp();
  });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export interface MobileBridgeOptions {
  windowRef?: any;
  /** Router push from the site. Falls back to a first-party location change. */
  navigate?: (path: string) => void;
  /** Test/host injection. Production resolves through the host registry. */
  loadPlugin?: PluginLoader;
  /** Where a degradation notice or capability result goes. */
  emit?: MobileEmit;
  /** Content another app shared into OceanLeo. */
  onShared?: (result: MobileResult) => void;
}

export interface MobileBridgeHandle {
  host: NativeHost;
  /** Open the system photo library. */
  pickPhotos: (options?: { quality?: number; limit?: number }) => Promise<MobileResult>;
  /** Open the system camera. */
  scanWithCamera: (options?: { quality?: number }) => Promise<MobileResult>;
  /** Open the system document picker. */
  pickFiles: (options?: { accept?: string; multiple?: boolean }) => Promise<MobileResult>;
  /** Raise a local notification when a task finishes. */
  notifyTask: (task: TaskNotification) => Promise<MobileResult>;
  /** Removes every listener this bridge installed. */
  dispose: () => void;
}

function defaultEmit(windowRef: any): MobileEmit {
  return (result) => {
    try {
      windowRef.dispatchEvent(
        new windowRef.CustomEvent(MOBILE_NOTICE_EVENT, { detail: result }),
      );
    } catch {
      // A host without CustomEvent simply gets no notice; never throw at the
      // caller for a diagnostic channel.
    }
  };
}

/**
 * Lights up the phone's system surfaces on the live site.
 *
 * In a plain browser, and during SSR, this returns `null` having imported no
 * plugin and registered no listener. That is the load-bearing guarantee: the
 * desktop and browser experience must not change by one character.
 */
export async function startMobileBridge(
  options: MobileBridgeOptions = {},
): Promise<MobileBridgeHandle | null> {
  const windowRef = currentWindow(options.windowRef);
  if (!windowRef) return null;

  const host = detectNativeHost(windowRef);
  if (!host) return null;

  const emit = options.emit ?? defaultEmit(windowRef);
  const navigate =
    options.navigate ??
    ((path: string) => {
      (windowRef as any).location.assign(`${TRUSTED_ORIGIN}${path}`);
    });

  const onShared =
    options.onShared ??
    ((result: MobileResult) => {
      try {
        (windowRef as any).dispatchEvent(
          new (windowRef as any).CustomEvent(MOBILE_SHARE_EVENT, { detail: result }),
        );
      } catch {
        // no CustomEvent in this host
      }
      navigate(SHARE_LANDING_PATH);
    });

  const disposers: Array<() => void> = [];
  disposers.push(installShareReceiver({ windowRef, onShared, emit }));

  let cameraPromise: Promise<any> | undefined;
  const camera = () => {
    cameraPromise ??= resolvePlugin("Camera", host, options.loadPlugin);
    return cameraPromise;
  };

  let localNotificationsPromise: Promise<any> | undefined;
  const localNotifications = () => {
    localNotificationsPromise ??= resolvePlugin(
      "LocalNotifications",
      host,
      options.loadPlugin,
    );
    return localNotificationsPromise;
  };

  const app = await resolvePlugin("App", host, options.loadPlugin);
  if (app) {
    try {
      await installAppNavigation({
        app,
        historyRef: (windowRef as any).history,
        navigate,
        onShared,
        emit,
      });
    } catch {
      // A shell without the App plugin still gets pickers and notifications.
    }
  }

  const [local, push] = await Promise.all([
    localNotifications(),
    resolvePlugin("PushNotifications", host, options.loadPlugin),
  ]);
  if (local && push) {
    const result = await enableSystemNotifications(
      { localNotifications: local, pushNotifications: push },
      emit,
    );
    if (!result.ok) emit(result);
  }

  const handle: MobileBridgeHandle = {
    host,
    pickPhotos: async (pickOptions = {}) => {
      const plugin = await camera();
      if (!plugin) return declined("photos", "plugin_unavailable");
      const result = await pickPhotosWithSystemPicker(plugin, pickOptions);
      if (!result.ok) emit(result);
      return result;
    },
    scanWithCamera: async (scanOptions = {}) => {
      const plugin = await camera();
      if (!plugin) return declined("camera", "plugin_unavailable");
      const result = await scanWithSystemCamera(plugin, scanOptions);
      if (!result.ok) emit(result);
      return result;
    },
    pickFiles: (pickOptions = {}) =>
      pickFilesWithSystemPicker(pickOptions, (windowRef as any).document),
    notifyTask: async (task: TaskNotification) => {
      const plugin = await localNotifications();
      if (!plugin) return declined("notifications", "plugin_unavailable");
      const result = await showTaskNotification(plugin, task);
      if (!result.ok) emit(result);
      return result;
    },
    dispose: () => {
      while (disposers.length) disposers.pop()?.();
      if ((windowRef as any)[MOBILE_BRIDGE_GLOBAL] === handle) {
        delete (windowRef as any)[MOBILE_BRIDGE_GLOBAL];
      }
    },
  };

  // Published so site surfaces (upload buttons, task progress) can reach the
  // system picker without importing this module. Absent in every browser.
  (windowRef as any)[MOBILE_BRIDGE_GLOBAL] = handle;
  return handle;
}
