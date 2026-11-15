"use client";

import { useUI } from "../../../i18n";
import type { CanvasCommandResult } from "./command-registry";
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
        const shots = head.shots.filter((shot) => shot.sceneId === scene.sceneId);
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
}: {
  project: VideoProject;
  dispatch: DispatchCommand;
}) {
  const head = projectHead(project);
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {head.shots.map((shot) => {
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
                No camera is fabricated. Create a real editable plan.
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

function TimelineView({
  project,
  dispatch,
  commandState,
  cancelActiveCommand,
}: {
  project: VideoProject;
  dispatch: DispatchCommand;
  commandState?: ProductCommandState | null;
  cancelActiveCommand: () => boolean;
}) {
  const tt = useUI();
  const head = projectHead(project);
  const timeline = head.timelines[0];
  const clips = timeline
    ? timeline.clipIds
        .map((clipId) => head.clips.find((clip) => clip.clipId === clipId))
        .filter((clip): clip is NonNullable<typeof clip> => Boolean(clip))
    : [];
  const canBuild = head.takes.some((take) => take.status === "approved");
  const canRender =
    clips.length > 0 &&
    clips.every((clip) => {
      const asset = project.assets[clip.assetId];
      return asset?.kind === "video" && Boolean(asset.url);
    });
  const rendering =
    commandState?.commandId === "canvas.timeline.final-render" &&
    commandState.status === "pending";
  const latestReceipt = Object.values(project.operationReceipts || {})
    .filter((receipt) => receipt.commandId === "canvas.timeline.final-render")
    .sort((left, right) =>
      right.completedAt.localeCompare(left.completedAt),
    )[0];
  const finalAsset = latestReceipt?.outputAssetIds
    .map((assetId) => project.assets[assetId])
    .find(Boolean);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--vc-text)]">
            {timeline?.title || "Main timeline"}
          </p>
          <p className="mt-1 text-[10px] text-[var(--vc-text-3)]">
            Composite order is derived only from approved Takes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canBuild}
            title={
              canBuild
                ? "Create real clip records from approved Takes."
                : "Approve at least one Take first."
            }
            onClick={() =>
              void dispatch("canvas.timeline.build-approved", {}, "toolbar")
            }
            className="rounded-lg border border-[var(--vc-accent-border)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-accent-text)] disabled:border-[var(--vc-border)] disabled:text-[var(--vc-text-3)]"
          >
            Build from approved Takes
          </button>
          <button
            type="button"
            data-command-id="canvas.timeline.final-render"
            disabled={!canRender || rendering}
            title={
              canRender
                ? "OceanLeo timeline renderer · oceanleo-convert · metered · idempotent receipt"
                : "Build a Timeline with durable Video Asset URLs first."
            }
            onClick={() =>
              void dispatch("canvas.timeline.final-render", {}, "toolbar")
            }
            className="rounded-lg bg-[var(--vc-accent-strong)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-on-accent)] disabled:bg-[var(--vc-surface-2)] disabled:text-[var(--vc-text-3)]"
          >
            {rendering ? "Rendering…" : "Final Render"}
          </button>
          {rendering && commandState.cancelable && (
            <button
              type="button"
              onClick={() => cancelActiveCommand()}
              className="rounded-lg border border-[var(--vc-danger-border)] px-3 py-2 text-[10px] font-semibold text-[var(--vc-danger)]"
            >
              Cancel render
            </button>
          )}
        </div>
      </div>
      {rendering && (
        <div
          role="status"
          aria-label="Final Render progress"
          className="rounded-xl border border-[var(--vc-accent-border)] bg-[var(--vc-accent-soft)] p-3 text-[10px] text-[var(--vc-text)]"
        >
          <div className="flex items-center justify-between gap-3">
            <span>
              {commandState.phase || "validating"} ·{" "}
              {Math.round((commandState.progress || 0) * 100)}%
            </span>
            <span className="font-mono text-[8px] text-[var(--vc-accent-text)]">
              {commandState.externalRunId || "admitting durable job"}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--vc-surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--vc-accent)] transition-[width]"
              style={{
                width: `${Math.max(
                  0,
                  Math.min(100, (commandState.progress || 0) * 100),
                )}%`,
              }}
            />
          </div>
          {commandState.message && (
            <p className="mt-2 text-[var(--vc-accent-text)]">{commandState.message}</p>
          )}
        </div>
      )}
      {latestReceipt && finalAsset?.url && (
        <article className="grid gap-4 rounded-2xl border border-[var(--vc-accent-border)] bg-[var(--vc-surface)] p-4 lg:grid-cols-[minmax(0,36rem)_1fr]">
          <video
            src={finalAsset.url}
            controls
            preload="metadata"
            className="aspect-video w-full rounded-xl bg-[var(--vc-letterbox)] object-contain"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--vc-text)]">
              Latest immutable Final Render
            </p>
            <p className="mt-2 break-all font-mono text-[8px] text-[var(--vc-text-3)]">
              Receipt {latestReceipt.receiptId}
            </p>
            <dl className="mt-3 grid gap-2 text-[9px]">
              <div className="rounded-lg bg-[var(--vc-surface-2)] p-2">
                <dt className="text-[var(--vc-text-3)]">Provider / model</dt>
                <dd className="mt-1 text-[var(--vc-text-2)]">
                  {latestReceipt.provider} · {latestReceipt.model}
                </dd>
              </div>
              <div className="rounded-lg bg-[var(--vc-surface-2)] p-2">
                <dt className="text-[var(--vc-text-3)]">{tt("价格")}</dt>
                <dd className="mt-1 text-[var(--vc-text-2)]">
                  {latestReceipt.pricing.label}
                </dd>
              </div>
              <div className="rounded-lg bg-[var(--vc-surface-2)] p-2">
                <dt className="text-[var(--vc-text-3)]">Lineage</dt>
                <dd className="mt-1 text-[var(--vc-text-2)]">
                  {latestReceipt.inputAssetIds.length} input Assets →{" "}
                  {latestReceipt.outputAssetIds.length} output Asset
                </dd>
              </div>
            </dl>
          </div>
        </article>
      )}
      {clips.length ? (
        <div className="overflow-x-auto rounded-2xl border border-[var(--vc-border)] bg-[var(--vc-surface)] p-5">
          <div className="flex min-w-max items-stretch gap-2">
            {clips.map((clip) => {
              const asset = project.assets[clip.assetId];
              return (
                <article
                  key={clip.clipId}
                  data-timeline-clip-id={clip.clipId}
                  className="w-64 overflow-hidden rounded-xl border border-[var(--vc-border)] bg-[var(--vc-surface-2)]"
                >
                  {asset?.url ? (
                    <video
                      src={asset.url}
                      poster={asset.previewUrl}
                      preload="metadata"
                      controls
                      className="aspect-video w-full bg-[var(--vc-letterbox)] object-cover"
                    />
                  ) : (
                    <div className="grid aspect-video place-items-center text-[10px] text-[var(--vc-text-3)]">
                      Missing clip Asset
                    </div>
                  )}
                  <div className="p-3 text-[9px] text-[var(--vc-text-2)]">
                    <p className="truncate font-semibold text-[var(--vc-text-2)]">
                      {asset?.title || clip.clipId}
                    </p>
                    <p className="mt-1">
                      {clip.startSeconds.toFixed(1)}s →{" "}
                      {(clip.startSeconds + clip.durationSeconds).toFixed(1)}s
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Timeline clips"
          detail="Review and approve candidate Takes, then build the Timeline. This surface never fabricates preview clips."
        />
      )}
    </div>
  );
}

function HistoryView({
  project,
  comparison,
}: {
  project: VideoProject;
  comparison: ProjectVersionComparison | null;
}) {
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
          History is compare-only here. Promoting an older head requires a
          backend CAS contract; this UI does not pretend to restore it.
        </p>
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
        {view === "storyboard" ? (
          <StoryboardView project={project} dispatch={dispatch} />
        ) : view === "director" ? (
          <DirectorView project={project} dispatch={dispatch} />
        ) : view === "timeline" ? (
          <TimelineView
            project={project}
            dispatch={dispatch}
            commandState={commandState}
            cancelActiveCommand={cancelActiveCommand}
          />
        ) : (
          <HistoryView project={project} comparison={comparison} />
        )}
      </div>
    </section>
  );
}
