"use client";

import { useUI } from "../../i18n/ui/useUI";
import type { Model3DWorkbenchState } from "./use-model3d-workbench";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] text-stone-600">
        <span>{label}</span>
        <span className="tabular-nums text-stone-400">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-stone-800 disabled:opacity-40"
      />
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? "rounded-lg px-2 py-2 text-[11px] font-semibold text-white disabled:opacity-45"
          : "rounded-lg border border-stone-200 px-2 py-2 text-[11px] text-stone-600 hover:bg-stone-50 disabled:opacity-40"
      }
      style={primary ? { background: accent || "#4f46e5" } : undefined}
    >
      {children}
    </button>
  );
}

const BACKGROUNDS = ["#f5f5f4", "#ffffff", "#1c1917", "#0f172a", "#dbeafe"];

export function Model3DControls({
  editor,
  accent = "#4f46e5",
}: {
  editor: Model3DWorkbenchState;
  accent?: string;
}) {
  const tt = useUI();
  const busy = editor.loading || editor.capturing || editor.saving || editor.downloading;

  return (
    <div className="space-y-4 overflow-y-auto p-3">
      <section className="space-y-2">
        <p className="text-[11px] font-semibold text-stone-800">
          {tt("3D 模型")}
        </p>
        <label className="flex w-full cursor-pointer items-center justify-center rounded-lg border border-stone-200 px-2 py-2 text-[11px] text-stone-600 hover:bg-stone-50">
          {editor.sourceUrl ? tt("替换模型") : tt("导入 GLB / glTF")}
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void editor.importModel(file);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-[10px] leading-relaxed text-stone-400">
          {tt("多文件 glTF 请先打包成单文件 GLB，避免纹理或 .bin 依赖丢失。")}
        </p>
      </section>
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-stone-800">{tt("相机")}</p>
          <button
            type="button"
            disabled={!editor.modelLoaded}
            onClick={editor.resetCamera}
            className="text-[10px] text-stone-400 hover:text-stone-700 disabled:opacity-40"
          >
            {tt("重置")}
          </button>
        </div>
        <Slider
          label={tt("水平环绕")}
          value={editor.azimuth}
          min={-180}
          max={180}
          suffix="°"
          disabled={!editor.modelLoaded}
          onChange={(value) => editor.setOrbit(value, editor.elevation)}
        />
        <Slider
          label={tt("垂直环绕")}
          value={editor.elevation}
          min={0}
          max={180}
          suffix="°"
          disabled={!editor.modelLoaded}
          onChange={(value) => editor.setOrbit(editor.azimuth, value)}
        />
        <Slider
          label={tt("镜头距离")}
          value={editor.zoom}
          min={50}
          max={300}
          step={5}
          suffix="%"
          disabled={!editor.modelLoaded}
          onChange={editor.setZoom}
        />
        <button
          type="button"
          disabled={!editor.modelLoaded}
          onClick={() => editor.setAutoRotate(!editor.autoRotate)}
          className="w-full rounded-lg border px-2 py-2 text-[11px] disabled:opacity-40"
          style={
            editor.autoRotate
              ? { borderColor: accent, color: accent, background: `${accent}12` }
              : { borderColor: "#e7e5e4", color: "#57534e" }
          }
        >
          {editor.autoRotate ? tt("停止自动旋转") : tt("开启自动旋转")}
        </button>
      </section>

      <section className="space-y-2.5 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("灯光与阴影")}</p>
        <Slider
          label={tt("曝光")}
          value={editor.exposure}
          min={0.1}
          max={2}
          step={0.1}
          disabled={!editor.modelLoaded}
          onChange={editor.setExposure}
        />
        <Slider
          label={tt("阴影强度")}
          value={editor.shadowIntensity}
          min={0}
          max={2}
          step={0.1}
          disabled={!editor.modelLoaded}
          onChange={editor.setShadowIntensity}
        />
        <Slider
          label={tt("阴影柔和")}
          value={editor.shadowSoftness}
          min={0}
          max={1}
          step={0.05}
          disabled={!editor.modelLoaded}
          onChange={editor.setShadowSoftness}
        />
        <div>
          <p className="mb-1.5 text-[11px] text-stone-600">{tt("背景")}</p>
          <div className="flex items-center gap-1.5">
            {BACKGROUNDS.map((color) => (
              <button
                key={color}
                type="button"
                disabled={!editor.modelLoaded}
                aria-label={`${tt("背景")} ${color}`}
                onClick={() => editor.setBackground(color)}
                className="h-7 w-7 rounded-full border-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: color,
                  borderColor: editor.background === color ? accent : "#e7e5e4",
                }}
              />
            ))}
            <input
              type="color"
              value={editor.background}
              disabled={!editor.modelLoaded}
              onChange={(event) => editor.setBackground(event.target.value)}
              aria-label={tt("自定义背景颜色")}
              className="h-7 w-8 cursor-pointer rounded border border-stone-200 bg-white p-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            />
          </div>
        </div>
      </section>

      <section className="space-y-2 border-t border-stone-100 pt-3">
        <p className="text-[11px] font-semibold text-stone-800">{tt("动画")}</p>
        {editor.animations.length > 0 ? (
          <>
            <select
              value={editor.animationName}
              disabled={!editor.modelLoaded}
              onChange={(event) => editor.selectAnimation(event.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white px-2 py-2 text-[11px] text-stone-700 outline-none"
            >
              {editor.animations.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-1.5">
              <ActionButton
                disabled={!editor.modelLoaded || !editor.animationName}
                onClick={editor.toggleAnimation}
              >
                {editor.animationPlaying ? tt("暂停动画") : tt("播放动画")}
              </ActionButton>
              <span className="self-center text-center text-[10px] text-stone-400">
                {editor.animations.length} {tt("个动画")}
              </span>
            </div>
            <Slider
              label={tt("动画速度")}
              value={editor.animationSpeed}
              min={0.1}
              max={3}
              step={0.1}
              suffix="×"
              disabled={!editor.modelLoaded}
              onChange={editor.setAnimationSpeed}
            />
          </>
        ) : (
          <p className="text-[10px] leading-relaxed text-stone-400">
            {editor.modelLoaded ? tt("此模型不包含可播放动画") : tt("模型加载后检测动画")}
          </p>
        )}
      </section>

      <section className="space-y-1.5 border-t border-stone-100 pt-3">
        <p className="mb-2 text-[11px] font-semibold text-stone-800">{tt("截图与保存")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          <ActionButton
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.downloadScreenshot()}
          >
            {editor.capturing ? tt("截图中…") : tt("下载截图")}
          </ActionButton>
          <ActionButton
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.saveScreenshot()}
          >
            {tt("保存截图")}
          </ActionButton>
          <ActionButton
            disabled={busy || !editor.sourceUrl}
            onClick={() => void editor.downloadModel()}
          >
            {editor.downloading ? tt("下载中…") : tt("下载模型")}
          </ActionButton>
          <ActionButton
            primary
            accent={accent}
            disabled={busy || !editor.modelLoaded}
            onClick={() => void editor.saveCopy()}
          >
            {editor.saving ? tt("保存中…") : tt("保存视图副本")}
          </ActionButton>
        </div>
        {editor.savedUrl && (
          <p className="text-[10px] text-emerald-600">{tt("3D 视图副本已保存到我的库")}</p>
        )}
      </section>
    </div>
  );
}
