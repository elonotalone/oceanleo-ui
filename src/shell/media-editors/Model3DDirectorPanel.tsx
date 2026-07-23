"use client";

import { useUI } from "../../i18n/ui/useUI";
import type {
  Model3DDirectorCamera,
  Model3DVector3,
} from "./model3d-director";
import type { Model3DWorkbenchState } from "./model3d-workbench-state";

function commandId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `${prefix}-${random || Date.now().toString(36)}`;
}

function vector(values: readonly number[] | undefined): Model3DVector3 {
  return [
    Number(values?.[0] || 0),
    Number(values?.[1] || 0),
    Number(values?.[2] || 0),
  ];
}

function NumericField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-[10px] text-[var(--muted,#78716c)]">
      <span>{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded-md border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-1.5 text-[11px] text-[var(--fg,#292524)] outline-none"
      />
    </label>
  );
}

export function Model3DDirectorPanel({
  editor,
}: {
  editor: Model3DWorkbenchState;
}) {
  const tt = useUI();
  const shot =
    editor.director.shots.find(
      (entry) => entry.id === editor.director.activeShotId,
    ) || null;
  const take =
    shot?.takes.find(
      (entry) => entry.id === editor.director.activeTakeId,
    ) || null;
  const busy =
    editor.loading ||
    editor.capturing ||
    editor.saving ||
    editor.downloading ||
    editor.directing;
  const dispatchCamera = (
    patch: Partial<Model3DDirectorCamera>,
    authority: "fov" | "lens" = "fov",
  ) => {
    if (!shot) return;
    editor.dispatchDirectorCommand({
      id: "set-camera",
      shotId: shot.id,
      patch,
      authority,
    });
  };
  const addShot = () => {
    const index = editor.director.shots.length + 1;
    const last = editor.director.shots.at(-1);
    editor.dispatchDirectorCommand({
      id: "create-shot",
      shot: {
        id: commandId("shot"),
        takeId: commandId("take"),
        name: `${tt("镜头")} ${index}`,
        startMs: last ? last.startMs + last.durationMs : 0,
        durationMs: 5_000,
      },
    });
  };
  const addTake = () => {
    if (!shot) return;
    editor.dispatchDirectorCommand({
      id: "create-take",
      shotId: shot.id,
      take: {
        id: commandId("take"),
        name: `${tt("拍次")} ${shot.takes.length + 1}`,
      },
    });
  };
  const bindSelectedPose = () => {
    if (!shot || !take || !editor.selectedNode) return;
    editor.dispatchDirectorCommand({
      id: "set-pose",
      shotId: shot.id,
      takeId: take.id,
      pose: {
        id: `pose-${editor.selectedNode.id}`,
        nodeId: editor.selectedNode.id,
        nodePath: editor.selectedNode.path,
        transform: {
          position: vector(editor.selectedNode.transform.position),
          rotation: vector(editor.selectedNode.transform.rotation),
          scale: vector(editor.selectedNode.transform.scale),
        },
      },
    });
  };
  const addKeyframe = () => {
    if (!shot || !take) return;
    const previous = take.motionPath.at(-1);
    const timeMs = Math.min(
      shot.durationMs,
      previous ? previous.timeMs + 1_000 : 0,
    );
    editor.dispatchDirectorCommand({
      id: "upsert-keyframe",
      shotId: shot.id,
      takeId: take.id,
      keyframe: {
        id: commandId("keyframe"),
        timeMs,
        transform: shot.camera.transform,
        target: shot.camera.target,
        fovDegrees: shot.camera.fovDegrees,
        focalLengthMm: shot.camera.focalLengthMm,
        apertureFStop: shot.camera.apertureFStop,
        easing: "ease-in-out",
      },
    });
  };

  return (
    <section
      data-testid="model3d-director-panel"
      className="space-y-3 border-t border-[var(--border,#e7e5e4)] pt-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold text-[var(--fg,#292524)]">
            {tt("3D 导演 / Previs")}
          </p>
          <p className="mt-0.5 text-[9px] text-[var(--muted,#78716c)]">
            {editor.director.scene.id || tt("场景尚未绑定")}
          </p>
        </div>
        <button
          type="button"
          disabled={!editor.modelLoaded || busy}
          onClick={addShot}
          className="rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1 text-[10px] disabled:opacity-40"
        >
          {tt("新建镜头")}
        </button>
      </div>

      {shot && (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="space-y-1 text-[10px] text-[var(--muted,#78716c)]">
              <span>{tt("镜头")}</span>
              <select
                value={shot.id}
                onChange={(event) => {
                  const next = editor.director.shots.find(
                    (entry) => entry.id === event.target.value,
                  );
                  if (next?.takes[0]) {
                    editor.dispatchDirectorCommand({
                      id: "select-take",
                      shotId: next.id,
                      takeId: next.takes[0].id,
                    });
                  }
                }}
                className="w-full rounded-md border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-1.5"
              >
                {editor.director.shots.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[10px] text-[var(--muted,#78716c)]">
              <span>{tt("拍次")}</span>
              <select
                value={take?.id || ""}
                onChange={(event) =>
                  editor.dispatchDirectorCommand({
                    id: "select-take",
                    shotId: shot.id,
                    takeId: event.target.value,
                  })
                }
                className="w-full rounded-md border border-[var(--border,#e7e5e4)] bg-transparent px-2 py-1.5"
              >
                {shot.takes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={addTake}
            className="w-full rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[10px] disabled:opacity-40"
          >
            {tt("新建拍次")}
          </button>

          <div className="grid grid-cols-2 gap-1.5">
            <NumericField
              label="FOV °"
              value={shot.camera.fovDegrees}
              min={1}
              max={179}
              step={0.1}
              onChange={(fovDegrees) => dispatchCamera({ fovDegrees }, "fov")}
            />
            <NumericField
              label={tt("镜头 mm")}
              value={shot.camera.focalLengthMm}
              min={1}
              max={500}
              step={1}
              onChange={(focalLengthMm) =>
                dispatchCamera({ focalLengthMm }, "lens")
              }
            />
            <NumericField
              label={tt("光圈 f/")}
              value={shot.camera.apertureFStop}
              min={0.7}
              max={64}
              step={0.1}
              onChange={(apertureFStop) =>
                dispatchCamera({ apertureFStop }, "fov")
              }
            />
            <NumericField
              label={tt("对焦距离")}
              value={shot.camera.focusDistance}
              min={0.001}
              max={1_000_000}
              step={0.1}
              onChange={(focusDistance) =>
                dispatchCamera({ focusDistance }, "fov")
              }
            />
          </div>
          <label
            title={editor.directorDepthOfFieldAvailability.reason}
            className="flex items-center gap-2 text-[10px] text-[var(--fg,#292524)]"
          >
            <input
              type="checkbox"
              checked={shot.camera.depthOfFieldEnabled}
              onChange={(event) =>
                dispatchCamera(
                  { depthOfFieldEnabled: event.target.checked },
                  "fov",
                )
              }
            />
            {tt("景深预览 / Playblast")}
          </label>
          <p className="text-[9px] leading-relaxed text-[var(--muted,#78716c)]">
            {editor.directorDepthOfFieldAvailability.enabled
              ? tt("FOV、光圈与对焦距离会同步到 Three.js Bokeh 景深，并写入截图与 Playblast。GLB 仅保留相机语义，不包含栅格景深效果。")
              : `${tt("相机光圈语义会保留，但当前运行时无法渲染景深：")} ${
                  editor.directorDepthOfFieldAvailability.reason || ""
                }`}
          </p>

          <div className="grid grid-cols-2 gap-1.5">
            <NumericField
              label={tt("曝光")}
              value={shot.lighting.exposure}
              min={0.01}
              max={20}
              step={0.1}
              onChange={(exposure) =>
                editor.dispatchDirectorCommand({
                  id: "set-lighting",
                  shotId: shot.id,
                  lighting: { ...shot.lighting, exposure },
                })
              }
            />
            <NumericField
              label={tt("环境光")}
              value={shot.lighting.environmentIntensity}
              min={0}
              max={10}
              step={0.1}
              onChange={(environmentIntensity) =>
                editor.dispatchDirectorCommand({
                  id: "set-lighting",
                  shotId: shot.id,
                  lighting: { ...shot.lighting, environmentIntensity },
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={busy || !editor.selectedNode || !take}
              onClick={bindSelectedPose}
              className="rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[10px] disabled:opacity-40"
            >
              {tt("绑定当前姿态")}
            </button>
            <button
              type="button"
              disabled={busy || !take}
              onClick={addKeyframe}
              className="rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[10px] disabled:opacity-40"
            >
              {tt("添加运动关键帧")}
            </button>
          </div>
          <p className="text-[9px] text-[var(--muted,#78716c)]">
            {take
              ? `${take.poses.length} ${tt("姿态")} · ${take.motionPath.length} ${tt("关键帧")}`
              : tt("请选择拍次")}
          </p>
        </>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={busy || !editor.directorScreenshotAvailability.enabled}
          title={editor.directorScreenshotAvailability.reason}
          onClick={() => void editor.captureDirectorScreenshot()}
          className="rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[10px] disabled:opacity-40"
        >
          {tt("Previs 截图")}
        </button>
        <button
          type="button"
          disabled={busy || !editor.directorPlayblastAvailability.enabled}
          title={editor.directorPlayblastAvailability.reason}
          onClick={() => void editor.captureDirectorPlayblast()}
          className="rounded-md border border-[var(--border,#e7e5e4)] px-2 py-1.5 text-[10px] disabled:opacity-40"
        >
          Playblast
        </button>
      </div>
      {!editor.directorPlayblastAvailability.enabled && (
        <p className="text-[9px] leading-relaxed text-amber-600">
          {editor.directorPlayblastAvailability.reason}
        </p>
      )}
      {editor.directing && (
        <button
          type="button"
          onClick={editor.cancelDirectorPrevis}
          className="w-full rounded-md border border-amber-300 px-2 py-1.5 text-[10px] text-amber-700"
        >
          {tt("取消预演")}
        </button>
      )}
      {editor.directorPrevisReceipt && (
        <p
          data-testid="model3d-previs-receipt"
          className="break-all text-[9px] text-[var(--muted,#78716c)]"
        >
          {editor.directorPrevisReceipt.kind} ·{" "}
          {editor.directorPrevisReceipt.status} · r
          {editor.directorPrevisReceipt.directorRevision}
        </p>
      )}
    </section>
  );
}
