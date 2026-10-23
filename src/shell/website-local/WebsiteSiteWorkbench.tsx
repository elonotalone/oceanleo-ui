"use client";

/**
 * Website editor for site documents (W14, 2026-10-23): the format almost every
 * stored website uses (`site.json` inside a website-source@1 bundle). One Puck
 * instance for both faces; the unified edit bar edits the picked text / image /
 * section; saves commit a new revision that keeps the bundle intact.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Data } from "@puckeditor/core";
import { useUI } from "../../i18n/ui/useUI";
import type { AdvancedContentWorkbenchProps } from "../advanced-workbench-types";
import { AdvancedWorkbenchShell } from "../AdvancedWorkbenchShell";
import { advancedRecoveryKey } from "../advanced-recovery-store";
import { EditorSourceFailurePanel } from "../doc-editors/EditorSourceFailurePanel";
import { setPluginMode } from "../plugin-chrome/plugin-mode-store";
import { DEFAULT_EDITOR_MODE, type EditorMode } from "../hosted-editor";
import { SelectionToolbar } from "../SelectionToolbar";
import type { SelectionCommand } from "../selection-context";
import type { LibraryItem } from "../library-data";
import { WebsitePuckStage } from "./WebsitePuckStage";
import { websiteFaceForMode } from "./website-puck-faces";
import {
  isSiteDoc,
  pageSections,
  replacePageSections,
  setSectionContent,
  siteFieldPath,
  siteImagePaths,
  type SiteDoc,
  type SiteEnvelope,
} from "./website-site-doc";
import { loadSiteDoc, SiteImageResolver, type SiteRevisionIdentity } from "./website-site-load";
import { puckToSiteSections, siteDocPuckConfig, siteSectionsToPuck } from "./website-site-puck";
import { SiteEditorContext, type SiteFieldPick } from "./website-site-render";
import {
  applySiteBarCommand,
  normalizePick,
  siteSelectionContext,
  type SiteBarSelection,
} from "./website-site-bar";
import {
  saveSiteDocRevision,
  siteImagePathFor,
  validateSiteImage,
  type StagedSiteFile,
} from "./website-site-save";
import { SitePuckBridgeContext, SitePuckBridgeHost } from "./WebsiteSitePuckBridge";
import { recordUserMutation, userEditItemKey } from "../user-edit-session";
import { captureSiteDraft, restoreSiteDraft } from "./website-site-recovery";
import { useSiteMaterial } from "./use-site-material";

function debugW14(...parts: unknown[]) {
  if (typeof window !== "undefined" && (window as { __W14_DEBUG__?: boolean }).__W14_DEBUG__) {
    console.info("[w14-debug]", JSON.stringify(parts).slice(0, 600));
  }
}

export const WEBSITE_SITE_DRAFT_SCHEMA = "oceanleo.website-site-draft.v1";

/** Undo stack of whole documents; Puck typing inside one field coalesces. */
export function createSiteHistory(initial: SiteDoc) {
  const past: SiteDoc[] = [];
  const future: SiteDoc[] = [];
  let present = initial;
  let lastKey = "";
  let lastAt = 0;
  return {
    present: () => present,
    commit(next: SiteDoc, coalesceKey = "", now = Date.now()) {
      if (next === present) return present;
      const coalesce = coalesceKey && coalesceKey === lastKey && now - lastAt < 1200;
      if (!coalesce) past.push(present);
      if (past.length > 200) past.shift();
      future.length = 0;
      present = next;
      lastKey = coalesceKey;
      lastAt = now;
      return present;
    },
    undo() {
      const previous = past.pop();
      if (!previous) return present;
      future.push(present);
      present = previous;
      lastKey = "";
      return present;
    },
    redo() {
      const next = future.pop();
      if (!next) return present;
      past.push(present);
      present = next;
      lastKey = "";
      return present;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}

export interface WebsiteSiteWorkbenchProps extends AdvancedContentWorkbenchProps {
  envelope: SiteEnvelope;
  identity: SiteRevisionIdentity;
  /** The route must not reload the editor when the item moves to a revision we saved. */
  onSavedRevision: (revisionId: string) => void;
}

export function WebsiteSiteWorkbench(props: WebsiteSiteWorkbenchProps) {
  const tt = useUI();
  const { item, envelope, identity } = props;
  const [loaded, setLoaded] = useState<{ doc: SiteDoc } | { error: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setLoaded(null);
    loadSiteDoc(identity, envelope, abort.signal)
      .then((doc) => !abort.signal.aborted && setLoaded({ doc }))
      .catch((caught) => {
        if (abort.signal.aborted) return;
        const detail = caught instanceof Error && caught.message ? caught.message : tt("网站内容读不出来");
        setLoaded({ error: `${detail}${tt("，未改用空白稿覆盖原件。")}` });
      });
    return () => abort.abort();
    // identity/envelope are pinned by the route for this artifact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.artifactId, identity.revisionId, nonce]);
  if (!item) return null;
  if (loaded && "doc" in loaded) {
    return <SiteEditor {...props} item={item} initial={loaded.doc} />;
  }
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={props.taskId}
      siteId={props.siteId}
      accent={props.accent}
      onClose={props.onClose}
      adapter={{
        id: "website",
        label: "网站",
        stage: loaded ? (
          <EditorSourceFailurePanel message={(loaded as { error: string }).error} onReload={() => setNonce((n) => n + 1)} variant="surface" />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-[var(--awb-muted)]" data-testid="website-remote-loading">
            {tt("正在读取网站内容。")}
          </div>
        ),
      }}
    />
  );
}

function SiteEditor({
  item,
  taskId,
  siteId = "",
  accent = "#1F6FEB",
  onClose,
  envelope,
  identity,
  onSavedRevision,
  initial,
}: WebsiteSiteWorkbenchProps & { item: LibraryItem; initial: SiteDoc }) {
  const tt = useUI();
  const history = useMemo(() => createSiteHistory(initial), [initial]);
  const [doc, setDoc] = useState(initial);
  const [pageIndex, setPageIndex] = useState(0);
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [mode, setMode] = useState<EditorMode>(DEFAULT_EDITOR_MODE);
  const [selection, setSelection] = useState<SiteBarSelection | null>(null);
  const [pushToken, setPushToken] = useState(0);
  const [selectRequest, setSelectRequest] = useState({ token: 0, id: "" });
  const [notice, setNotice] = useState("");
  const docRef = useRef(doc);
  docRef.current = doc;
  const pageRef = useRef(pageIndex);
  pageRef.current = pageIndex;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const baseItemRef = useRef<LibraryItem>(item);
  const imagesRef = useRef(new Map<string, File>());
  const stagedRef = useRef(new Map<string, StagedSiteFile>());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceTargetRef = useRef<{ sectionId: string; field: string } | null>(null);
  // The route passes a fresh identity object each render; pin the resolver to its value.
  const resolver = useMemo(
    () => new SiteImageResolver({ artifactId: identity.artifactId, revisionId: identity.revisionId }),
    [identity.artifactId, identity.revisionId],
  );
  const config = useMemo(() => siteDocPuckConfig(initial, tt), [initial, tt]);

  // Autosave runs only after a person changed the open item (user-edit-session).
  const userEditKey = userEditItemKey(item);
  const commit = useCallback(
    (next: SiteDoc, options: { fromPuck?: boolean; coalesceKey?: string; restored?: boolean } = {}) => {
      if (!options.restored) recordUserMutation(userEditKey);
      const stored = history.commit(next, options.coalesceKey || "");
      setDoc(stored);
      setRevision((value) => value + 1);
      if (!options.fromPuck) setPushToken((value) => value + 1);
    },
    [history, userEditKey],
  );

  const onPuckChange = useCallback(
    (data: Data) => {
      const current = docRef.current;
      const base = pageSections(current, pageRef.current);
      const sections = puckToSiteSections(data, base, current);
      if (JSON.stringify(sections) === JSON.stringify(base)) return;
      const next = replacePageSections(current, pageRef.current, sections);
      if (!isSiteDoc(next)) return;
      const changedIds = sections
        .filter((section, index) => JSON.stringify(section) !== JSON.stringify(base[index]))
        .map((section) => section.id);
      commit(next, {
        fromPuck: true,
        coalesceKey: sections.length === base.length && changedIds.length === 1 ? `puck:${changedIds[0]}` : "",
      });
    },
    [commit],
  );

  const onPick = useCallback((pick: SiteFieldPick | null) => {
    const next = normalizePick(docRef.current, pageRef.current, pick);
    debugW14("pick", pick, next);
    setSelection(next);
  }, []);

  const bridge = useMemo(
    () => ({
      pushToken,
      data: () => siteSectionsToPuck(pageSections(docRef.current, pageRef.current)),
      onSelectedSection: (sectionId: string | null) => {
        debugW14("puck-selected", sectionId);
        setSelection((current) =>
          !sectionId ? null : current?.sectionId === sectionId ? current : { sectionId, field: "", kind: "text" },
        );
      },
      selectToken: selectRequest.token,
      selectId: selectRequest.id,
    }),
    [pushToken, selectRequest],
  );

  const context = useMemo(
    () => (selection ? siteSelectionContext(doc, pageIndex, selection, tt) : null),
    [doc, pageIndex, selection, tt],
  );

  const onCommand = (command: SelectionCommand) => {
    if (!selection || !context || command.selectionId !== context.id) return;
    if (command.phase && command.phase !== "commit" && command.transactionId) return;
    const effect = applySiteBarCommand(doc, pageIndex, selection, command);
    if (effect.type === "replace-image") {
      replaceTargetRef.current = { sectionId: effect.sectionId, field: effect.field };
      fileInputRef.current?.click();
      return;
    }
    if (effect.type !== "doc" || effect.doc === doc) return;
    commit(effect.doc);
    if (effect.select !== undefined) {
      setSelection(effect.select);
      setSelectRequest((value) => ({ token: value.token + 1, id: effect.select?.sectionId || "" }));
    }
  };

  const onReplaceFile = (file: File | undefined) => {
    const target = replaceTargetRef.current;
    replaceTargetRef.current = null;
    if (!file || !target) return;
    const problem = validateSiteImage(file);
    if (problem) {
      setNotice(tt(problem));
      return;
    }
    const current = docRef.current;
    const taken = new Set([
      ...siteImagePaths(current),
      ...imagesRef.current.keys(),
      ...(envelope.kind === "bundle" ? envelope.manifest.files.map((entry) => entry.path) : []),
    ]);
    const path = siteImagePathFor(file, (candidate) => taken.has(candidate));
    imagesRef.current.set(path, file);
    resolver.setLocal(path, URL.createObjectURL(file));
    setNotice("");
    commit(setSectionContent(current, pageRef.current, target.sectionId, [...siteFieldPath(target.field), "url"], path));
  };

  useSiteMaterial({
    item,
    selectedImage: selection?.kind === "image" ? `${selection.sectionId}:${selection.field}` : "",
    insert: (file, replace) => {
      const problem = validateSiteImage(file);
      if (problem) throw new Error(tt(problem));
      if (replace && selection?.kind === "image") {
        replaceTargetRef.current = { sectionId: selection.sectionId, field: selection.field };
        onReplaceFile(file);
        return;
      }
      const current = docRef.current;
      const sections = pageSections(current, pageRef.current);
      const id = `image-${Date.now().toString(36)}`;
      const taken = new Set([...siteImagePaths(current), ...imagesRef.current.keys(),
        ...(envelope.kind === "bundle" ? envelope.manifest.files.map(entry => entry.path) : [])]);
      const path = siteImagePathFor(file, candidate => taken.has(candidate));
      imagesRef.current.set(path, file);
      resolver.setLocal(path, URL.createObjectURL(file));
      commit(replacePageSections(current, pageRef.current, [...sections, {
        id, type: sections.find(section => section.content.image)?.type || sections[0]?.type || "hero",
        content: { image: { url: path, alt: file.name } },
      }]));
    },
  });

  const undo = () => {
    recordUserMutation(userEditKey);
    setDoc(history.undo());
    setRevision((value) => value + 1);
    setPushToken((value) => value + 1);
  };
  const redo = () => {
    recordUserMutation(userEditKey);
    setDoc(history.redo());
    setRevision((value) => value + 1);
    setPushToken((value) => value + 1);
  };

  const flush = async () => {
    const savingRevision = revisionRef.current;
    const savingDoc = docRef.current;
    try {
      const result = await saveSiteDocRevision({
        item: baseItemRef.current,
        siteId,
        envelope,
        doc: savingDoc,
        images: imagesRef.current,
        staged: stagedRef.current,
        editRevision: savingRevision,
        imageUrl: (path) => resolver.url(path),
      });
      if (!result.ok) {
        return { ok: false as const, error: result.error || tt("网站没能保存成新版本。") };
      }
      if (result.item) baseItemRef.current = result.item;
      const savedId = String(result.item?.revisionId || result.revisionId || "");
      if (savedId) onSavedRevision(savedId);
      setSavedRevision((value) => Math.max(value, savingRevision));
      return { ok: true as const, item: result.item };
    } catch (caught) {
      return {
        ok: false as const,
        error: caught instanceof Error && caught.message ? caught.message : tt("网站没能保存成新版本。"),
      };
    }
  };

  const page = doc.pages[pageIndex] || doc.pages[0];
  return (
    <AdvancedWorkbenchShell
      item={item}
      taskId={taskId}
      siteId={siteId}
      accent={accent}
      onClose={onClose}
      adapter={{
        id: "website",
        label: "网站",
        history: {
          canUndo: history.canUndo(),
          canRedo: history.canRedo(),
          undo,
          redo,
        },
        mode: {
          current: mode,
          setMode: (next) => {
            setMode(next);
            setPluginMode("website", next);
          },
        },
        contextToolbar: context ? (
          <SelectionToolbar context={context} onCommand={onCommand} accent={accent} />
        ) : null,
        ...(notice ? { notices: [{ id: "website-image", text: notice, severity: "warn" as const }] } : {}),
        stage: (
          <div className="flex h-full min-h-0 flex-col bg-[var(--awb-stage-bg)] text-[var(--awb-text)]" data-testid="website-site-stage" data-website-shape={envelope.kind}>
            {doc.pages.length > 1 ? (
              <div className="flex flex-wrap items-center gap-1 border-b border-[var(--awb-border)] bg-[var(--awb-chrome-bg)] px-3 py-1.5 text-[12px]" data-testid="website-page-bar" role="tablist" aria-label={tt("网站页面")}>
                {doc.pages.map((entry, index) => (
                  <button
                    key={index}
                    type="button"
                    role="tab"
                    aria-selected={index === pageIndex}
                    data-testid={`website-page-${index}`}
                    className={`rounded-md px-2.5 py-1 ${index === pageIndex ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]" : "hover:bg-[var(--awb-hover)]"}`}
                    onClick={() => {
                      setSelection(null);
                      setPageIndex(index);
                    }}
                  >
                    {String(entry.name || entry.title || index + 1)}
                  </button>
                ))}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              data-testid="website-image-input"
              onChange={(event) => {
                onReplaceFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <div className="min-h-0 flex-1">
              <SiteEditorContext.Provider value={{ doc, pageIndex, images: resolver, onPick }}>
                <SitePuckBridgeContext.Provider value={bridge}>
                  <WebsitePuckStage
                    key={`page:${pageIndex}`}
                    face={websiteFaceForMode(mode)}
                    config={config}
                    data={siteSectionsToPuck(page?.sections || [])}
                    onChange={onPuckChange}
                    puckWrapper={SitePuckBridgeHost}
                  />
                </SitePuckBridgeContext.Provider>
              </SiteEditorContext.Provider>
            </div>
          </div>
        ),
        persistence: {
          userEditKey,
          dirty: revision > savedRevision,
          editRevision: revision,
          flush,
          recovery: {
            draftSchema: WEBSITE_SITE_DRAFT_SCHEMA,
            key: advancedRecoveryKey("website", item),
            ready: true,
            capture: () => captureSiteDraft(docRef.current, imagesRef.current),
            captureRevision: async (requestedRevision) => {
              if (!Object.is(requestedRevision, revisionRef.current)) return null;
              const payload = await captureSiteDraft(docRef.current, imagesRef.current);
              return Object.is(requestedRevision, revisionRef.current) ? { revision: requestedRevision, payload } : null;
            },
            restore: (payload) => {
              const restored = restoreSiteDraft(payload);
              if (!restored) return false;
              for (const [path, file] of restored.images) {
                imagesRef.current.set(path, file);
                resolver.setLocal(path, URL.createObjectURL(file));
              }
              commit(restored.doc, { restored: true });
              return true;
            },
          },
        },
      }}
    />
  );
}
