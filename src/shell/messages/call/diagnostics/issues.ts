// 通话中排障（参照 Slack 通话中的排障面板）：每条问题一句话说明 + 一个办法按钮。
// 纯函数模块：文案一律返回简体中文原文（即词典 key），由组件交给 `tt()` 翻译。
import type { CallIssue } from "../engine";
import type { NetworkHealth } from "./health";

export type IssueKind = CallIssue["kind"];

export type IssueActionKind =
  | "permission_help" // 展开「怎么在浏览器/系统设置里打开」，展开后变成「重试」
  | "retry_devices" // 重新检测设备并重试麦克风
  | "switch_mic" // 换一个麦克风（打开设备菜单）
  | "switch_device" // 换一个设备（打开设备菜单）
  | "audio_only" // 切换为仅语音
  | "check_network" // 展开「检查网络」建议
  | "reconnecting" // 正在重连（禁用）
  | "browser_help" // 展开「换浏览器」建议
  | "dismiss"; // 知道了

export type DeviceKind = "mic" | "camera" | "speaker";

export interface IssueAction {
  kind: IssueActionKind;
  label: string;
  disabled?: boolean;
  /** 设备菜单要列哪一类设备（switch_mic / switch_device）。 */
  device?: DeviceKind | "any";
}

export interface IssueDescriptor {
  /** 稳定键（kind + detail），用于「知道了」与 React key。 */
  id: string;
  kind: IssueKind;
  /** 越大越靠前。 */
  severity: number;
  text: string;
  vars?: Record<string, string | number>;
  action: IssueAction;
  /** 展开后的说明（逐条一句）；没有就不展开。 */
  help: string[];
  /** 展开说明后出现的「重试」做什么。 */
  retry?: "mic" | "camera" | "screen";
}

export type BrowserFamily = "chrome" | "edge" | "safari" | "firefox" | "other";
export type OsFamily = "mac" | "windows" | "linux" | "android" | "ios" | "other";

export interface IssueEnvironment {
  browser: BrowserFamily;
  os: OsFamily;
  /** 在 OceanLeo 桌面客户端里（权限在系统设置里给 OceanLeo，而不是给浏览器）。 */
  desktopClient: boolean;
  audioOnly: boolean;
  limits: { maxParticipants: number; maxVideo: number };
}

export function browserFamily(userAgent: string): BrowserFamily {
  const ua = userAgent || "";
  if (/\bEdg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/\bFirefox\/|\bFxiOS\//.test(ua)) return "firefox";
  if (/\bChrome\/|\bChromium\/|\bCriOS\//.test(ua)) return "chrome";
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) return "safari";
  return "other";
}

export function osFamily(userAgent: string): OsFamily {
  const ua = userAgent || "";
  if (/\b(iPhone|iPad|iPod)\b/.test(ua)) return "ios";
  if (/\bAndroid\b/.test(ua)) return "android";
  if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) return "mac";
  if (/\bWindows\b/.test(ua)) return "windows";
  if (/\bLinux\b|\bX11\b|\bCrOS\b/.test(ua)) return "linux";
  return "other";
}

const SEVERITY: Record<IssueKind, number> = {
  network_lost: 100,
  artc_unsupported: 90,
  mic_permission: 80,
  no_mic: 75,
  device_lost: 70,
  mic_silent: 60,
  camera_permission: 50,
  screen_permission: 45,
  network_poor: 40,
  call_full: 30,
  video_full: 20,
};

/** 浏览器里怎么允许麦克风/摄像头（一句）。 */
function browserPermissionStep(browser: BrowserFamily, device: "mic" | "camera"): string {
  if (browser === "chrome" || browser === "edge") {
    return device === "mic"
      ? "点地址栏左侧的网站设置图标，把「麦克风」改为「允许」，然后点「重试」。"
      : "点地址栏左侧的网站设置图标，把「摄像头」改为「允许」，然后点「重试」。";
  }
  if (browser === "safari") {
    return device === "mic"
      ? "在菜单栏选 Safari →「设置」→「网站」→「麦克风」，把本网站改为「允许」，然后点「重试」。"
      : "在菜单栏选 Safari →「设置」→「网站」→「摄像头」，把本网站改为「允许」，然后点「重试」。";
  }
  if (browser === "firefox") {
    return device === "mic"
      ? "点地址栏左侧的权限图标，去掉「已阻止麦克风」，然后点「重试」。"
      : "点地址栏左侧的权限图标，去掉「已阻止摄像头」，然后点「重试」。";
  }
  return device === "mic"
    ? "在浏览器的网站设置里允许本网站使用麦克风，然后点「重试」。"
    : "在浏览器的网站设置里允许本网站使用摄像头，然后点「重试」。";
}

/** 系统层面还要放行的那一步（Mac / Windows）；桌面客户端只看这一步。 */
function systemPermissionStep(env: IssueEnvironment, device: "mic" | "camera" | "screen"): string | null {
  if (env.os === "mac") {
    if (env.desktopClient) {
      if (device === "mic") return "在「系统设置」→「隐私与安全性」→「麦克风」里允许 OceanLeo，然后点「重试」。";
      if (device === "camera") return "在「系统设置」→「隐私与安全性」→「摄像头」里允许 OceanLeo，然后点「重试」。";
      return "在「系统设置」→「隐私与安全性」→「屏幕录制」里允许 OceanLeo，然后重新打开 OceanLeo。";
    }
    if (device === "mic") return "Mac 上还要在「系统设置」→「隐私与安全性」→「麦克风」里允许浏览器。";
    if (device === "camera") return "Mac 上还要在「系统设置」→「隐私与安全性」→「摄像头」里允许浏览器。";
    return "Mac 上还要在「系统设置」→「隐私与安全性」→「屏幕录制」里允许浏览器，然后重新打开浏览器。";
  }
  if (env.os === "windows") {
    if (device === "mic") return "Windows 上还要在「设置」→「隐私和安全性」→「麦克风」里允许应用使用麦克风。";
    if (device === "camera") return "Windows 上还要在「设置」→「隐私和安全性」→「摄像头」里允许应用使用摄像头。";
    return null;
  }
  return null;
}

function permissionHelp(env: IssueEnvironment, device: "mic" | "camera"): string[] {
  if (env.os === "ios") {
    return [
      device === "mic"
        ? "在 iPhone 或 iPad 的「设置」里找到正在用的浏览器，打开「麦克风」权限，然后点「重试」。"
        : "在 iPhone 或 iPad 的「设置」里找到正在用的浏览器，打开「摄像头」权限，然后点「重试」。",
    ];
  }
  const system = systemPermissionStep(env, device);
  if (env.desktopClient) {
    return system ? [system] : [browserPermissionStep("other", device)];
  }
  return system ? [browserPermissionStep(env.browser, device), system] : [browserPermissionStep(env.browser, device)];
}

const SCREEN_PICK_STEP = "点「重试」后，在弹出的窗口里选择要共享的屏幕或窗口，再点「共享」。";

function screenHelp(env: IssueEnvironment): string[] {
  if (env.os === "android" || env.os === "ios") return ["手机浏览器不能共享屏幕，请在电脑上共享。"];
  const steps = env.desktopClient ? [] : [SCREEN_PICK_STEP];
  const system = systemPermissionStep(env, "screen");
  if (system) steps.push(system);
  if (!steps.length) steps.push(SCREEN_PICK_STEP);
  return steps;
}

export const NETWORK_HELP: readonly string[] = [
  "靠近路由器，或者改用有线网络。",
  "暂停正在下载、上传或看视频的程序。",
  "还不行就换一个网络，比如手机热点。",
];

export const BROWSER_HELP: readonly string[] = [
  "请用最新版的 Chrome、Edge 或 Safari 打开，或者使用 OceanLeo 桌面客户端。",
];

function deviceFromDetail(detail: string | undefined): DeviceKind | null {
  const d = (detail || "").toLowerCase();
  if (/mic|audioinput|microphone/.test(d)) return "mic";
  if (/cam|video/.test(d)) return "camera";
  if (/speaker|audiooutput|output/.test(d)) return "speaker";
  return null;
}

export function issueId(issue: Pick<CallIssue, "kind" | "detail">): string {
  return issue.detail ? `${issue.kind}:${issue.detail}` : issue.kind;
}

/** 一条问题 → 一句话 + 一个办法。 */
export function describeIssue(issue: CallIssue, env: IssueEnvironment): IssueDescriptor {
  const base = { id: issueId(issue), kind: issue.kind, severity: SEVERITY[issue.kind] ?? 0 };
  switch (issue.kind) {
    case "mic_permission":
      return {
        ...base,
        text: "浏览器没有允许使用麦克风，别人听不到你。",
        action: { kind: "permission_help", label: "怎么打开" },
        help: permissionHelp(env, "mic"),
        retry: "mic",
      };
    case "camera_permission":
      return {
        ...base,
        text: "浏览器没有允许使用摄像头，别人看不到你的画面。",
        action: { kind: "permission_help", label: "怎么打开" },
        help: permissionHelp(env, "camera"),
        retry: "camera",
      };
    case "screen_permission":
      return {
        ...base,
        text: "没有获得共享屏幕的权限。",
        action: { kind: "permission_help", label: "怎么打开" },
        help: screenHelp(env),
        retry: "screen",
      };
    case "no_mic":
      return {
        ...base,
        text: "没有找到麦克风。插上耳机或麦克风后再试。",
        action: { kind: "retry_devices", label: "重新检测" },
        help: [],
      };
    case "mic_silent":
      return {
        ...base,
        text: "麦克风开着，但没有收到你的声音。",
        action: { kind: "switch_mic", label: "换一个麦克风", device: "mic" },
        help: [],
      };
    case "device_lost": {
      const device = deviceFromDetail(issue.detail);
      const text =
        device === "mic"
          ? "麦克风已断开。"
          : device === "camera"
            ? "摄像头已断开。"
            : device === "speaker"
              ? "扬声器已断开。"
              : "有设备已断开。";
      return {
        ...base,
        text,
        action: { kind: "switch_device", label: "换一个设备", device: device ?? "any" },
        help: [],
      };
    }
    case "network_poor":
      return env.audioOnly
        ? {
            ...base,
            text: "你的网络较差，声音可能会断断续续。",
            action: { kind: "check_network", label: "检查网络" },
            help: [...NETWORK_HELP],
          }
        : {
            ...base,
            text: "你的网络较差，别人可能听不清你。",
            action: { kind: "audio_only", label: "切换为仅语音" },
            help: [],
          };
    case "network_lost":
      return {
        ...base,
        text: "网络已断开，正在重连…",
        action: { kind: "reconnecting", label: "正在重连", disabled: true },
        help: [],
      };
    case "artc_unsupported":
      return {
        ...base,
        text: "这个浏览器不支持通话。",
        action: { kind: "browser_help", label: "怎么办" },
        help: [...BROWSER_HELP],
      };
    case "call_full":
      return {
        ...base,
        text: "通话已满 {n} 人，暂时进不来。",
        vars: { n: env.limits.maxParticipants },
        action: { kind: "dismiss", label: "知道了" },
        help: [],
      };
    case "video_full":
      return {
        ...base,
        text: "已有 {n} 人开着摄像头，暂时不能再开。",
        vars: { n: env.limits.maxVideo },
        action: { kind: "dismiss", label: "知道了" },
        help: [],
      };
    default: {
      const unknownKind: never = issue.kind;
      return {
        id: String(unknownKind),
        kind: unknownKind,
        severity: 0,
        text: "通话出现了问题。",
        action: { kind: "dismiss", label: "知道了" },
        help: [],
      };
    }
  }
}

/**
 * 小窗警告图标要列出的问题：引擎的 `issues` + 网络持续变差（引擎没报时补一条 network_poor）；
 * 断网时不再提示「网络差」；同一条只出现一次；按严重程度排序；已点「知道了」的不再出现。
 */
export function collectIssues(
  issues: readonly CallIssue[],
  health: Pick<NetworkHealth, "sustainedPoor">,
  env: IssueEnvironment,
  dismissed: ReadonlySet<string> = new Set(),
): IssueDescriptor[] {
  const list: CallIssue[] = [...issues];
  const hasLost = list.some((issue) => issue.kind === "network_lost");
  if (health.sustainedPoor && !hasLost && !list.some((issue) => issue.kind === "network_poor")) {
    list.push({ kind: "network_poor" });
  }
  const seen = new Set<string>();
  const out: IssueDescriptor[] = [];
  for (const issue of list) {
    if (hasLost && issue.kind === "network_poor") continue;
    const descriptor = describeIssue(issue, env);
    if (seen.has(descriptor.id) || dismissed.has(descriptor.id)) continue;
    seen.add(descriptor.id);
    out.push(descriptor);
  }
  return out.sort((a, b) => b.severity - a.severity);
}

/** 「知道了」只在问题还在时有效：问题消失后从集合里去掉，下次再出现会重新提示。 */
export function pruneDismissed(dismissed: ReadonlySet<string>, issues: readonly CallIssue[]): Set<string> {
  const live = new Set(issues.map(issueId));
  return new Set([...dismissed].filter((id) => live.has(id)));
}

/** 所有可能出现的中文原文（单测用它核对 17 种语言都有译文）。 */
export function allIssueCopy(): string[] {
  const envs: IssueEnvironment[] = [];
  for (const browser of ["chrome", "edge", "safari", "firefox", "other"] as const) {
    for (const os of ["mac", "windows", "linux", "android", "ios", "other"] as const) {
      for (const desktopClient of [false, true]) {
        for (const audioOnly of [false, true]) {
          envs.push({ browser, os, desktopClient, audioOnly, limits: { maxParticipants: 50, maxVideo: 25 } });
        }
      }
    }
  }
  const kinds = Object.keys(SEVERITY) as IssueKind[];
  const details = [undefined, "mic", "camera", "speaker"];
  const out = new Set<string>();
  for (const env of envs) {
    for (const kind of kinds) {
      for (const detail of details) {
        const d = describeIssue({ kind, detail }, env);
        out.add(d.text);
        out.add(d.action.label);
        for (const line of d.help) out.add(line);
      }
    }
  }
  return [...out];
}
