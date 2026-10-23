"use client";

import { useUI } from "../../i18n/ui/useUI";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";

/** Scene-wide settings stay in the Scene drawer, not on an invented selection. */
export function Model3DViewControls({ editor: e, readOnly }: { editor: Model3DWorkbenchState; readOnly: boolean }) {
  const tt = useUI();
  const number = (id: string, label: string, value: number, apply: (value: number) => void, min: number, max: number, step = 0.1, viewOnly = false) => (
    <label className="grid grid-cols-2 items-center gap-2 text-[11px]" key={id}>
      <span>{label}</span><input aria-label={label} type="number" min={min} max={max} step={step} value={value}
        disabled={readOnly && !viewOnly} className="min-w-0 rounded border border-[var(--border)] bg-[var(--surface)] p-1"
        onChange={(event) => { const value = event.currentTarget.valueAsNumber; if (Number.isFinite(value)) apply(Math.max(min, Math.min(max, value))); }} />
    </label>
  );
  const toggle = (label: string, value: boolean, apply: (value: boolean) => void, viewOnly = false) => (
    <label className="flex items-center justify-between text-[11px]" key={label}>{label}<input aria-label={label} type="checkbox" checked={value}
      disabled={readOnly && !viewOnly} onChange={(event) => apply(event.currentTarget.checked)} /></label>
  );
  return <section data-model3d-scene-view className="space-y-2 text-[var(--fg)]">
    <h3 className="text-[11px] font-semibold">{tt("编辑器相机")}</h3>
    {number("azimuth", tt("水平环绕"), e.azimuth, (v) => e.setOrbit(v, e.elevation), -180, 180, 1, true)}
    {number("elevation", tt("垂直环绕"), e.elevation, (v) => e.setOrbit(e.azimuth, v), 1, 179, 1, true)}
    {number("zoom", tt("镜头距离"), e.zoom, e.setZoom, 20, 500, 5, true)}
    {toggle(tt("自动旋转"), e.autoRotate, e.setAutoRotate, true)}
    <button type="button" className="text-[11px] underline" onClick={e.resetCamera}>{tt("重置相机")}</button>
    <h3 className="pt-2 text-[11px] font-semibold">{tt("环境与阴影")}</h3>
    {number("exposure", tt("曝光"), e.exposure, e.setExposure, 0.1, 4)}
    <label className="block text-[11px]">{tt("HDR 环境图地址")}<input aria-label={tt("HDR 环境图地址")} type="url" value={e.environmentUrl}
      disabled={readOnly} className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-1" onChange={(event) => e.setEnvironmentUrl(event.currentTarget.value)} /></label>
    {number("environment", tt("环境强度"), e.environmentIntensity, e.setEnvironmentIntensity, 0, 5, 0.05)}
    {toggle(tt("启用阴影"), e.shadowEnabled, e.setShadowEnabled)}
    {number("shadow", tt("阴影强度"), e.shadowIntensity, e.setShadowIntensity, 0, 2, 0.05)}
    {number("softness", tt("阴影柔和"), e.shadowSoftness, e.setShadowSoftness, 0, 1, 0.05)}
    <label className="flex justify-between text-[11px]">{tt("背景")}<input aria-label={tt("背景")} type="color" value={e.background} disabled={readOnly} onChange={(event) => e.setBackground(event.currentTarget.value)} /></label>
    {!!e.animations.length && <>
      <h3 className="pt-2 text-[11px] font-semibold">{tt("动画")}</h3>
      <select aria-label={tt("动画片段")} value={e.animationName} disabled={readOnly} className="w-full bg-[var(--surface)] text-[11px]" onChange={(event) => e.selectAnimation(event.currentTarget.value)}>
        <option value="">{tt("静止姿态")}</option>{e.animations.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      {toggle(tt("播放动画"), e.animationPlaying, e.setAnimationPlaying)}
      {number("time", tt("播放时间"), e.animationTime, e.setAnimationTime, 0, Math.max(0.001, e.animationDuration), 0.01)}
      {number("speed", tt("动画速度"), e.animationSpeed, e.setAnimationSpeed, 0.1, 4)}
    </>}
  </section>;
}
