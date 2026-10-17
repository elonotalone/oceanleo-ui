import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { VideoCanvasLocalCanvas } from "../../src/shell/workflow-carrier/VideoCanvasLocalCanvas.tsx";
import {
  addVideoCanvasNode,
  createVideoCanvasHistory,
  emptyVideoCanvasGraph,
  exportVideoCanvasProject,
  setVideoCanvasNodeLabel,
} from "../../src/shell/workflow-carrier/video-canvas-local-session.ts";

const PROTOCOL = "oceanleo.editor-session.v1";
const SESSION = "sess-video-canvas-r2";

function post(type: string, extra: Record<string, unknown> = {}) {
  const message = { protocol: PROTOCOL, sessionId: SESSION, type, ...extra };
  window.parent?.postMessage(message, location.origin);
  (window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound?.push(message);
}

function readStored() {
  try {
    const raw = sessionStorage.getItem("w10-r2-video-canvas");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function VideoCanvasR2() {
  const initial = useMemo(() => {
    const stored = readStored();
    if (stored?.nodes) return stored;
    let graph = emptyVideoCanvasGraph();
    graph = addVideoCanvasNode(graph, "source", "src-a", "源");
    graph = addVideoCanvasNode(graph, "output", "out-a", "输出");
    return graph;
  }, []);
  const history = useMemo(() => createVideoCanvasHistory(initial), [initial]);
  const [graph, setGraph] = useState(initial);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="bar">
        <button
          type="button"
          data-testid="video-canvas-rename"
          onClick={() => {
            const next = history.commit(setVideoCanvasNodeLabel(graph, "src-a", "离线改过的源节点"));
            setGraph(next);
            post("changed", { payload: next });
          }}
        >
          改源节点名
        </button>
        <button
          type="button"
          data-testid="video-canvas-undo"
          onClick={() => {
            const next = history.undo();
            setGraph(next);
            post("changed", { payload: next });
          }}
        >
          撤销
        </button>
        <button
          type="button"
          data-testid="video-canvas-redo"
          onClick={() => {
            const next = history.redo();
            setGraph(next);
            post("changed", { payload: next });
          }}
        >
          重做
        </button>
        <button
          type="button"
          data-testid="r2-save"
          onClick={() => {
            sessionStorage.setItem("w10-r2-video-canvas", JSON.stringify(graph));
            post("save", { requestId: "save-1", document: exportVideoCanvasProject(graph) });
          }}
        >
          保存
        </button>
        <button
          type="button"
          data-testid="r2-export"
          onClick={() => post("exported", { document: exportVideoCanvasProject(graph) })}
        >
          导出
        </button>
      </div>
      <ol data-testid="video-canvas-nodes">
        {graph.nodes.map((node) => (
          <li key={node.id}>
            {node.id}: {node.label}
          </li>
        ))}
      </ol>
      <div className="stage">
        <VideoCanvasLocalCanvas
          graph={graph}
          onChange={(next) => {
            const stored = history.commit(next);
            setGraph(stored);
            post("changed", { payload: stored });
          }}
        />
      </div>
    </div>
  );
}

(window as Window & { __oceanleoOutbound?: unknown[] }).__oceanleoOutbound = [];
createRoot(document.getElementById("root")!).render(<VideoCanvasR2 />);
(window as Window & { __oceanleoReady?: boolean }).__oceanleoReady = true;
post("ready");
