/**
 * 工作流专业模式的托管 iframe：地址、信封、可运行性判定（W15 判据 2）。
 *
 * 内核是 **Langflow（MIT）**，跑在 W18 分给本件的 `https://flow.oceanleo.app`
 * （`signals/W18-domains.md` 第 21 行：容器 `oceanleo-flow-langflow` →
 * `127.0.0.1:8126`，cookie 只准自身 host-only）。
 *
 * ## 三条约束，写在最前面
 *
 * 1. **不改 `hosted-editor-origins.ts`**（W01 的面，六个 origin 已放行）。
 *    这里只**用**那张表，并且用的是 `HOSTED_EDITOR_ORIGINS` 里过滤出来的那一条，
 *    不另写一个字符串常量当事实源——写死两处，迟早只改一处。
 * 2. **不给同源沙箱。** Langflow 是未修改的第三方整站应用；
 *    `embedEditorFrameSandbox()` 对六件返回不可信档（W01 契约 v2.1 §B），
 *    这里不做任何绕过。用户内容与第三方代码只从 `oceanleo.app` 出，
 *    绝不从 `oceanleo.com` 出（`[policy:security.untrusted-content-domain]`）。
 * 3. **iframe 内零凭据。** 持久化全走 postMessage：宿主发 `init` 把流程送进去，
 *    编辑器发 `recovery-snapshot` 把流程带回来，宿主拿自己的凭据落库。
 */

import { EDITOR_PROTOCOL, buildEditorEmbedUrl } from "../editor-protocol";
import {
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../editor-sandbox-origin";
import { HOSTED_EDITOR_ORIGINS } from "../hosted-editor-origins";
import { DEFAULT_EDITOR_MODE } from "../hosted-editor/index";
import {
  OCEANLEO_LANGFLOW_NODE_TYPE,
  type LangflowFlow,
} from "./langflow-flow-json";

/**
 * 工作流件的托管 origin。
 *
 * **从 W01 那张白名单里挑出来，而不是自己写一遍。** 万一哪天六件的域整体搬家，
 * 白名单一改这里跟着改；写死一个字符串会让这个文件成为第二个事实源。
 * 挑不出来（表被改了、这一条被摘了）时返回空串，调用方据此 fail closed。
 */
export const WORKFLOW_LANGFLOW_EMBED_ORIGIN: string =
  HOSTED_EDITOR_ORIGINS.find(
    (origin) => origin === "https://flow.oceanleo.app",
  ) || "";

/**
 * 把用户给的 base 收敛到那一个 origin。
 *
 * 只接受「就是那个 origin，可带一段路径」。带查询串 / 片段 / 内嵌凭据的一律
 * 退回裸 origin——这三种形状进 iframe src 都是往第三方整站里塞东西的入口。
 */
export function workflowLangflowEmbedBase(override?: string): string {
  const fallback = WORKFLOW_LANGFLOW_EMBED_ORIGIN;
  if (!override) return fallback;
  try {
    const url = new URL(override);
    if (!fallback || url.origin !== fallback) return fallback;
    if (url.search || url.hash || url.username || url.password) return fallback;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}` || fallback;
  } catch {
    return fallback;
  }
}

/** 宿主今天能不能给工作流拼出 embed URL。拼不出就该退回普通模式并说明。 */
export function canBuildWorkflowLangflowEmbedUrl(base: string): boolean {
  return Boolean(base) && isTrustedEmbedEditorBase(base);
}

/** 专业模式 iframe 的 sandbox。必须走 W01 的函数，不许手写、不许加 same-origin。 */
export function workflowLangflowFrameSandbox(base?: string): string {
  return embedEditorFrameSandbox(workflowLangflowEmbedBase(base));
}

export function buildWorkflowLangflowEmbedUrl(opts: {
  instanceId: string;
  hostOrigin: string;
  assetUrl?: string;
  assetTitle?: string;
  extra?: Record<string, string>;
  base?: string;
}): string {
  const base = workflowLangflowEmbedBase(opts.base);
  if (!canBuildWorkflowLangflowEmbedUrl(base)) {
    throw new TypeError("flow.oceanleo.app 还不在宿主可信 embed 白名单里");
  }
  const extra = { ...(opts.extra || {}) };
  for (const key of Object.keys(extra)) {
    if (/(token|secret|key|password|cookie|authorization)/i.test(key)) {
      throw new TypeError("工作流 iframe URL 不许携带凭据字段");
    }
  }
  return buildEditorEmbedUrl(base, {
    instanceId: opts.instanceId,
    hostOrigin: opts.hostOrigin,
    assetUrl: opts.assetUrl,
    assetTitle: opts.assetTitle,
    assetKind: "document",
    extra,
  });
}

/**
 * `init` 的载荷：把当前流程送进专业模式。
 *
 * 契约把 `init` 当自由载荷（W01 §2 之外的字段由各件自定），这里发 `flow`
 * ——就是 `toLangflowFlow()` 的产物，容器里的第一方 adapter shim 拿它调
 * Langflow 自己的导入接口。**这里刻意不发任何 token、cookie 或素材直链凭据。**
 *
 * `mode` 恒为 `DEFAULT_EDITOR_MODE`（`normal`）：契约 R3 要求宿主每次装载都按
 * 普通模式起步，进专业模式只能靠随后那条 `set-mode`。**不在这里发明第二个开关。**
 */
export function buildWorkflowFlowInitEnvelope(
  instanceId: string,
  payload: { flow: LangflowFlow; readOnly: boolean; title?: string },
): Record<string, unknown> {
  if (!instanceId || instanceId.length > 128) {
    throw new TypeError("workflow hosted: instanceId 必须非空且 ≤128");
  }
  return {
    protocol: EDITOR_PROTOCOL,
    type: "init",
    instanceId,
    flow: payload.flow,
    readOnly: payload.readOnly === true,
    mode: DEFAULT_EDITOR_MODE,
    ...(payload.title ? { title: payload.title } : {}),
  };
}

// ── 可运行性 ───────────────────────────────────────────────────────────────

export type LangflowRunBlockerCode =
  | "flow-empty"
  | "flow-edge-dangling"
  | "flow-node-id-duplicated"
  | "flow-node-template-missing"
  | "flow-component-not-installed";

export interface LangflowRunBlocker {
  code: LangflowRunBlockerCode;
  message: string;
  at?: string;
}

export interface LangflowRunnability {
  /** 这份 flow 交给 Langflow 的执行引擎能不能跑起来。 */
  runnable: boolean;
  blockers: LangflowRunBlocker[];
}

/**
 * 这份 flow 在 Langflow 里跑不跑得起来，以及跑不起来的确切原因。
 *
 * **为什么要有这个函数**：判据 2 写的是「可运行」。「iframe 打开了」和
 * 「点运行真的会算」是两回事，而后者的前提在**数据里**就能判掉大半——
 * Langflow 的执行引擎按 `data.edges` 的 source/target 建图，指向不存在节点的边
 * 会让整次运行在后端抛异常，用户看到的是一条读不懂的 500。
 *
 * ⚠️ **最后一条 blocker 是本件今天真实的欠账，写在代码里而不是藏在交付说明里**：
 * `toLangflowFlow()` 产出的节点类型是 `OceanLeoWorkflowNode`，它是我们自己的
 * 组件类型，**必须由容器侧注册**（`LANGFLOW_COMPONENTS_PATH` 挂进去的第一方组件包，
 * 见 `signals/W15-container.md`）。容器没注册它，Langflow 能打开、能编辑、能保存，
 * 但点运行会报「组件不存在」。`componentsInstalled` 传 `false` 就会把这句话
 * 显式说出来，而不是让用户自己撞上去。
 */
export function assessLangflowRunnability(
  flow: LangflowFlow | null | undefined,
  opts: { componentsInstalled: boolean },
): LangflowRunnability {
  const blockers: LangflowRunBlocker[] = [];
  const nodes = flow?.data?.nodes;
  const edges = flow?.data?.edges;
  if (!Array.isArray(nodes) || nodes.length === 0) {
    blockers.push({
      code: "flow-empty",
      message: "这张流程图里一个节点都没有，没有东西可以运行。",
    });
    return { runnable: false, blockers };
  }
  const ids = new Set<string>();
  for (const node of nodes) {
    const id = String(node?.id || "");
    if (ids.has(id)) {
      blockers.push({
        code: "flow-node-id-duplicated",
        at: id,
        message: `有两个节点的 id 都是「${id}」，Langflow 建图时会互相覆盖。`,
      });
    }
    ids.add(id);
    if (!node?.data?.node?.template) {
      blockers.push({
        code: "flow-node-template-missing",
        at: id,
        message: `节点「${id}」没有参数表（template），Langflow 无法实例化它。`,
      });
    }
  }
  for (const edge of Array.isArray(edges) ? edges : []) {
    const source = String(edge?.source || "");
    const target = String(edge?.target || "");
    if (!ids.has(source) || !ids.has(target)) {
      blockers.push({
        code: "flow-edge-dangling",
        at: String(edge?.id || ""),
        message: `有一条连线接到了不存在的节点（${!ids.has(source) ? source : target}），运行会当场失败。`,
      });
    }
  }
  if (!opts.componentsInstalled) {
    const usesOwnComponent = nodes.some(
      (node) => node?.data?.type === OCEANLEO_LANGFLOW_NODE_TYPE,
    );
    if (usesOwnComponent) {
      blockers.push({
        code: "flow-component-not-installed",
        message: `专业模式这一侧还没有装上 ${OCEANLEO_LANGFLOW_NODE_TYPE} 组件包，所以现在只能编辑和保存，点「运行」会失败。`,
      });
    }
  }
  return { runnable: blockers.length === 0, blockers };
}
