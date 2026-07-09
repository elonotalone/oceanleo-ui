"use client";

// ============================================================================
// @oceanleo/ui — OrgCanvas：organization 节点图画布（单一事实源，doctrine 2026-07-09）
// ----------------------------------------------------------------------------
// 把「组织 = 节点图画布」这件事收敛成一个可复用组件，两处共用同一套画布 UI：
//   ① 主站 `/workspace` 的 organization 编排（OrgWorkflowBoard 的右栏结构图）；
//   ② agent 站【专家团聊天】右栏库的「组织」板块（团队≡组织，用同一张节点图展示成员、
//      加成员、点节点看 prompt/正在做的工作、看实时状态）。
//
// 之所以放进 @oceanleo/ui 而不是各站各写：操作员要求团队与 organization「显示得一模
// 一样」，且团队设计要「完完全全复用已有的 organization 设计」。一处改，两处同步。
//
// React Flow（@xyflow/react，upstream production 验证 >1 年）承载图编辑。它是本包的
// **peerDependency**——只有真正用到画布的站（主站、agent 站）才装它；本组件走【独立
// 子路径导出】`@oceanleo/ui/org-canvas`，**不**从 shell/index 再导出，所以其余 29 个
// 不用画布的站永远不会把 xyflow 打进包里。
//
// 设计要点（复刻 OrgWorkflowBoard 的画布，见 04cea7b2 截图）：
//   - 自定义 agent 节点：图标 + 名字 + 状态点（待命/工作中/已回复 或 pending/running/done）；
//     四周（上下左右）连接锚点，按相对位置就近选锚点，连线不绕背。
//   - 右上「＋ 成员」浮层（搜 agent → 落到画布）；可选「＋ 创建 agent」。
//   - 点节点 → 居中 prompt/工作弹窗（SkillPromptPanel modal 形态，与 image 站同款）。
//   - 右下 minimap + 左下 Controls 缩放；Background 点阵。
//   - 只读模式（readOnly）：隐藏「＋ 成员」、禁拖拽/连线/删除——用于纯查看的场景。
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { SkillPromptPanel } from "./SkillPromptPanel";
import { useUI } from "../i18n/ui/useUI";
import type { OrgGraph, OrgGraphNode } from "../lib/organization";

const GRID = 24;
const NODE_W = 150;
const NODE_H = 56;

/** 画布里一个 agent 的最小信息（供节点显示名字/图标 + 点开看 prompt/tagline）。 */
export interface OrgCanvasAgent {
  agent_id: string;
  name: string;
  icon?: string;
  tagline?: string;
  category?: string;
  /** 有无自定义 prompt/技能（节点上标「有技能」）。 */
  hasSkill?: boolean;
}

/** 节点实时状态（agent 站团队跑起来时用）：pending 待命 / running 工作中 / done 已回复。 */
export type OrgNodeStatus = "pending" | "running" | "done";

export interface OrgCanvasProps {
  /** 组织结构图（节点 = 成员 agent，边 = 协作/汇报关系）。 */
  graph: OrgGraph;
  /** agent 信息表（agent_id → 名字/图标/tagline）。用于节点显示 + 点开弹窗。 */
  agents: Record<string, OrgCanvasAgent>;
  /** 可加进画布的 agent 全集（「＋ 成员」浮层用）。不给则用 agents 的值。 */
  pickableAgents?: OrgCanvasAgent[];
  /** 图变更回调（拖动/连线/加成员/删节点后）。不给 = 只读展示。 */
  onGraphChange?: (graph: OrgGraph) => void;
  /** 每个节点的实时状态（按 node.id 或 agent_id）。agent 站团队跑起来时喂进来。 */
  nodeStatus?: Record<string, OrgNodeStatus>;
  /** 点节点看「正在做/做过的工作」——给了它，节点弹窗底部展示该成员的工作片段。 */
  renderNodeWork?: (agentId: string) => ReactNode;
  /** 「＋ 创建 agent」入口（不给则浮层不显示该项）。 */
  onCreateAgent?: () => void;
  /** 只读：隐藏「＋ 成员」、禁编辑（纯查看）。默认 false（可编辑）。 */
  readOnly?: boolean;
  /** 强调色。 */
  accent?: string;
  /** 「＋ 成员」按钮文案（workflow 用「＋ 步骤」）。默认「＋ 成员」。 */
  addLabel?: string;
  /** 画布右上角额外控件（如 workflow 的「✋ 确认门」）。 */
  topRightExtra?: ReactNode;
  /** 空画布时的提示。 */
  emptyHint?: ReactNode;
}

type NodeData = {
  agentId: string;
  name: string;
  icon: string;
  hasSkill: boolean;
  status?: OrgNodeStatus;
  justAdded?: boolean;
};

const SIDES: { id: string; position: Position }[] = [
  { id: "t", position: Position.Top },
  { id: "b", position: Position.Bottom },
  { id: "l", position: Position.Left },
  { id: "r", position: Position.Right },
];

const HANDLE_DOT: React.CSSProperties = {
  width: 9,
  height: 9,
  background: "#0ea5e9",
  border: "2px solid #fff",
};

function AgentNode({ data, selected }: NodeProps) {
  const tt = useUI();
  const d = data as NodeData;
  const statusColor =
    d.status === "running" ? "#f59e0b" : d.status === "done" ? "#10b981" : "#94a3b8";
  const glow = d.justAdded;
  return (
    <div
      className={`org-node rounded-xl border bg-white px-3 py-2 shadow-sm transition ${glow ? "org-node-glow" : ""}`}
      style={{
        borderColor: glow ? "#0ea5e9" : selected ? "#0ea5e9" : "#e2e8f0",
        boxShadow: glow
          ? `0 0 0 3px #0ea5e955, 0 0 16px #0ea5e988`
          : selected
            ? `0 0 0 2px #0ea5e933`
            : undefined,
        minWidth: 132,
      }}
    >
      {SIDES.map((s) => (
        <span key={s.id}>
          <Handle id={s.id} type="source" position={s.position} style={HANDLE_DOT} />
          <Handle id={`${s.id}-t`} type="target" position={s.position} style={HANDLE_DOT} />
        </span>
      ))}
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[15px]"
          style={{ background: "#f0f9ff" }}
        >
          {d.icon || "✦"}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-slate-800">{d.name}</span>
          {d.status === "running" ? (
            <span className="block text-[10px] text-amber-600">{tt("工作中")}</span>
          ) : d.status === "done" ? (
            <span className="block text-[10px] text-emerald-600">{tt("已回复")}</span>
          ) : d.hasSkill ? (
            <span className="block text-[10px] text-sky-500">{tt("有技能")}</span>
          ) : null}
        </span>
      </div>
      {d.status && (
        <span
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ring-2 ring-white"
          style={{ background: statusColor }}
        />
      )}
    </div>
  );
}

const NODE_TYPES = { agent: AgentNode };

function nearestHandles(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): { sourceHandle: string; targetHandle: string } {
  const dx = tx - sx;
  const dy = ty - sy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "r", targetHandle: "l-t" }
      : { sourceHandle: "l", targetHandle: "r-t" };
  }
  return dy >= 0
    ? { sourceHandle: "b", targetHandle: "t-t" }
    : { sourceHandle: "t", targetHandle: "b-t" };
}

// 「＋ 成员」浮层：搜 agent + 落到画布；可选底部「＋ 创建 agent」。
function AgentPicker({
  agents,
  onPick,
  onCreate,
  label,
  accent = "#0ea5e9",
}: {
  agents: OrgCanvasAgent[];
  onPick: (a: OrgCanvasAgent) => void;
  onCreate?: () => void;
  label?: string;
  accent?: string;
}) {
  const tt = useUI();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = n
      ? agents.filter(
          (a) => a.name.toLowerCase().includes(n) || (a.tagline || "").toLowerCase().includes(n),
        )
      : agents;
    return list.slice(0, 60);
  }, [agents, q]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
        style={{ color: accent }}
      >
        {label ?? tt("＋ 成员")}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tt("搜 agent…")}
              className="mb-1.5 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] outline-none focus:border-sky-400"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto">
              {filtered.map((a) => (
                <button
                  key={a.agent_id}
                  type="button"
                  onClick={() => {
                    onPick(a);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-slate-600 hover:bg-slate-50"
                  title={a.tagline}
                >
                  <span>{a.icon || "✦"}</span>
                  <span className="truncate">{a.name}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="px-2 py-3 text-center text-[12px] text-slate-400">
                  {tt("没有匹配的 agent")}
                </p>
              )}
            </div>
            {onCreate && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreate();
                }}
                className="mt-1 w-full rounded-lg border border-dashed border-sky-300 bg-sky-50/60 px-2 py-1.5 text-[12px] font-medium text-sky-700 hover:bg-sky-50"
              >
                {tt("＋ 创建 agent")}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 点节点 → 居中 prompt/工作弹窗（SkillPromptPanel modal，与 image 站同款）。
function NodeModal({
  agentId,
  name,
  icon,
  tagline,
  category,
  accent,
  work,
  onClose,
  onDelete,
}: {
  agentId: string;
  name: string;
  icon: string;
  tagline?: string;
  category?: string;
  accent: string;
  work?: ReactNode;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const tt = useUI();
  return (
    <SkillPromptPanel
      agentId={agentId}
      name={name}
      tagline={tagline}
      icon={icon}
      category={category}
      accent={accent}
      variant="modal"
      open
      onClose={onClose}
      onDelete={onDelete}
      deleteLabel={onDelete ? tt("删除节点") : undefined}
      footerSlot={work}
    />
  );
}

// 内层（需在 ReactFlowProvider 里用 useReactFlow）。
function CanvasInner({
  graph,
  agents,
  pickableAgents,
  onGraphChange,
  nodeStatus,
  renderNodeWork,
  onCreateAgent,
  readOnly = false,
  accent = "#0ea5e9",
  addLabel,
  topRightExtra,
  emptyHint,
}: OrgCanvasProps) {
  const tt = useUI();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [openNode, setOpenNode] = useState<Node<NodeData> | null>(null);
  const idSeq = useRef(1);
  // 防止把「载入图 → setNodes」这一步当成用户改动又回调 onGraphChange 造成回环。
  const loadingRef = useRef(false);
  const graphSig = useRef("");

  const agentMap = agents;
  const pickable = useMemo(
    () => pickableAgents ?? Object.values(agents),
    [pickableAgents, agents],
  );

  // 状态查（先按 node.id，再按 agent_id）。
  const statusOf = useCallback(
    (nodeId: string, agentId: string): OrgNodeStatus | undefined =>
      nodeStatus?.[nodeId] ?? nodeStatus?.[agentId],
    [nodeStatus],
  );

  // graph → ReactFlow 节点/边。
  const loadGraph = useCallback(
    (g: OrgGraph) => {
      loadingRef.current = true;
      const rfNodes: Node<NodeData>[] = (g.nodes || []).map((n, i) => {
        const a = agentMap[n.agent_id];
        return {
          id: n.id,
          type: "agent",
          position: { x: n.x ?? (i % 4) * (NODE_W + GRID), y: n.y ?? Math.floor(i / 4) * (NODE_H + GRID * 2) },
          data: {
            agentId: n.agent_id,
            name: a?.name || n.agent_id,
            icon: a?.icon || "✦",
            hasSkill: Boolean(a?.hasSkill),
            status: statusOf(n.id, n.agent_id),
          },
        };
      });
      const center: Record<string, { x: number; y: number }> = {};
      for (const n of g.nodes || []) {
        center[n.id] = { x: (n.x ?? 0) + NODE_W / 2, y: (n.y ?? 0) + NODE_H / 2 };
      }
      const rfEdges: Edge[] = (g.edges || []).map((e, i) => {
        const s = center[e.source];
        const t = center[e.target];
        const h =
          s && t ? nearestHandles(s.x, s.y, t.x, t.y) : { sourceHandle: "b", targetHandle: "t-t" };
        return {
          id: `e${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          sourceHandle: h.sourceHandle,
          targetHandle: h.targetHandle,
          label: e.label || "",
          labelStyle: { fontSize: 11, fill: "#475569" },
          labelBgStyle: { fill: "#f8fafc" },
          labelBgPadding: [4, 2] as [number, number],
          labelBgBorderRadius: 4,
          style: { stroke: "#94a3b8", strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
        };
      });
      const maxId = (g.nodes || []).reduce((m, n) => {
        const num = parseInt(String(n.id).replace(/\D/g, ""), 10);
        return Number.isFinite(num) ? Math.max(m, num) : m;
      }, 0);
      idSeq.current = maxId + 1;
      setNodes(rfNodes);
      setEdges(rfEdges);
      requestAnimationFrame(() => {
        try {
          rf.fitView({ padding: 0.18, duration: 200 });
        } catch {
          /* rf 尚未就绪 */
        }
        loadingRef.current = false;
      });
    },
    [rf, setNodes, setEdges, agentMap, statusOf],
  );

  // 外部 graph 变化（签名变）→ 重载。签名只含结构（节点 id/agent/位置 + 边），不含状态。
  useEffect(() => {
    const sig = JSON.stringify({
      n: (graph.nodes || []).map((n) => [n.id, n.agent_id, n.x, n.y]),
      e: (graph.edges || []).map((e) => [e.source, e.target, e.label]),
    });
    if (sig === graphSig.current) return;
    graphSig.current = sig;
    loadGraph(graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // 实时状态变化 → 只更新节点 data.status（不重载整图，避免打断拖拽）。
  useEffect(() => {
    setNodes((nd) =>
      nd.map((n) => {
        const st = statusOf(n.id, n.data.agentId);
        return st === n.data.status ? n : { ...n, data: { ...n.data, status: st } };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeStatus]);

  // 当前画布 → graph，回调宿主。
  const emit = useCallback(
    (nd: Node<NodeData>[], ed: Edge[]) => {
      if (!onGraphChange) return;
      const g: OrgGraph = {
        nodes: nd.map((n) => ({
          id: n.id,
          agent_id: n.data.agentId,
          x: Math.round(n.position.x),
          y: Math.round(n.position.y),
        })) as OrgGraphNode[],
        edges: ed.map((e) => ({
          source: e.source,
          target: e.target,
          label: typeof e.label === "string" ? e.label : "",
        })),
        entry: nd[0]?.id,
      };
      onGraphChange(g);
    },
    [onGraphChange],
  );

  // 拖动/删除节点后 → 回调（跳过载入触发）。
  useEffect(() => {
    if (loadingRef.current) return;
    emit(nodes, edges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onConnect = useCallback(
    (c: Connection) => {
      if (readOnly) return;
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            label: "",
            labelStyle: { fontSize: 11, fill: "#475569" },
            labelBgStyle: { fill: "#f8fafc" },
            labelBgPadding: [4, 2] as [number, number],
            labelBgBorderRadius: 4,
            style: { stroke: "#94a3b8", strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
          },
          eds,
        ),
      );
    },
    [readOnly, setEdges],
  );

  const dropAgent = useCallback(
    (a: OrgCanvasAgent) => {
      const id = `n${idSeq.current++}`;
      // 简单避让：按已有节点数网格排布。
      const count = nodes.length;
      const x = (count % 4) * (NODE_W + GRID) + GRID;
      const y = Math.floor(count / 4) * (NODE_H + GRID * 2) + GRID;
      setNodes((nd) => [
        ...nd,
        {
          id,
          type: "agent",
          position: { x, y },
          data: {
            agentId: a.agent_id,
            name: a.name,
            icon: a.icon || "✦",
            hasSkill: Boolean(a.hasSkill),
            justAdded: true,
          },
        },
      ]);
      // 数拍后去掉发光。
      setTimeout(() => {
        setNodes((nd) =>
          nd.map((n) => (n.id === id ? { ...n, data: { ...n.data, justAdded: false } } : n)),
        );
      }, 1600);
    },
    [nodes.length, setNodes],
  );

  const removeNode = useCallback(
    (nodeId: string) => {
      setNodes((nd) => nd.filter((n) => n.id !== nodeId));
      setEdges((ed) => ed.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setOpenNode(null);
    },
    [setNodes, setEdges],
  );

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_e, n) => setOpenNode(n as Node<NodeData>)}
        nodeTypes={NODE_TYPES}
        snapToGrid
        snapGrid={[GRID, GRID]}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} color="#cbd5e1" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-white" style={{ width: 120, height: 78 }} />
      </ReactFlow>

      {nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center p-8 text-center">
          <p className="text-[13px] text-slate-400">
            {emptyHint ??
              (readOnly ? (
                tt("这支组织还没有成员。")
              ) : (
                <>
                  {tt("画布是空的。")}
                  <br />
                  {tt("点右上「＋ 成员」从 agent 里挑。")}
                </>
              ))}
          </p>
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/70 px-3 py-1 text-[11px] text-white">
          {readOnly
            ? tt("点节点看该成员的 prompt 与正在做的工作")
            : tt("拖节点四周圆点连到另一个节点 · 点节点看 prompt/工作 · 加成员点右上")}
        </div>
      )}

      {!readOnly && (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5">
          {topRightExtra}
          <AgentPicker
            agents={pickable}
            onPick={dropAgent}
            onCreate={onCreateAgent}
            label={addLabel}
            accent={accent}
          />
        </div>
      )}

      {openNode && (
        <NodeModal
          agentId={openNode.data.agentId}
          name={openNode.data.name}
          icon={openNode.data.icon}
          tagline={agentMap[openNode.data.agentId]?.tagline}
          category={agentMap[openNode.data.agentId]?.category}
          accent={accent}
          work={renderNodeWork?.(openNode.data.agentId)}
          onClose={() => setOpenNode(null)}
          onDelete={readOnly ? undefined : () => removeNode(openNode.id)}
        />
      )}
    </div>
  );
}

/** organization 节点图画布（团队/组织通用）。用 ReactFlowProvider 包裹以便内部用 useReactFlow。 */
export function OrgCanvas(props: OrgCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
