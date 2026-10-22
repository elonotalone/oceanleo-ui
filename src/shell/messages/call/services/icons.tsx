// 通话服务用到的几个小图标（currentColor，跟随宿主深浅色）。纯装饰：一律 aria-hidden，可读名在按钮上。

interface IconProps {
  className?: string;
}

/** 字幕（CC 方框）。 */
export function CaptionsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6" />
    </svg>
  );
}

/** 字幕已隐藏（CC 方框 + 斜杠）。 */
export function CaptionsOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M7 5h11a3 3 0 0 1 3 3v8.5M19.5 19H6a3 3 0 0 1-3-3V8a3 3 0 0 1 1.2-2.4" />
      <path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

/** 录制（实心圆点）。 */
export function RecordIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
    </svg>
  );
}

/** 停止（圆角方块）。 */
export function StopIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** 关闭（×）。 */
export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false" className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** 进行中（转圈）。 */
export function SpinnerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.2} />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}
