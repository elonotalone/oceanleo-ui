"use client";

import { useEffect, useState } from "react";
import { openCanvasLibraryItem } from "./canvas-delivery-client";
import { useUI } from "../../../i18n";
import type { CanvasCommandResult } from "./command-registry";
import { canvasCompositionDocument } from "./canvas-selection-adapter";
import {
  projectHead,
  type CanvasWorkspaceView,
  type ProjectVersionComparison,
  type VideoProject,
} from "./project-model";

type DispatchCommand = (
  commandId: string,
  args?: Record<string, unknown>,
  surface?: "compact" | "toolbar" | "node-menu" | "keyboard" | "protocol" | "context-more",
) => Promise<CanvasCommandResult>;

interface ProductCommandState {
  commandId: string;
  status: string;
  message?: string;
  phase?: string;
  progress?: number;
  cancelable?: boolean;
  externalRunId?: string;
}

function EmptyState({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[var(--vc-border)] bg-[var(--vc-surface-2)] px-8 text-center">
      <div>
        <p className="text-sm font-semibold text-[var(--vc-text-2)]">{title}</p>
        <p className="mt-2 max-w-md text-[11px] leading-relaxed text-[var(--vc-text-3)]">
          {detail}
        </p>
      </div>
    </div>
  );
}

function StoryboardView({
  project,
  dispatch,
}: {
  project: VideoProject;
  dispatch: DispatchCommand;
}) {
  const tt = useUI();
  const head = projectHead(project);
  return (
    <div className="space-y-5">
      {head.scenes.map((scene) => {
        const shots = head.shots.filter((shot) => shot.sceneId === scene.sceneId)
          .sort((a, b) => scene.shotIds.indexOf(a.shotId) - scene.shotIds.indexOf(b.shotId));
        return (
          <section key={scene.sceneId} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-[var(--vc-text)]">{scene.title}</h2>
              {scene.summary && (
                <p className="mt-1 max-w-4xl text-[11px] leading-relaxed text-[var(--vc-text-3)]">
                  {scene.summary}
                </p>
              )}
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {shots.map((shot) => {
                const storyboard = head.storyboards.find(
                  (item) => item.storyboardId === shot.storyboardId,
                );
                const sourceFrame = (storyboard as typeof storyboard & {
                  frames?: Array<{ shotId?: string; note?: string }>;
                })?.frames?.find((frame) => frame.shotId === shot.shotId);
                const takes = head.takes.filter(
                  (take) => take.shotId === shot.shotId,
                );
                return (
                  <article
                    key={shot.shotId}
                    className="rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-[var(--vc-text)]">
                          {shot.title}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-[var(--vc-text-3)]">
                          {shot.description || "No shot description yet."}
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--vc-border)] px-2 py-1 text-[8px] uppercase tracking-wider text-[var(--vc-text-3)]">
                        {shot.reviewStatus || "draft"} ·{" "}
                        {shot.intendedDurationSeconds}s
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {(storyboard?.frameAssetIds || []).map((assetId) => {
                        const asset = project.assets[assetId];
                        return asset?.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={assetId}
                            src={asset.previewUrl || asset.url}
                            alt={asset.title}
                            className="aspect-video w-full rounded-lg object-cover"
                          />
                        ) : null;
                      })}
                      {!storyboard?.frameAssetIds.length && (
                        <div className="col-span-3 rounded-lg border border-dashed border-[var(--vc-border)] px-3 py-8 text-center text-[10px] text-[var(--vc-text-3)]">
                          {sourceFrame?.note || "No immutable storyboard frame."}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      {takes.map((take) => {
                        const asset = project.assets[take.assetId];
                        return (
                          <div
                            key={take.takeId}
                            className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface-2)] p-2"
                          >
                            {asset?.url ? (
                              <video
                                src={asset.url}
                                poster={asset.previewUrl}
                                preload="metadata"
                                controls
                                className="aspect-video w-28 rounded-lg bg-[var(--vc-letterbox)] object-cover"
                              />
                            ) : (
                              <div className="grid aspect-video w-28 place-items-center rounded-lg bg-[var(--vc-media)] text-[9px] text-[var(--vc-text-3)]">
                                Missing Asset
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-semibold text-[var(--vc-text-2)]">
                                {asset?.title || take.takeId}
                              </p>
                              <p className="mt-1 text-[9px] text-[var(--vc-text-3)]">
                                {take.status}
                                {take.reviewNote ? ` · ${take.reviewNote}` : ""}
                              </p>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void dispatch(
                                    "canvas.take.review",
                                    { takeId: take.takeId },
                                    "toolbar",
                                  )
                                }
                                className="rounded-md border border-[var(--vc-border)] px-2 py-1 text-[9px] text-[var(--vc-text-2)]"
                              >
                                {tt("综述")}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void dispatch(
                                    "canvas.take.approve",
                                    { takeId: take.takeId },
                                    "toolbar",
                                  )
                                }
                                className="rounded-md bg-[var(--vc-accent-strong)] px-2 py-1 text-[9px] text-[var(--vc-on-accent)]"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void dispatch(
                                    "canvas.take.reject",
                                    { takeId: take.takeId },
                                    "toolbar",
                                  )
                                }
                                className="rounded-md border border-[var(--vc-danger-border)] px-2 py-1 text-[9px] text-[var(--vc-danger)]"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {takes.length === 0 && (
                        <p className="rounded-lg bg-[var(--vc-surface-2)] px-3 py-2 text-[10px] text-[var(--vc-text-3)]">
                          No candidate Takes. Insert or generate a video Asset for
                          this Shot.
                        </p>
                      )}
                    </div>
                    <DirectorView project={project} dispatch={dispatch} shotId={shot.shotId} />
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DirectorView({
  project,
  dispatch,
  shotId,
}: {
  project: VideoProject;
  dispatch: DispatchCommand;
  shotId: string;
}) {
  const head = projectHead(project);
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {head.shots.filter((shot) => shot.shotId === shotId).map((shot) => {
        const camera = head.cameras.find(
          (candidate) => candidate.cameraId === shot.cameraId,
        );
        return (
          <article
            key={shot.shotId}
            className="rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--vc-text)]">{shot.title}</p>
                <p className="mt-1 text-[9px] text-[var(--vc-text-3)]">{shot.shotId}</p>
              </div>
              <span className="rounded-full bg-[var(--vc-surface-2)] px-2 py-1 text-[9px] text-[var(--vc-plan)]">
                {camera?.planStatus || "no plan"}
              </span>
            </div>
            {camera ? (
              <dl className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                <div className="rounded-lg bg-[var(--vc-surface-2)] p-2">
                  <dt className="text-[var(--vc-text-3)]">Lens</dt>
                  <dd className="mt-1 text-[var(--vc-text-2)]">
                    {(camera as typeof camera & { lens?: string }).lens ||
                      `${camera.lensMillimeters ?? "—"} mm · ${camera.fieldOfViewDegrees ?? "—"}°`}
                  </dd>
                </div>
                <div className="rounded-lg bg-[var(--vc-surface-2)] p-2">
                  <dt className="text-[var(--vc-text-3)]">Safe area</dt>
                  <dd className="mt-1 text-[var(--vc-text-2)]">
                    {camera.safeArea || (camera as typeof camera & { framing?: string }).framing || "—"}
                  </dd>
                </div>
                <div className="col-span-2 rounded-lg bg-[var(--vc-surface-2)] p-2">
                  <dt className="text-[var(--vc-text-3)]">Camera path</dt>
                  <dd className="mt-1 text-[var(--vc-text-2)]">
                    {camera.pathKeyframes.length
                      ? `${camera.pathKeyframes.length} keyframes · ${camera.pathKeyframes[0]?.position.join(", ")} → ${camera.pathKeyframes.at(-1)?.position.join(", ")}`
                      : (camera as typeof camera & { move?: string }).move || "No spatial path"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-[var(--vc-border)] p-5 text-center text-[10px] text-[var(--vc-text-3)]">
                Create a camera plan for this shot.
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  "canvas.director.camera-plan.create",
                  { shotId: shot.shotId },
                  "toolbar",
                )
              }
              className="mt-3 w-full rounded-lg bg-[var(--vc-plan-strong)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-on-accent)]"
            >
              {camera ? "Add alternate camera plan" : "Create camera plan"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function TimelineView({ project, dispatch, commandState, cancelActiveCommand }: {
  project: VideoProject; dispatch: DispatchCommand; commandState?: ProductCommandState | null;
  cancelActiveCommand: () => boolean;
}) {
  const tt = useUI();
  const [openHandoff, setOpenHandoff] = useState(false);
  let composition: ReturnType<typeof canvasCompositionDocument> | null = null;
  let compositionError = "";
  try { composition = canvasCompositionDocument(project); } catch (error) { compositionError = error instanceof Error ? error.message : "请先在分镜中批准视频候选。"; }
  const rendering = commandState?.commandId === "canvas.timeline.final-render" && commandState.status === "pending";
  const handingOff = commandState?.commandId === "canvas.timeline.handoff" && commandState.status === "pending";
  const busy = rendering || handingOff;
  const receipt = Object.values(project.operationReceipts || {})
    .filter((item) => item?.commandId === "canvas.timeline.final-render" && typeof item.completedAt === "string" && Array.isArray(item.outputAssetIds))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];
  const finalAsset = receipt?.outputAssetIds.map((id) => project.assets[id]).find(Boolean);
  const handoff = project.timelineHandoff;
  const nodes = projectHead(project).graph.nodes;
  const delivery = nodes.find((node) => node.kind === "delivery");
  const configure = (nodeId: string, field: string, value: unknown) => void dispatch("canvas.timeline.configure", { nodeId, field, value }, "toolbar");
  useEffect(() => {
    if (!openHandoff || !handoff) return;
    setOpenHandoff(false);
    // Persist the link back to this canvas before leaving its editor.
    void dispatch("canvas.project.save", {}, "toolbar").then((result) => {
      if (result.status === "succeeded") openCanvasLibraryItem(handoff);
    });
  }, [openHandoff, handoff, dispatch]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--vc-text)]">{tt("合成与交付")}</p>
          <p className="mt-1 text-[10px] text-[var(--vc-text-3)]">{tt("按分镜顺序合成已批准的镜头，包含字幕与音轨。")}</p>
          {composition && <p className="mt-1 text-[10px] text-[var(--vc-text-3)]">{composition.document.width} × {composition.document.height} · {composition.document.fps} fps</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-command-id="canvas.timeline.final-render" disabled={!composition || busy}
            onClick={() => void dispatch("canvas.timeline.final-render", {}, "toolbar")}
            className="rounded-lg bg-[var(--vc-accent-strong)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:opacity-40">
            {tt(rendering ? "正在生成成片…" : "生成成片")}
          </button>
          <button type="button" data-command-id="canvas.timeline.handoff" disabled={!composition || busy}
            onClick={() => void dispatch("canvas.timeline.handoff", {}, "toolbar").then((result) => {
              if (result.status === "succeeded") setOpenHandoff(true);
            })}
            className="rounded-lg border border-[var(--vc-border)] px-3 py-2 text-[10px] text-[var(--vc-text-2)] disabled:opacity-40">
            {tt(handingOff ? "正在交接…" : "在时间线里精修")}
          </button>
          {rendering && commandState?.cancelable && <button type="button" onClick={() => cancelActiveCommand()}
            className="rounded-lg border border-[var(--vc-danger-border)] px-3 py-2 text-[10px] text-[var(--vc-danger)]">{tt("取消渲染")}</button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border border-[var(--vc-border)] p-3">
        {(["width", "height", "fps"] as const).map((field) => <label key={field} className="text-[10px] text-[var(--vc-text-2)]">
          {tt(field === "width" ? "宽度" : field === "height" ? "高度" : "帧率")}
          <input type="number" key={`${delivery?.nodeId}:${composition?.document[field]}`} min={field === "fps" ? 1 : 16} max={field === "fps" ? 60 : 3840}
            defaultValue={composition?.document[field] || (field === "width" ? 1920 : field === "height" ? 1080 : 30)}
            onBlur={(event) => configure(delivery?.nodeId || "", field, Number(event.currentTarget.value))}
            className="ml-2 w-20 rounded border border-[var(--vc-border)] bg-[var(--vc-surface)] p-1" />
        </label>)}
        <label className="text-[10px] text-[var(--vc-text-2)]">{tt("比例")}
          <select aria-label={tt("比例")} defaultValue={String((delivery as typeof delivery & { params?: Record<string, unknown> })?.params?.ratio || delivery?.ratio || "16:9")}
            onChange={(event) => configure(delivery?.nodeId || "", "ratio", event.currentTarget.value)}
            className="ml-2 rounded border border-[var(--vc-border)] bg-[var(--vc-surface)] p-1">
            <option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option>
          </select>
        </label>
      </div>
      {nodes.filter((node) => node.kind === "audio" || node.kind === "subtitle").map((node) => {
        const params = (node as typeof node & { params?: Record<string, unknown> }).params || {};
        return <div key={node.nodeId} className="flex flex-wrap gap-3 rounded-xl border border-[var(--vc-border)] p-3 text-[10px] text-[var(--vc-text-2)]">
          <span>{node.title}</span>
          {(node.kind === "audio" ? ["startMs", "durationMs", "volume"] : ["startMs", "durationMs"]).map((field) => <label key={field}>
            {tt(field === "startMs" ? "起点（毫秒）" : field === "durationMs" ? "时长（毫秒）" : "音量")}
            <input type="number" min={0} step={field === "volume" ? 0.1 : 100} max={field === "volume" ? 2 : 1800000}
              defaultValue={Number(params[field] ?? (field === "volume" ? 1 : field === "startMs" ? 0 : (node.durationSeconds || 3) * 1000))}
              onBlur={(event) => configure(node.nodeId, field, Number(event.currentTarget.value))}
              className="ml-2 w-24 rounded border border-[var(--vc-border)] bg-[var(--vc-surface)] p-1" />
          </label>)}
        </div>;
      })}
      <p className="text-[10px] text-[var(--vc-text-3)]">{tt("渲染期间若网关重启，未完成的渲染会取消并退款；已交付的成片保留在我的库。")}</p>
      {handoff && <button type="button" onClick={() => openCanvasLibraryItem(handoff)}
        className="text-xs text-[var(--vc-accent-text)] underline">{tt("打开时间线工程")}</button>}
      {commandState && (rendering || handingOff || commandState.commandId.startsWith("canvas.timeline.")) &&
        <p role="status" className="text-xs text-[var(--vc-text-2)]">{tt(commandState.message || (rendering ? "正在生成成片…" : "正在交接…"))}</p>}
      {finalAsset?.url && <article className="grid gap-4 rounded-2xl border border-[var(--vc-accent-border)] bg-[var(--vc-surface)] p-4 lg:grid-cols-2">
        <video src={finalAsset.url} controls preload="metadata" className="w-full rounded-xl bg-[var(--vc-letterbox)] object-contain" />
        <div className="space-y-3">
          <p className="text-xs font-semibold text-[var(--vc-text)]">{tt("已交付成片")}</p>
          <p className="text-[10px] text-[var(--vc-text-3)]">{tt("成片已保存到我的库，来源镜头和工程版本已记录。")}</p>
          {finalAsset.libraryItem && <button type="button" onClick={() => openCanvasLibraryItem(finalAsset.libraryItem!)}
            className="text-xs text-[var(--vc-accent-text)] underline">{tt("在我的库打开")}</button>}
        </div>
      </article>}
      {composition ? composition.document.tracks.map((track) => <section key={track.id}
        className="space-y-2 rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-3">
        <h3 className="text-xs text-[var(--vc-text)]">{tt(track.kind === "video" ? "视频轨" : track.kind === "audio" ? "音轨" : "字幕轨")}</h3>
        {track.clips.map((clip) => <div key={clip.id} className="rounded-lg bg-[var(--vc-surface-2)] p-2 text-[10px] text-[var(--vc-text-2)]">
          {clip.label || clip.text} · {(clip.start_ms / 1000).toFixed(1)}–{((clip.start_ms + clip.duration_ms) / 1000).toFixed(1)} s
          {clip.text && <p style={{ fontSize: clip.style?.font_size, color: clip.style?.color,
            backgroundColor: clip.style?.background, fontWeight: clip.style?.bold ? "bold" : "normal",
            textAlign: clip.style?.align, whiteSpace: "pre-wrap" }}>{clip.text}</p>}
        </div>)}
      </section>) : <EmptyState title={tt("还没有可合成的镜头")} detail={`${tt(compositionError)} ${tt("先在分镜中批准视频候选，再生成成片或交接到时间线。回到画布可调整字幕、音轨和成片规格。")}`} />}
    </div>
  );
}

function HistoryView({
  project,
  comparison,
  dispatch,
}: {
  project: VideoProject;
  comparison: ProjectVersionComparison | null;
  dispatch: DispatchCommand;
}) {
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const restore = async (versionId: string) => {
    setRestoring(true);
    try {
      const result = await dispatch("canvas.project.version.restore", { versionId }, "toolbar");
      if (result.status !== "succeeded") { setMessage(result.message); return; }
      const saved = await dispatch("canvas.project.save", {}, "toolbar");
      setMessage(saved.status === "succeeded" ? "Restored version saved." : saved.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save restored version."); }
    finally { setRestoring(false); }
  };
  const versions = Object.values(project.versions).sort(
    (left, right) => right.revision - left.revision,
  );
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-2">
        {versions.map((version) => (
          <article
            key={version.versionId}
            className={`rounded-xl border p-3 ${
              version.versionId === project.headVersionId
                ? "border-[var(--vc-accent-border)] bg-[var(--vc-accent-soft)]"
                : "border-[var(--vc-border)] bg-[var(--vc-surface-2)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-semibold text-[var(--vc-text-2)]">
                r{version.revision} · {version.reason}
              </p>
              <time className="text-[8px] text-[var(--vc-text-3)]">
                {new Date(version.createdAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-1 truncate font-mono text-[8px] text-[var(--vc-text-3)]">
              {version.versionId}
            </p>
            {version.versionId !== project.headVersionId && <button type="button" disabled={restoring}
              data-restore-version={version.versionId} onClick={() => void restore(version.versionId)}
              className="mt-2 rounded-lg border border-[var(--vc-border)] px-3 py-1.5 text-[10px] text-[var(--vc-text-2)] disabled:opacity-40">
              Restore this version
            </button>}
          </article>
        ))}
      </div>
      <aside className="h-fit rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4">
        <h2 className="text-xs font-semibold text-[var(--vc-text)]">Previous → current</h2>
        {comparison ? (
          <dl className="mt-3 space-y-2 text-[10px]">
            {[
              ["Added nodes", comparison.addedNodeIds.length],
              ["Removed nodes", comparison.removedNodeIds.length],
              ["Changed nodes", comparison.changedNodeIds.length],
              ["New attached Assets", comparison.addedAssetIds.length],
              ["New Takes", comparison.addedTakeIds.length],
              ["Review changes", comparison.reviewChanges.length],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-lg bg-[var(--vc-surface-2)] px-3 py-2"
              >
                <dt className="text-[var(--vc-text-3)]">{label}</dt>
                <dd className="font-mono text-[var(--vc-text-2)]">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-[10px] text-[var(--vc-text-3)]">
            The first immutable version has no predecessor.
          </p>
        )}
        <p className="mt-4 text-[9px] leading-relaxed text-[var(--vc-text-3)]">
          Restore creates and saves a new revision. Earlier versions and their assets stay in history.
        </p>
        {message && <p role="status" className="mt-2 text-[10px] text-[var(--vc-text-2)]">{message}</p>}
      </aside>
    </div>
  );
}

export function CanvasProductView({
  view,
  project,
  comparison,
  dispatch,
  commandState,
  cancelActiveCommand,
}: {
  view: Exclude<CanvasWorkspaceView, "graph">;
  project: VideoProject;
  comparison: ProjectVersionComparison | null;
  dispatch: DispatchCommand;
  commandState?: ProductCommandState | null;
  cancelActiveCommand: () => boolean;
}) {
  const head = projectHead(project);
  const qc = head.continuityQc || { status: "not-checked", issues: [] };
  return (
    <section
      data-canvas-product-view={view}
      className="absolute inset-0 z-20 overflow-y-auto bg-[var(--vc-canvas)] px-5 pb-20 pt-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4">
          <div>
            <p className="text-xs font-semibold capitalize text-[var(--vc-text)]">{view}</p>
            <p className="mt-1 font-mono text-[8px] text-[var(--vc-text-3)]">
              Project head {project.headVersionId} · r{head.revision}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              data-continuity-status={qc.status}
              className={`rounded-full border px-3 py-1.5 text-[9px] ${
                qc.status === "pass"
                  ? "border-[var(--vc-accent-border)] text-[var(--vc-accent-text)]"
                  : qc.status === "blocked"
                    ? "border-[var(--vc-danger-border)] text-[var(--vc-danger)]"
                    : "border-[var(--vc-warn-border)] text-[var(--vc-warn)]"
              }`}
              title={qc.issues.map((issue) => issue.message).join("\n")}
            >
              Continuity QC · {qc.status} · {qc.issues.length}
            </span>
            <button
              type="button"
              onClick={() =>
                void dispatch(
                  "canvas.project.continuity-qc.check",
                  {},
                  "toolbar",
                )
              }
              className="rounded-lg border border-[var(--vc-border)] px-3 py-1.5 text-[9px] text-[var(--vc-text-2)] hover:bg-[var(--vc-hover)]"
            >
              Check continuity
            </button>
          </div>
        </div>
        {view === "storyboard" || view === "director" ? (
          <StoryboardView project={project} dispatch={dispatch} />
        ) : view === "timeline" ? (
          <TimelineView
            project={project}
            dispatch={dispatch}
            commandState={commandState}
            cancelActiveCommand={cancelActiveCommand}
          />
        ) : (
          <HistoryView project={project} comparison={comparison} dispatch={dispatch} />
        )}
      </div>
    </section>
  );
}
