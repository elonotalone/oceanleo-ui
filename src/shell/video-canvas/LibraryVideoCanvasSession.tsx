"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import type { AdvancedContextToolbarHost } from "../advanced-editor-adapter";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { selectionAdapterContext } from "../selection-adapter";
import type { LibraryItem } from "../library-data";
import { useUI } from "../../i18n/ui/useUI";
import { usePluginTheme } from "../plugin-theme";
import { userEditItemKey } from "../user-edit-session";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import type { useLockedEditCollab } from "../collab/adapters/use-entity-collab";
import { useWorkbenchMaterialAdapter, type WorkbenchMaterialAdapter } from "../workbench-material-provider";
import { withEditorHistoryCommand } from "../workbench-material-command";
import { usePluginCommandSurface } from "../plugin-command";
import { pluginTargetForLibraryItem } from "../active-agent-file";
import { guardPluginSurface, viewOnlyContext } from "../collab/adapters/visual-readonly";
import { saveVideoProject } from "../workflow-carrier/video-project-save";
import { renderVideoProjectPreview } from "../workflow-carrier/video-project-preview";
import { stageVideoMaterial } from "../workflow-carrier/video-project-media-io";
import { insertVideoMaterial, pinVideoProjectAssets, videoMaterialKind } from "../workflow-carrier/video-project-material";
import { useVideoProjectMedia } from "../workflow-carrier/use-video-project-media";
import type { VideoProjectDoc } from "../workflow-carrier/video-project-doc";
import { useCanvasWorkflow } from "./engine/use-canvas-workflow";
import { createCanvasAgentSurface } from "./engine/canvas-agent-surface";
import { stageArtifactBlob } from "../artifact-client";
import { useCanvasViews } from "./engine/use-canvas-chrome";
import { addProjectNode, projectHead, replaceProjectGraph, parseVideoProject, type CanvasNodeKind, type VideoProject } from "./engine/project-model";
import CanvasWorkflow from "./engine/CanvasWorkflow";
import { videoKindSpec } from "../workflow-carrier/video-canvas-kinds";
import { WORKFLOW_NATIVE_AGENT_NODE_KINDS } from "../workflow-carrier/agent-write-bridge";
import { addAgentVideoNode } from "./library-agent-bridge";
import "./runtime";

interface Props extends AdvancedContentWorkbenchProps {
  initialProject: VideoProject;
  base: MutableRefObject<LibraryItem>;
  lock: ReturnType<typeof useLockedEditCollab>;
  onCommitted: (item: LibraryItem) => void;
}
const asDoc = (project: VideoProject) => project as unknown as VideoProjectDoc;

function Session(props: Props) {
  const { item, base, lock, initialProject, onCommitted } = props;
  const tt = useUI();
  const theme = usePluginTheme("video-canvas").theme || "light";
  const [runtimeUrls, setRuntimeUrls] = useState<Record<string, string>>({});
  const localUrls = useRef<string[]>([]);
  const [mediaFailures, setMediaFailures] = useState<string[]>([]);
  const [savedRevision, setSavedRevision] = useState(0);
  const workflowRef = useRef<ReturnType<typeof useCanvasWorkflow>>(null!);
  const panelHost = useRef<AdvancedContextToolbarHost | null>(null);
  const flush = useCallback(async () => {
    if (!lock.mayWrite) return { ok: false as const, error: tt("只能查看，不能修改") };
    const workflow = workflowRef.current;
    const doc = asDoc(workflow.captureProject());
    const revision = workflow.currentEditRevision();
    const result = await saveVideoProject({ base: base.current, doc, editRevision: revision, siteId: props.siteId,
      createPreview: () => renderVideoProjectPreview(doc, tt) });
    if (!result.ok) return { ok: false as const, error: result.error };
    base.current = result.item;
    const latest = workflowRef.current.captureProject();
    if (latest === (doc as unknown)) workflowRef.current.adoptProject(pinVideoProjectAssets(asDoc(latest), String(result.item.artifactId), result.revisionId) as unknown as VideoProject);
    setSavedRevision(value => Math.max(value, revision));
    onCommitted(result.item);
    return { ok: true as const, item: result.item };
  }, [base, lock.mayWrite, onCommitted, props.siteId, tt]);
  useEffect(() => () => { for (const url of localUrls.current) URL.revokeObjectURL(url); }, []);
  const insertUpload = useCallback(async (file: File) => {
    const kind = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : file.type.startsWith("audio/") ? "audio" : null;
    if (!kind || !lock.mayWrite) return false;
    const staged = await stageArtifactBlob(String(base.current.artifactId), file);
    if (!staged.ok || !staged.data) throw new Error(staged.error || tt("这份素材没能插入，请重试"));
    const current = workflowRef.current;
    const material = { ...base.current, title: file.name };
    const inserted = insertVideoMaterial(asDoc(current.captureProject()), material, kind, { x: 160, y: 160 }, staged.data);
    if (!inserted) return false;
    const insertedProject = parseVideoProject(inserted.doc);
    const graph = projectHead(insertedProject).graph;
    if (!current.applyProject(replaceProjectGraph({ ...current.captureProject(), assets: insertedProject.assets }, graph.nodes, graph.edges, "canvas.material.insert"))) {
      throw new Error(tt("只能查看，不能修改"));
    }
    const assetId = inserted.doc.versions[inserted.doc.headVersionId].graph.nodes.find(node => node.nodeId === inserted.id)?.assetId;
    if (assetId) { const url = URL.createObjectURL(file); localUrls.current.push(url); onMediaAfterUpload.current(assetId, url); }
    return true;
  }, [base, lock.mayWrite, tt]);
  const onMediaAfterUpload = useRef<(id: string, url: string) => void>(() => undefined);
  const workflow = useCanvasWorkflow({ initialProject, userEditKey: userEditItemKey(item), readOnly: !lock.mayWrite,
    runtimeUrls, uploadMedia: insertUpload, openMaterials: () => {
      if (!panelHost.current) throw new Error(tt("请稍后重试"));
      panelHost.current.openDrawer("materials");
    }, save: async () => { const result = await flush(); if (!result.ok) throw new Error(result.error); } });
  workflowRef.current = workflow;
  const onMedia = useCallback((id: string, url: string) => { setRuntimeUrls(current => current[id] === url ? current : { ...current, [id]: url }); }, []);
  onMediaAfterUpload.current = onMedia;
  const onMediaFailure = useCallback((id: string) => setMediaFailures(current => current.includes(id) ? current : [...current, id]), []);
  useVideoProjectMedia(asDoc(workflow.project), onMedia, onMediaFailure);
  const materialAdapter = useMemo<WorkbenchMaterialAdapter>(() => ({ id: "video-canvas-materials@1", actions: ["insert"],
    materialTypes: ["image", "video", "audio"], accepts: material => lock.mayWrite && Boolean(material.artifactId) && Boolean(videoMaterialKind(material)),
    mutate: async (_action, material) => {
      const kind = videoMaterialKind(material);
      if (!kind || !lock.mayWrite) throw new Error(tt("这个编辑器用不了这类素材"));
      const { receipt, blob } = await stageVideoMaterial(String(base.current.artifactId), material, kind, tt);
      const current = workflowRef.current;
      const inserted = insertVideoMaterial(asDoc(current.captureProject()), material, kind, { x: 160, y: 160 }, receipt);
      if (!inserted) throw new Error(tt("这份素材没能插入，请重试"));
      const insertedProject = parseVideoProject(inserted.doc);
    const graph = projectHead(insertedProject).graph;
    if (!current.applyProject(replaceProjectGraph({ ...current.captureProject(), assets: insertedProject.assets }, graph.nodes, graph.edges, "canvas.material.insert"))) {
      throw new Error(tt("只能查看，不能修改"));
    }
      const assetId = inserted.doc.versions[inserted.doc.headVersionId].graph.nodes.find(node => node.nodeId === inserted.id)?.assetId;
      if (assetId) { const url = URL.createObjectURL(blob); localUrls.current.push(url); onMedia(assetId, url); }
    } }), [base, lock.mayWrite, onMedia, tt]);
  useWorkbenchMaterialAdapter(useMemo(() => withEditorHistoryCommand(materialAdapter, {
    documentId: String(item.artifactId), targetRevisionId: String(base.current.revisionId) }), [base, item.artifactId, materialAdapter, savedRevision]));
  const agent = useMemo(() => {
    const surface = createCanvasAgentSurface(workflow);
    return guardPluginSurface({ ...surface,
    run: (id, params) => id === "video-canvas.node.create"
      ? addAgentVideoNode(workflow.collabPort, String(params?.entryId || ""), tt(videoKindSpec(String(params?.entryId || "")).label), String(item.artifactId))
      : surface.run(id, params),
    target: () => pluginTargetForLibraryItem(base.current, "video-canvas", workflow.editRevision) }, !lock.mayWrite); }, [base, item.artifactId, lock.mayWrite, tt, workflow]);
  usePluginCommandSurface(agent);
  const views = useCanvasViews();
  const addNode = (kind: CanvasNodeKind) => {
    const current = workflowRef.current;
    const added = addProjectNode(current.captureProject(), kind, { x: 160, y: 160 }, { title: tt(videoKindSpec(kind).label) });
    current.applyProject(added.project); current.onNodeClick(added.nodeId);
  };
  return <AdvancedWorkbenchShell {...props} adapter={{ id: "video-canvas", label: tt("视频画布"), collab: lock.collab,
    history: lock.mayWrite ? workflow.history : undefined,
    pages: { aux: views.filter(view => view.id !== "graph").map(view => ({ ...view, kind: "aux" as const })),
      activePageId: workflow.workspaceView === "graph" ? "artifact" : workflow.workspaceView,
      onSelectPage: page => { void workflow.openView(page === "artifact" ? "graph" : page as "storyboard" | "director" | "timeline" | "history"); } },
    drawers: lock.mayWrite ? [{ id: "video-canvas-add-node", label: tt("加节点"), icon: "add",
      content: <div className="grid gap-1 p-3">{WORKFLOW_NATIVE_AGENT_NODE_KINDS.map(kind => <button key={kind} type="button"
        data-node-kind={kind} onClick={() => addNode(kind)} className="rounded-lg px-3 py-2 text-left hover:bg-[var(--surface-hover)]">{tt(videoKindSpec(kind).label)}</button>)}</div> }] : [],
    panelHostRef: panelHost,
    selection: {
      context: selectionAdapterContext(viewOnlyContext(workflow.selectionContext, !lock.mayWrite, tt)),
      dispatch: workflow.dispatchSelectionCommand,
    },
    notices: mediaFailures.length ? [{ id: "video-media-failed", text: tt("素材加载失败"), severity: "warn" }] : [],
    upload: lock.mayWrite ? { accept: "image/*,video/*,audio/*", onFiles: async files => { for (const file of files) await insertUpload(file); } } : undefined,
    stage: <CanvasWorkflow workflow={workflow} pluginTheme={theme} />,
    persistence: { userEditKey: userEditItemKey(item), editRevision: workflow.editRevision,
      dirty: lock.mayWrite && workflow.editRevision > savedRevision, autoSave: true, flush,
      recovery: { draftSchema: "oceanleo.video-project.edit.v2", key: advancedRecoveryKey("video-canvas", item), ready: lock.mayWrite,
        capture: () => workflowRef.current.captureProject(), restore: payload => {
          try { workflowRef.current.restoreProject(parseVideoProject(payload)); return true; } catch { return false; }
        } } } }} />;
}

export default function LibraryVideoCanvasSession(props: Props) {
  return <ReactFlowProvider><Session {...props} /></ReactFlowProvider>;
}
