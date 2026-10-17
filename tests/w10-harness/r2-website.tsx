import { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/dist/index.css";

import { existingWebsiteSource } from "../../src/shell/website-local/blank-website-source.ts";
import { websitePuckConfig } from "../../src/shell/website-local/website-puck-config.tsx";
import {
  addWebsitePage,
  addWebsiteSection,
  createWebsiteSourceHistory,
  exportWebsiteSource,
  removeWebsitePage,
  removeWebsiteSection,
  setWebsiteSectionHeading,
  setWebsiteTheme,
} from "../../src/shell/website-local/website-source-session.ts";
import {
  puckToWebsiteSource,
  websiteSourceToPuck,
} from "../../src/shell/website-local/website-puck-map.ts";
import {
  WEBSITE_SECTION_KINDS,
  type WebsiteSectionKind,
} from "../../src/shell/website-source-carrier/website-source-schema.ts";

const PROTOCOL = "oceanleo.editor-session.v1";
const SESSION = "sess-website-r2";

function post(type: string, extra: Record<string, unknown> = {}) {
  const message = { protocol: PROTOCOL, sessionId: SESSION, type, ...extra };
  window.parent?.postMessage(message, location.origin);
  (window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound?.push(message);
}

function readStored() {
  try {
    const raw = sessionStorage.getItem("w10-r2-website");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function WebsiteR2() {
  const initial = useMemo(
    () => readStored() || existingWebsiteSource("操作员已有的网站工程"),
    [],
  );
  const history = useMemo(() => createWebsiteSourceHistory(initial), [initial]);
  const [source, setSource] = useState(initial);
  const [pageId, setPageId] = useState(initial.pages[0]?.id || "home");
  const [editorKey, setEditorKey] = useState(0);
  const [addKind, setAddKind] = useState<WebsiteSectionKind>("content");
  const [dirty, setDirty] = useState(false);
  const currentPage = source.pages.find((page) => page.id === pageId) || source.pages[0];

  const commit = useCallback(
    (next: typeof source) => {
      const stored = history.commit(next);
      setSource(stored);
      setDirty(true);
      post("changed", { dirty: true, payload: stored });
      return stored;
    },
    [history],
  );

  const saved = () => {
    sessionStorage.setItem("w10-r2-website", JSON.stringify(source));
    post("save", { requestId: "save-1", payload: source, document: exportWebsiteSource(source) });
  };

  const exported = () => {
    post("exported", { format: "json", document: exportWebsiteSource(source) });
  };

  return (
    <div data-testid="website-local-stage" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="bar">
        <button
          type="button"
          data-testid="website-local-undo"
          disabled={!history.canUndo()}
          onClick={() => {
            const next = history.undo();
            setSource(next);
            setEditorKey((value) => value + 1);
            post("changed", { dirty: history.canUndo(), payload: next });
          }}
        >
          撤销
        </button>
        <button
          type="button"
          data-testid="website-local-redo"
          disabled={!history.canRedo()}
          onClick={() => {
            const next = history.redo();
            setSource(next);
            setEditorKey((value) => value + 1);
            post("changed", { dirty: true, payload: next });
          }}
        >
          重做
        </button>
        <button type="button" data-testid="website-page-add" onClick={() => commit(addWebsitePage(source))}>
          加页面
        </button>
        <button
          type="button"
          data-testid="website-page-remove"
          disabled={source.pages.length <= 1}
          onClick={() => currentPage && commit(removeWebsitePage(source, currentPage.id))}
        >
          删页面
        </button>
        <select
          data-testid="website-section-kind"
          value={addKind}
          onChange={(event) => setAddKind(event.target.value as WebsiteSectionKind)}
        >
          {WEBSITE_SECTION_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <button
          type="button"
          data-testid="website-section-add"
          onClick={() => currentPage && commit(addWebsiteSection(source, currentPage.id, addKind))}
        >
          加入
        </button>
        <button
          type="button"
          data-testid="website-section-remove"
          onClick={() => {
            const last = currentPage?.sectionIds.at(-1);
            if (currentPage && last) commit(removeWebsiteSection(source, currentPage.id, last));
          }}
        >
          删末块
        </button>
        <input
          data-testid="website-heading"
          value={
            currentPage
              ? source.sections.find((section) => section.id === currentPage.sectionIds[0])?.heading || ""
              : ""
          }
          onChange={(event) => {
            const first = currentPage?.sectionIds[0];
            if (!first) return;
            commit(
              setWebsiteSectionHeading(source, first, event.target.value),
            );
          }}
        />
        <input
          data-testid="website-theme-accent"
          type="color"
          value={source.theme.accent}
          onChange={(event) => commit(setWebsiteTheme(source, { accent: event.target.value }))}
        />
        <button type="button" data-testid="r2-save" onClick={saved}>
          保存
        </button>
        <button type="button" data-testid="r2-export" onClick={exported}>
          导出
        </button>
        <span data-testid="r2-dirty">{dirty ? "dirty" : "clean"}</span>
      </div>
      <div className="bar" data-testid="website-page-bar">
        {source.pages.map((page) => (
          <button
            key={page.id}
            type="button"
            data-testid={`website-page-${page.id}`}
            data-active={page.id === currentPage?.id ? "true" : "false"}
            onClick={() => {
              setPageId(page.id);
              setEditorKey((value) => value + 1);
            }}
          >
            {page.title}
          </button>
        ))}
      </div>
      <div className="stage">
        <Puck
          key={`${editorKey}:${currentPage?.id || "home"}`}
          config={websitePuckConfig}
          data={websiteSourceToPuck(source, currentPage?.id)}
          iframe={{ enabled: false }}
          onChange={(data) => commit(puckToWebsiteSource(data, source, currentPage?.id))}
        />
      </div>
    </div>
  );
}

const outbound: unknown[] = [];
(window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound = outbound;
createRoot(document.getElementById("root")!).render(<WebsiteR2 />);
(window as Window & { __oceanleoReady?: boolean }).__oceanleoReady = true;
post("ready");
