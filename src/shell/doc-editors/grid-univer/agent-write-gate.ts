/**
 * agent 指令面的**唯一**写入决策点：没有审阅令牌，一个字都不进 Univer。
 *
 * ## 这个文件为什么存在
 *
 * V3-red-3 判的是「假停写」：上一版 `GridUniverStage` 的 `run()` 里，
 * `grid.set-cell` 造了一份提案却从不交出去（唯一消费方是 `Boolean(proposal)`），
 * 而插入行/列、排序、加表这些**直接调 Facade 当场改表**。于是界面说「已送审阅」，
 * 审阅面板却是空的；而用户以为要自己点头的那些改动，早就落地了。
 *
 * 根因不是漏了一行 `submit`，是**「要不要写」这个判断散在 run() 的各条分支里**：
 * 只要有一条分支忘了判，那条路就是敞开的，而且没有任何东西会告诉你。
 * 所以这里把它收成一个函数、一条路：`runGridAgentCommand` 是 agent 能碰到
 * Facade 的唯一入口，写与不写在同一个 `if` 上分岔，测试盯得住。
 *
 * ## 令牌为什么是「参数里的一次性 nonce」，而不是读宿主的 applyDepth
 *
 * 宿主闸（`agent-review/gate.ts`）自己有一个模块级 `applyDepth`，`withReviewApply()`
 * 期间大于 0。但它**没有导出读取口**，而 `agent-review/*` 是 W02 的面，本批不许我改。
 * 如果我在编辑器侧另起一个计数器，宿主接受提案时我这边仍然是 0 —— 我会把同一条提案
 * 再 park 一次，用户点一百次接受也落不了地。
 *
 * 实读宿主的接受路径（`AgentConsole.tsx:231-234`、`AgentChat.tsx:755`）：
 *
 * ```
 * applyParkedReview(currentPluginCommandSurface(), parked)
 *   → withReviewApply(() => surface.run(parked.proposal.commandId, parked.params))
 * ```
 *
 * 两件事因此成立：① 接受时调的是**未包闸的原始 surface**，也就是本文件；
 * ② `params` 逐字就是我 park 时给的那一份。⇒ 我 park 时往 `params` 里放一个
 * 随机一次性 nonce，宿主原路把它递回来，我凭 nonce 才写。
 *
 * 这是一个**能力令牌**，不是一个开关：nonce 只存在本模块的 `liveTokens` 里，
 * agent 那一侧从头到尾看不到它（审阅面板渲染的是 proposal，不是 params），
 * 猜不中就写不了；用一次就烧掉，同一份令牌重放第二次无效；令牌与 commandId 绑定，
 * 拿「改一格」批下来的令牌去调「删除所选行」同样无效。
 */
import { gateSurfaceForAgent } from "../../agent-review/gate";
import {
  createReviewSession,
  type ParkedReview,
} from "../../agent-review/session";
import type {
  PluginCommandResult,
  PluginCommandSpec,
} from "../../plugin-command/types";
import {
  GRID_UNIVER_COMMANDS,
  gridUniverCommand,
  runGridUniverCommand,
  type GridFacadePort,
  type GridUniverCommand,
  type GridUniverCommandArgs,
} from "./facade-commands";
import {
  buildGridReviewProposal,
  buildGridStructureProposal,
} from "./l4-chips";

/** 审阅令牌在 `parked.params` 里的键名。宿主原样转发，不认识它。 */
export const GRID_APPLY_TOKEN_KEY = "__gridReviewApply";

/**
 * 「这条改动没有可回滚的反向命令」的哨兵，放在 `inverseParams` 里。
 *
 * 契约的 `invertParked` 回滚时沿用**同一个 commandId**，只把 params 换成
 * `inverseParams`。对「改一格」成立（反向就是写回原值），对「插入一行」不成立
 * ——它的反向是 `deleteRows`，是另一条命令，契约里没有表达位。
 * 与其让回滚**再插一行**（那是把表越滚越乱），不如当场说清楚做不到。
 */
export const GRID_NO_INVERSE = "__grid-no-inverse__";

/** agent 能调、但**不改文档**的那两条。其余带执行器的一律按会改文档处置。 */
export const GRID_AGENT_READONLY_COMMANDS: readonly string[] = [
  "grid.read-cell",
  "grid.select-cell",
];

const READONLY_SET = new Set(GRID_AGENT_READONLY_COMMANDS);

// ── 令牌 ────────────────────────────────────────────────────────────────────

/** 活着的令牌：token → 它被批准执行的那条 commandId。 */
const liveTokens = new Map<string, string>();

/** 同一时刻最多留这么多张未兑现的令牌，免得长跑会话里无限堆积。 */
const MAX_LIVE_TOKENS = 8;

function randomToken(): string {
  const webCrypto = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (typeof webCrypto?.randomUUID === "function") {
    return `gat-${webCrypto.randomUUID()}`;
  }
  const bytes = (
    globalThis as {
      crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array };
    }
  ).crypto?.getRandomValues?.(new Uint8Array(16));
  if (bytes) {
    return `gat-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  // 没有 WebCrypto 的环境（老浏览器、非安全上下文）才走到这里。
  return `gat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function mintApplyToken(commandId: string): string {
  const token = randomToken();
  liveTokens.set(token, commandId);
  while (liveTokens.size > MAX_LIVE_TOKENS) {
    const oldest = liveTokens.keys().next().value;
    if (oldest === undefined) break;
    liveTokens.delete(oldest);
  }
  return token;
}

/**
 * 手上这批参数带的令牌，是不是**这条命令**的、且还没用过。
 *
 * 一次性：核过就删。这不是洁癖 —— 不删的话，agent 只要把上一次接受时看到的
 * 那次调用重放一遍，就能在用户没点头的情况下再写一次。
 */
export function consumeGridApplyToken(
  commandId: string,
  params: Record<string, unknown> | undefined,
): boolean {
  const raw = params?.[GRID_APPLY_TOKEN_KEY];
  if (typeof raw !== "string" || raw.length === 0) return false;
  if (liveTokens.get(raw) !== commandId) return false;
  liveTokens.delete(raw);
  return true;
}

/** 只给测试用：清空令牌，让每个用例从零开始。 */
export function resetGridApplyTokens(): void {
  liveTokens.clear();
}

// ── 宿主正在落地一条已接受的审阅吗 ──────────────────────────────────────────

/**
 * 探针专用的隔离审阅会话：**绝不能是 `hostReviewSession`**，
 * 否则探一次就往用户的审阅面板里塞一条假提案。
 */
const probeSession = createReviewSession();

const PROBE_SPEC = {
  id: "grid.apply-probe",
  label: "探针",
  summary: "探针",
  mutates: true,
} as const;

/**
 * 宿主此刻是不是正在把一条**用户已接受**的审阅落地。
 *
 * ## 为什么需要它
 *
 * 我的令牌管得住 agent 直接下的指令，但管不住另一条合法路径：W02 的宿主闸
 * （`gateSurfaceForAgent`）包在我外面时，agent 那次调用**根本到不了我这里**
 * ——宿主自己先 park 了一份提案。等用户点接受，宿主走
 * `applyParkedReview(rawSurface, hostParked)`，这才第一次调到我，而
 * `hostParked.params` 里当然没有我的令牌。
 *
 * 于是会出现一个很难查的产品故障：**用户点了接受，表格没变，审阅面板里又多出
 * 一条一模一样的提案。** 点一百次都是这个结果。
 *
 * ## 为什么是探针而不是读一个变量
 *
 * 宿主的 apply 状态是 `gate.ts` 里的模块级 `applyDepth`，**没有导出读取口**，
 * 而 `agent-review/*` 是 W02 的面，本批不许我改。所以这里用它**已经导出**的
 * `gateSurfaceForAgent` 反推：闸在 `applyDepth > 0` 时会直接把 `run` 透传给
 * 里层 surface，否则会去 park。拿一个隔离会话 + 一个一次性假 surface 走一遍，
 * 看里层有没有被调到，就知道现在是不是 apply 期。
 *
 * 两点让这件事可以接受：
 * - **无副作用**：假 surface 不碰真表格，提案落在 `probeSession` 而不是用户面板；
 * - **失败朝安全一侧倒**：万一上游把那个分支改到 `await` 之后，探针会返回
 *   `false`，结果是**多排一次审阅**，而不是多写一次表格。
 *
 * 正解仍然是宿主导出一个 `reviewApplyHeld()`，已写进 `signals/W03-request.md` R3；
 * 那条落地后这个函数应当整个删掉，改成一行 import。
 */
export function gridHostApplyInProgress(): boolean {
  let passedThrough = false;
  const probe = gateSurfaceForAgent(
    {
      editorId: "grid-apply-probe",
      describe: () => [{ ...PROBE_SPEC }],
      state: () => ({ revision: 0 }),
      run: () => {
        passedThrough = true;
        return Promise.resolve({ ok: true, message: "" });
      },
    },
    probeSession,
  );
  void probe.run(PROBE_SPEC.id, {});
  if (!passedThrough) probeSession.markDiscarded();
  return passedThrough;
}

// ── 命令分类 ────────────────────────────────────────────────────────────────

/**
 * 这条命令会不会改文档。
 *
 * 判据是「有没有执行器」而不是「在不在某张白名单上」：新加一条带 `run` 的命令，
 * 默认就被当成会改文档、默认就要过审阅。**默认安全的那一侧**，
 * 才不会因为有人忘了往白名单里补一行而漏出去。
 */
export function gridCommandMutates(command: GridUniverCommand): boolean {
  return Boolean(command.run) && !READONLY_SET.has(command.id);
}

function specSummary(command: GridUniverCommand): string {
  return gridCommandMutates(command)
    ? `「${command.label}」会改表格；改动先进审阅，你点接受之后才写进去。`
    : `「${command.label}」只读表格，不改内容。`;
}

/**
 * agent 看得见的指令表。
 *
 * **凡是有执行器的都放出来**，不再只放 `layer === "agent"` 那 7 条。
 * 上一版把 L1 的加粗/对齐/颜色、L2 的行列结构与条件格式全挡在 agent 之外，
 * 结果是「让 agent 把这一列标红」这种最普通的请求，产品里根本没有对应的指令 ——
 * 而这些执行器早就写好了，只是没人放它们出门。放出来之后走的是同一条审阅闸，
 * 不多开一个口子。
 */
export function gridAgentCommandSpecs(): PluginCommandSpec[] {
  return GRID_UNIVER_COMMANDS.filter((command) => command.run).map(
    (command) => ({
      id: command.id,
      label: command.label,
      summary: specSummary(command),
      mutates: gridCommandMutates(command),
    }),
  );
}

/** 会改文档、且 agent 调得到的那批 id。闸门逐条遍历它。 */
export function gridMutatingAgentCommandIds(): string[] {
  return GRID_UNIVER_COMMANDS.filter(
    (command) => command.run && gridCommandMutates(command),
  ).map((command) => command.id);
}

// ── 参数 ────────────────────────────────────────────────────────────────────

function toCommandArgs(
  params: Record<string, unknown> | undefined,
): GridUniverCommandArgs {
  const args: GridUniverCommandArgs = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (key === GRID_APPLY_TOKEN_KEY) continue;
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      args[key] = value;
    }
  }
  return args;
}

function intArg(
  params: Record<string, unknown> | undefined,
  key: string,
): number {
  const value = Number(params?.[key] ?? 0);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

const ARG_LABELS: Record<string, string> = {
  row: "行",
  column: "列",
  count: "数量",
  value: "值",
  value2: "上限",
  name: "名称",
  direction: "方向",
  on: "开",
  operator: "条件",
  behavior: "违规时",
  kind: "类型",
  type: "数据类型",
  decimals: "小数位",
  color: "文字色",
  background: "底色",
  bold: "粗体",
};

function describeArgs(args: GridUniverCommandArgs): string {
  const parts = Object.entries(args)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${ARG_LABELS[key] || key}=${String(value)}`);
  return parts.length ? `（${parts.join("，")}）` : "";
}

/**
 * 选区的 A1 写法，给审阅面板上的人看：`A1` 或 `A1:C5`。
 *
 * L1/L2 的执行器作用在**选区**而不是参数里的行列（`port.range` / `port.selection`），
 * 所以提案上必须写清楚它要动哪一片 —— 否则面板上只有「加粗」两个字，
 * 用户根本不知道加粗会落在哪儿。
 *
 * ⚠️ **这句话解决的是「看得见」，不是「不会跑偏」**：真正落地时用的仍然是
 * 那一刻的实时选区。用户在审阅期间挪了选区，接受后就会作用到新选区上。
 * 这条残留缺口写在 `verdicts/W03-redfix.md` 的「还有什么没做到」里，没有粉饰。
 */
export function gridSelectionAddress(selection: {
  startRow: number;
  endRow: number;
  startColumn: number;
  endColumn: number;
}): string {
  const head = `${gridColumnLetter(selection.startColumn)}${selection.startRow + 1}`;
  const tail = `${gridColumnLetter(selection.endColumn)}${selection.endRow + 1}`;
  return head === tail ? head : `${head}:${tail}`;
}

/** 0 → `A`，25 → `Z`，26 → `AA`。审阅面板上给人看的地址。 */
export function gridColumnLetter(index: number): string {
  let n = Math.max(0, Math.floor(index)) + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

// ── 入口 ────────────────────────────────────────────────────────────────────

export interface GridAgentRunInput {
  id: string;
  params?: Record<string, unknown>;
  /** 活着的 Facade 端口；拿不到就是内核还没起来。 */
  port: GridFacadePort | null;
  /** 当前文档版本号。提案带的是**尚未落地**的那一版（规范 §7 判据 3）。 */
  revision: number;
  /** 只读态（存量文档尚未转换）。 */
  readonly: boolean;
  readonlyNotice: string;
  /** 宿主收件箱。生产上就是 `submitAgentReviewProposal`。 */
  submit: (parked: ParkedReview, liveRevision: number) => "ok" | "invalid" | "stale";
  /** 真的写进去之后调一次，让宿主推进 revision / 脏标记。 */
  onWrite?: () => void;
}

const NOT_READY: PluginCommandResult = {
  ok: false,
  message: "表格内核还没准备好。",
};

/**
 * agent 下的一条指令。**这是 agent 能碰到 Facade 的唯一入口。**
 *
 * 五条出路，写在一处好数：
 * 1. 不认识的 id → 不写；
 * 2. 只读命令（读格子、选格子）→ 直接执行，本来就不改文档；
 * 3. 带着有效审阅令牌 → 这是用户点了接受，真写；
 * 4. 回滚哨兵 → 说清这条结构改动没法从审阅面板回滚，不写；
 * 5. 其余（agent 直接下的会改文档的指令）→ **park 成审阅提案，不写。**
 *
 * 第 5 条里一次 Facade 调用都没有 —— 这正是 `grid-univer-agent-review-gate`
 * 那条闸逐条盯着的东西。
 */
export function runGridAgentCommand(
  input: GridAgentRunInput,
): PluginCommandResult {
  const { id, params, port, revision, readonly } = input;
  const command = gridUniverCommand(id);
  if (!command || !command.run) {
    return {
      ok: false,
      message: `表格里没有「${id}」这条可执行的命令。`,
      revision,
    };
  }

  // ① 只读命令：不改文档，不必进审阅。
  if (!gridCommandMutates(command)) {
    if (!port) return { ...NOT_READY, revision };
    const outcome = runGridUniverCommand(id, port, toCommandArgs(params));
    return {
      ok: outcome.ok,
      message: outcome.ok ? "已读取。" : outcome.reason,
      revision,
    };
  }

  // ② 存量只读文档：连提案都不该有，先转换。
  if (readonly) {
    return { ok: false, message: input.readonlyNotice, revision };
  }

  // ③ 回滚哨兵：说做不到，而不是把同一条改动再执行一遍。
  if (params?.[GRID_APPLY_TOKEN_KEY] === GRID_NO_INVERSE) {
    return {
      ok: false,
      message: `「${command.label}」这类结构改动没法从审阅面板回滚，请用编辑器的撤销。表格一个字没改。`,
      revision,
    };
  }

  // ④ 用户点过接受，这才写。两种形态都算数：我自己发的一次性令牌，
  //    或者宿主闸正在落地一条它自己 park 的、已被接受的提案。
  if (consumeGridApplyToken(id, params) || gridHostApplyInProgress()) {
    if (!port) return { ...NOT_READY, revision };
    const outcome = runGridUniverCommand(id, port, toCommandArgs(params));
    if (!outcome.ok) return { ok: false, message: outcome.reason, revision };
    input.onWrite?.();
    return { ok: true, message: "已按审阅结果写入表格。", revision: revision + 1 };
  }

  // ⑤ agent 直接下的改动：只 park 成提案，**一次 Facade 都不调**。
  return parkGridAgentChange(command, input);
}

function parkGridAgentChange(
  command: GridUniverCommand,
  input: GridAgentRunInput,
): PluginCommandResult {
  const { id, params, port, revision } = input;
  const args = toCommandArgs(params);
  const isCellWrite = id === "grid.set-cell";

  const forward = mintApplyToken(id);
  let proposal;
  let inverseParams: Record<string, unknown>;

  if (isCellWrite) {
    const row = intArg(params, "row");
    const column = intArg(params, "column");
    const after = String(params?.value ?? "");
    // 读原值是**读**，不需要令牌；审阅面板要拿它显示「A1: 12 → 34」。
    // 拿不到端口就诚实留空，不编一个 before 出来。
    const before = readCellText(port, row, column);
    const address = `${gridColumnLetter(column)}${row + 1}`;
    proposal = buildGridReviewProposal({
      proposalId: `grid-set-cell-${revision}-${address}-${forward.slice(-8)}`,
      commandId: id,
      changes: [{ address, before, after }],
      revision,
    });
    // 「改一格」的反向是「写回原值」，同一条命令，表达得出来 ⇒ 真发一张令牌。
    inverseParams = {
      row,
      column,
      value: before,
      [GRID_APPLY_TOKEN_KEY]: mintApplyToken(id),
    };
  } else {
    // L1/L2 的执行器作用在选区上，提案里必须点名是哪一片。
    const scope =
      command.layer === "L1" || command.layer === "L2"
        ? `，作用范围 ${port ? gridSelectionAddress(port.selection) : "当前选区"}`
        : "";
    proposal = buildGridStructureProposal({
      proposalId: `grid-cmd-${id}-${revision}-${forward.slice(-8)}`,
      commandId: id,
      label: command.label,
      before: `表格保持现状，「${command.label}」尚未执行。`,
      after: `将执行「${command.label}」${describeArgs(args)}${scope}。`,
      revision,
    });
    inverseParams = { ...args, [GRID_APPLY_TOKEN_KEY]: GRID_NO_INVERSE };
  }

  if (!proposal) {
    liveTokens.delete(forward);
    return {
      ok: false,
      message: "这条改动没法送进审阅（提案没通过契约校验），表格一个字没改。",
      revision,
    };
  }

  const outcome = input.submit(
    {
      proposal,
      params: { ...args, [GRID_APPLY_TOKEN_KEY]: forward },
      inverseParams,
      editorId: "grid",
    },
    revision,
  );
  if (outcome !== "ok") {
    liveTokens.delete(forward);
    return {
      ok: false,
      message:
        outcome === "stale"
          ? "提案到达前表格已经变了，这条改动不能接受。表格一个字没改。"
          : "审阅提案不合法，表格一个字没改。",
      revision,
    };
  }
  return {
    ok: true,
    message: "改动已送审阅，你点接受之前不会写进表格。",
    revision,
  };
}

function readCellText(
  port: GridFacadePort | null,
  row: number,
  column: number,
): string {
  if (!port) return "";
  try {
    const value = port.sheet.getRange(row, column).getValue();
    return value === null || value === undefined ? "" : String(value);
  } catch {
    return "";
  }
}
