"use client";

// 通话的五个按钮（小窗与放大视图共用一套）：麦克风（带设备小箭头）、摄像头（带设备小箭头）、共享屏幕、放大/缩小、离开（红）。
// 麦克风菜单：选麦克风、选扬声器、显示字幕（W06 的本地开关）、通话检测（W14）；摄像头菜单：选摄像头、仅语音。
// 引擎动作失败（没权限、人满、取消选屏幕）由引擎写进 issues / error，W14 的警告图标负责说明，这里不重复弹。
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { callActions, useCall, type MediaDeviceLite } from "../engine";
import { CallTestMenuItem } from "../diagnostics";
import { useCaptions } from "../services";
import { CallMenu, CallMenuCheckbox, CallMenuGroup, CallMenuNote, CallMenuRadio, CallMenuSeparator } from "./CallMenu";
import {
  IconCamera,
  IconCameraOff,
  IconChevronUp,
  IconCollapse,
  IconExpand,
  IconLeave,
  IconMic,
  IconMicOff,
  IconScreenShare,
  IconScreenShareOff,
} from "./icons";
import { canShareScreen } from "./use-viewport";

export type CallControlName = "mic" | "camera" | "screen" | "expand" | "leave";
/** 五个按钮的固定顺序（tests 钉住「恰好五个」）。 */
export const CALL_CONTROL_NAMES: readonly CallControlName[] = ["mic", "camera", "screen", "expand", "leave"];

type DeviceLists = { microphones: MediaDeviceLite[]; cameras: MediaDeviceLite[]; speakers: MediaDeviceLite[] };
type MenuName = "mic" | "camera";

/** 只防未处理的拒绝：失败原因由引擎写进 issues / error。 */
export function runCallAction(action: () => Promise<unknown>): void {
  try {
    void action().catch(() => undefined);
  } catch {
    /* 同步抛出同样交给引擎 */
  }
}

/** 没选过设备时，浏览器的「默认」项（Chrome 的 deviceId 是 "default"）算选中；没有就第一项。 */
export function isCurrentDevice(device: MediaDeviceLite, current: string | null, list: readonly MediaDeviceLite[]): boolean {
  if (current) return device.deviceId === current;
  const fallback = list.find((item) => item.deviceId === "default") ?? list[0];
  return Boolean(fallback) && fallback.deviceId === device.deviceId;
}

const FOCUS_RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500";
const ROUND = `inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;
const TONE_NEUTRAL = "bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:bg-white/10 dark:text-neutral-100 dark:hover:bg-white/15";
const TONE_OFF = "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/40";
const TONE_ON = "bg-emerald-600 text-white hover:opacity-90";
const TONE_LEAVE = "bg-red-600 text-white hover:bg-red-700";
const CARET = `inline-flex shrink-0 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10 ${FOCUS_RING}`;

export interface CallControlsProps {
  mode: "dock" | "stage";
  narrow: boolean;
  /** 小窗里 = 放大，放大视图里 = 缩小。 */
  onToggleStage(): void;
  toggleRef?: RefObject<HTMLButtonElement | null>;
}

export function CallControls({ mode, narrow, onToggleStage, toggleRef }: CallControlsProps) {
  const tt = useUI();
  const call = useCall();
  const captions = useCaptions();
  const { me, phase } = call;
  const [menu, setMenu] = useState<MenuName | null>(null);
  const [devices, setDevices] = useState<DeviceLists | null>(null);
  const [deviceError, setDeviceError] = useState(false);
  const [screenSupported] = useState(canShareScreen);
  const micCaretRef = useRef<HTMLButtonElement | null>(null);
  const cameraCaretRef = useRef<HTMLButtonElement | null>(null);

  const leaving = phase === "leaving";
  const connected = phase === "connected" || phase === "reconnecting";
  const size = mode === "stage" ? "h-11 w-11" : "h-10 w-10";
  const caretSize = mode === "stage" ? "h-11 w-6" : "h-10 w-6";
  const iconSize = mode === "stage" ? 20 : 18;

  // 菜单打开时才枚举设备（标签要在拿到权限后才有名字，每次打开都重读）。
  useEffect(() => {
    if (!menu) return undefined;
    let alive = true;
    setDeviceError(false);
    callActions
      .listDevices()
      .then((lists) => {
        if (alive) setDevices(lists);
      })
      .catch(() => {
        if (alive) setDeviceError(true);
      });
    return () => {
      alive = false;
    };
  }, [menu]);

  const triggerOf = (name: MenuName) => (name === "mic" ? micCaretRef : cameraCaretRef);
  /** 选了一项：关菜单并把焦点还给小箭头（Esc 由 AnchoredPopover 自己还焦点；点外面不抢焦点）。 */
  function closeAfterSelect(name: MenuName) {
    setMenu(null);
    triggerOf(name).current?.focus();
  }

  function deviceGroup(kind: "mic" | "camera" | "speaker", label: string, list: MediaDeviceLite[] | undefined, current: string | null, owner: MenuName): ReactNode {
    if (deviceError) return <CallMenuNote>{tt("读取设备失败，请检查浏览器权限。")}</CallMenuNote>;
    if (!list) return <CallMenuNote>{tt("正在读取设备…")}</CallMenuNote>;
    if (!list.length) {
      return (
        <CallMenuGroup label={label}>
          <CallMenuNote>{tt("没有找到可用的设备")}</CallMenuNote>
        </CallMenuGroup>
      );
    }
    return (
      <CallMenuGroup label={label}>
        {list.map((device, index) => (
          <CallMenuRadio
            key={device.deviceId || `${kind}-${index}`}
            label={device.label || tt("设备 {n}", { n: index + 1 })}
            checked={isCurrentDevice(device, current, list)}
            onSelect={() => {
              runCallAction(() => callActions.selectDevice(kind, device.deviceId));
              closeAfterSelect(owner);
            }}
          />
        ))}
      </CallMenuGroup>
    );
  }

  const micLabel = me.mic ? tt("关闭麦克风") : tt("打开麦克风");
  const cameraLabel = me.camera ? tt("关闭摄像头") : tt("打开摄像头");
  const screenLabel = !screenSupported
    ? tt("共享屏幕（此浏览器不支持）")
    : me.screen
      ? tt("停止共享屏幕")
      : tt("共享屏幕");
  const toggleLabel = mode === "stage" ? tt("缩小") : tt("放大");

  return (
    <div role="group" aria-label={tt("通话控制")} data-call-controls={mode} className={`flex items-center ${narrow ? "justify-between gap-1" : "justify-center gap-1.5"}`}>
      <div className="flex items-center">
        <button
          type="button"
          data-call-control="mic"
          data-on={me.mic ? "true" : "false"}
          aria-label={micLabel}
          title={micLabel}
          disabled={leaving}
          onClick={() => runCallAction(() => callActions.setMic(!me.mic))}
          className={`${ROUND} ${size} ${me.mic ? TONE_NEUTRAL : TONE_OFF}`}
        >
          {me.mic ? <IconMic size={iconSize} /> : <IconMicOff size={iconSize} />}
        </button>
        <button
          ref={micCaretRef}
          type="button"
          data-call-caret="mic"
          aria-label={tt("麦克风设置")}
          title={tt("麦克风设置")}
          aria-haspopup="menu"
          aria-expanded={menu === "mic"}
          disabled={leaving}
          onClick={() => setMenu((current) => (current === "mic" ? null : "mic"))}
          className={`${CARET} ${caretSize}`}
        >
          <IconChevronUp size={14} />
        </button>
      </div>

      <div className="flex items-center">
        <button
          type="button"
          data-call-control="camera"
          data-on={me.camera ? "true" : "false"}
          aria-label={cameraLabel}
          title={cameraLabel}
          disabled={leaving}
          onClick={() => runCallAction(() => callActions.setCamera(!me.camera))}
          className={`${ROUND} ${size} ${TONE_NEUTRAL}`}
        >
          {me.camera ? <IconCamera size={iconSize} /> : <IconCameraOff size={iconSize} />}
        </button>
        <button
          ref={cameraCaretRef}
          type="button"
          data-call-caret="camera"
          aria-label={tt("摄像头设置")}
          title={tt("摄像头设置")}
          aria-haspopup="menu"
          aria-expanded={menu === "camera"}
          disabled={leaving}
          onClick={() => setMenu((current) => (current === "camera" ? null : "camera"))}
          className={`${CARET} ${caretSize}`}
        >
          <IconChevronUp size={14} />
        </button>
      </div>

      <button
        type="button"
        data-call-control="screen"
        data-on={me.screen ? "true" : "false"}
        aria-label={screenLabel}
        title={screenLabel}
        disabled={leaving || !connected || !screenSupported}
        onClick={() => runCallAction(() => callActions.setScreenShare(!me.screen))}
        className={`${ROUND} ${size} ${me.screen ? TONE_ON : TONE_NEUTRAL}`}
      >
        {me.screen ? <IconScreenShareOff size={iconSize} /> : <IconScreenShare size={iconSize} />}
      </button>

      <button
        ref={toggleRef}
        type="button"
        data-call-control="expand"
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => onToggleStage()}
        className={`${ROUND} ${size} ${TONE_NEUTRAL}`}
      >
        {mode === "stage" ? <IconCollapse size={iconSize} /> : <IconExpand size={iconSize} />}
      </button>

      <button
        type="button"
        data-call-control="leave"
        aria-label={tt("离开通话")}
        title={tt("离开通话")}
        disabled={leaving}
        onClick={() => runCallAction(() => callActions.leave())}
        className={`${ROUND} ${mode === "stage" && !narrow ? "h-11 gap-1.5 px-4" : size} ${TONE_LEAVE}`}
      >
        <IconLeave size={iconSize} />
        {mode === "stage" && !narrow ? <span className="text-[13px] font-medium">{tt("离开")}</span> : null}
      </button>

      <CallMenu open={menu === "mic"} anchorRef={micCaretRef} onClose={() => setMenu(null)} label={tt("麦克风设置")}>
        {deviceGroup("mic", tt("麦克风"), devices?.microphones, me.micDeviceId, "mic")}
        {devices && devices.speakers.length ? (
          <>
            <CallMenuSeparator />
            {deviceGroup("speaker", tt("扬声器"), devices.speakers, me.speakerDeviceId, "mic")}
          </>
        ) : null}
        <CallMenuSeparator />
        <CallMenuCheckbox
          label={tt("显示字幕")}
          checked={!captions.hidden}
          onSelect={() => {
            captions.setHidden(!captions.hidden);
            closeAfterSelect("mic");
          }}
        />
        <CallTestMenuItem onSelect={() => setMenu(null)} />
      </CallMenu>

      <CallMenu open={menu === "camera"} anchorRef={cameraCaretRef} onClose={() => setMenu(null)} label={tt("摄像头设置")}>
        {deviceGroup("camera", tt("摄像头"), devices?.cameras, me.cameraDeviceId, "camera")}
        <CallMenuSeparator />
        <CallMenuCheckbox
          label={tt("仅语音（不接收画面）")}
          checked={me.audioOnly}
          onSelect={() => {
            runCallAction(() => callActions.setAudioOnly(!me.audioOnly));
            closeAfterSelect("camera");
          }}
        />
      </CallMenu>
    </div>
  );
}
