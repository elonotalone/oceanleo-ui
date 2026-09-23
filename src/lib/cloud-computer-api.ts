"use client";

// ============================================================================
// @oceanleo/ui — 云电脑 REST 客户端（《契约》§4.1–4.3）
// ----------------------------------------------------------------------------
// 鉴权与网关 origin 与 `lib/agent.ts` 相同：Bearer + GATEWAY_BASE。
// 错误码是契约 §8 的小写闭集；不走 agent `authed`（它会把 code 收成大写）。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export const MOUNTED_COMPUTER_STORAGE_KEY = "oceanleo.cc.mounted";
export const MOUNTED_COMPUTER_NAME_STORAGE_KEY = "oceanleo.cc.mounted.name";

export class CloudComputerError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "CloudComputerError";
    this.code = code;
    this.status = status;
  }
}

export type MoneyAmount = {
  amount_minor: number;
  currency: string;
};

export type ComputerSource = "aliyun" | "byo";

export type ComputerStatus =
  | "pending"
  | "enrolled"
  | "active"
  | "removed"
  | "provisioning"
  | "running"
  | "stopping"
  | "stopped"
  | "starting"
  | "releasing"
  | "released"
  | "error";

export const COMPUTER_STATUS_LABEL: Record<string, string> = {
  pending: "等待安装",
  enrolled: "待确认",
  active: "已接入",
  removed: "已移除",
  provisioning: "开通中",
  running: "运行中",
  stopping: "停机中",
  stopped: "已停机",
  starting: "开机中",
  releasing: "释放中",
  released: "已释放",
  error: "出错",
};

export const COMPUTER_EVENT_KIND_LABEL: Record<string, string> = {
  "node.enrolled": "节点已注册",
  "node.confirmed": "主人已确认",
  "node.rejected": "已拒绝这台机器",
  "node.cert_renewed": "主机证书已续期",
  "node.auth_failed": "节点认证失败",
};

export type Computer = {
  id: string;
  name: string;
  source: ComputerSource;
  status: string;
  edition: string;
  region_id?: string | null;
  zone_id?: string | null;
  instance_id?: string | null;
  instance_type?: string | null;
  image_id?: string | null;
  system_disk_gb?: number | null;
  public_ip?: string | null;
  private_ip?: string | null;
  tier_id?: string | null;
  hourly_price_cny?: number | null;
  price_quote?: Record<string, unknown>;
  charge_status?: string;
  unpaid_since?: string | null;
  last_metered_at?: string | null;
  node_id?: string | null;
  node_version?: string | null;
  node_os?: string | null;
  node_arch?: string | null;
  node_hostname?: string | null;
  node_online: boolean;
  node_last_seen_at?: string | null;
  node_fingerprint?: string | null;
  node_kernel?: string | null;
  node_cpus?: number | null;
  node_mem_bytes?: number | null;
  node_run_as?: string | null;
  node_public_ip?: string | null;
  enrolled_at?: string | null;
  confirmed_at?: string | null;
  host_cert_expires_at?: string | null;
  created_at: string;
  updated_at: string;
  released_at?: string | null;
  cost_to_date?: MoneyAmount | null;
};

/** Dock / pickMountedId：自有 active 或阿里云 running，且主人已确认。 */
export function isMountable(computer: Computer): boolean {
  return (
    (computer.status === "active" || computer.status === "running") &&
    Boolean(computer.confirmed_at)
  );
}

export type CatalogRegion = {
  id: string;
  zone_id: string;
  label: string;
};

export type CatalogTier = {
  id: string;
  instance_type: string;
  vcpu: number;
  memory_gb: number;
  label: string;
  available: boolean;
  hourly: { cny: number; amount_minor: number; currency: string };
  monthly_estimate: MoneyAmount;
};

export type ComputerCatalog = {
  regions: CatalogRegion[];
  tiers: CatalogTier[];
  disk: {
    min_gb: number;
    max_gb: number;
    step_gb: number;
    hourly_per_gb: { cny: number; amount_minor: number; currency: string };
  };
  traffic: { per_gb: { cny: number; amount_minor: number; currency: string } };
  image: { id: string; label: string };
  cny_per_usd: number;
};

export type ComputerEvent = {
  id: number;
  computer_id: string;
  kind: string;
  detail: Record<string, unknown>;
  created_at: string;
};

export type UsageRow = {
  id: number;
  computer_id: string;
  hour_start: string;
  kind: string;
  quantity: number;
  unit_price_cny: number;
  amount_cny: number;
  amount_minor: number;
  currency: string;
  created_at: string;
};

export type UsageResponse = {
  items: UsageRow[];
  total: MoneyAmount;
  hourly_now: MoneyAmount;
};

export type UsageSummary = {
  total?: MoneyAmount;
  items?: UsageRow[];
  [key: string]: unknown;
};

export type TerminalSession = {
  id: string;
  title?: string;
  created_at?: string;
  cols?: number;
  rows?: number;
  alive?: boolean;
};

export type TerminalRecord = {
  id: string;
  title: string;
  created_at: string;
  alive: boolean;
  ended_at: string | null;
  exit_code: number | null;
  end_reason: "exit" | "closed" | "node_restart" | null;
  kind: "shell" | "cli";
  program: string | null;
  cwd: string | null;
  record_bytes: number;
  cols?: number;
  rows?: number;
};

export type TerminalRecordRead = {
  data_b64: string;
  offset: number;
  next_offset: number;
  total: number;
  alive: boolean;
};

export type NodeInfo = {
  version: string | null;
  latest_version: string | null;
  update_available: boolean;
  features: string[];
  online: boolean;
};

export type AgentSettings = {
  confirm_dangerous: boolean;
  oceanleo_tools: boolean;
  billing_paused: boolean;
};

export type OceanleoAgentStatus = {
  installed: boolean;
  version: string | null;
  token_active: boolean;
};

export type CliProgramOption = {
  key: string;
  label: string;
  type: "select" | "bool";
  choices?: Array<{ value: string; label: string }>;
  default: string | boolean;
};

export type CliProgram = {
  id: string;
  label: string;
  installed: boolean;
  version: string | null;
  supports_resume: boolean;
  options: CliProgramOption[];
};

export type CliChat = {
  id: string;
  title: string;
  cwd: string | null;
  updated_at: string;
};

export type InstallCommandResponse = {
  install_command: string;
  enroll_expires_at: string;
};

export type ByoCreateResponse = InstallCommandResponse & {
  computer: Computer;
};

function detailRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const detail = (payload as { detail?: unknown }).detail;
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  return payload as Record<string, unknown>;
}

function errorFromPayload(status: number, payload: unknown): CloudComputerError {
  const detail = detailRecord(payload);
  const codeRaw = detail && typeof detail.code === "string" ? detail.code.trim() : "";
  const messageRaw =
    detail && typeof detail.message === "string" ? detail.message.trim() : "";
  const code = codeRaw || `client_http_${status}`;
  const message = messageRaw || code;
  return new CloudComputerError(code, message, status);
}

export async function cloudComputerRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await accessToken();
  if (!token) {
    throw new CloudComputerError("client_unauthorized", "未登录", 401);
  }
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch {
    throw new CloudComputerError("client_network_error", "网络错误：无法连接到网关。", 0);
  }
  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    /* empty / non-JSON */
  }
  if (!res.ok) {
    throw errorFromPayload(res.status, payload);
  }
  return payload as T;
}

const ccRequest = cloudComputerRequest;

export function readMountedComputerId(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(MOUNTED_COMPUTER_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeMountedComputerId(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (!id) window.localStorage.removeItem(MOUNTED_COMPUTER_STORAGE_KEY);
    else window.localStorage.setItem(MOUNTED_COMPUTER_STORAGE_KEY, id);
  } catch {
    /* quota / private mode */
  }
}

export function readMountedComputerName(): string {
  if (typeof window === "undefined") return "";
  try {
    return (window.localStorage.getItem(MOUNTED_COMPUTER_NAME_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function writeMountedComputerName(name: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const shown = (name || "").trim();
    if (!shown) window.localStorage.removeItem(MOUNTED_COMPUTER_NAME_STORAGE_KEY);
    else window.localStorage.setItem(MOUNTED_COMPUTER_NAME_STORAGE_KEY, shown);
  } catch {
    /* quota / private mode */
  }
}

export function computerIdRequestField(explicit?: string | null): {
  computer_id?: string;
} {
  const id = (explicit ?? "").trim() || readMountedComputerId();
  return id ? { computer_id: id } : {};
}

export function terminalWsUrl(
  id: string,
  sessionId: string,
  token: string,
): string {
  const wsBase = GATEWAY_BASE.replace(/^http/i, "ws");
  const query = new URLSearchParams({
    session_id: sessionId,
    token,
  });
  return `${wsBase}/v1/computers/${encodeURIComponent(id)}/terminal?${query.toString()}`;
}

/** Same auth query as `terminalWsUrl`; path is the shell agent dialog. */
export function agentDialogWsUrl(
  id: string,
  sessionId: string | undefined,
  token: string,
): string {
  const wsBase = GATEWAY_BASE.replace(/^http/i, "ws");
  const query = new URLSearchParams({ token });
  if (sessionId) query.set("session_id", sessionId);
  return `${wsBase}/v1/computers/${encodeURIComponent(id)}/agent-dialog?${query.toString()}`;
}

export function nodeWsUrl(): string {
  const wsBase = GATEWAY_BASE.replace(/^http/i, "ws");
  return `${wsBase}/v1/computers/node/ws`;
}

export function nodeInstallScriptUrl(): string {
  return `${GATEWAY_BASE}/v1/computers/node/install.sh`;
}

export function nodeDownloadUrl(os: "linux", arch: "amd64" | "arm64"): string {
  return `${GATEWAY_BASE}/v1/computers/node/download/${os}-${arch}`;
}

export function nodeSha256SumsUrl(): string {
  return `${GATEWAY_BASE}/v1/computers/node/download/SHA256SUMS`;
}

export function listComputers() {
  return ccRequest<{ items: Computer[] }>("/v1/computers");
}

export function getCatalog() {
  return ccRequest<ComputerCatalog>("/v1/computers/catalog");
}

export function createAliyunComputer(body: {
  name: string;
  tier_id: string;
  disk_gb: number;
}) {
  return ccRequest<Computer>("/v1/computers/aliyun", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createByoComputer(body: { name: string }) {
  return ccRequest<ByoCreateResponse>("/v1/computers/byo", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getComputer(id: string) {
  return ccRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}`);
}

export function renameComputer(id: string, name: string) {
  return ccRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function stopComputer(id: string) {
  return ccRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
}

export function startComputer(id: string) {
  return ccRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}/start`, {
    method: "POST",
  });
}

export function deleteComputer(id: string) {
  return ccRequest<Computer>(`/v1/computers/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function listComputerEvents(id: string, limit = 50) {
  const query = new URLSearchParams({ limit: String(limit) });
  return ccRequest<{ items: ComputerEvent[] }>(
    `/v1/computers/${encodeURIComponent(id)}/events?${query.toString()}`,
  );
}

export function regenerateInstallCommand(id: string) {
  return ccRequest<InstallCommandResponse>(
    `/v1/computers/${encodeURIComponent(id)}/install-command`,
    { method: "POST" },
  );
}

export function confirmComputer(id: string) {
  return ccRequest<Computer>(
    `/v1/computers/${encodeURIComponent(id)}/confirm`,
    { method: "POST" },
  );
}

export function getNodeInstallScript() {
  return ccRequest<string>("/v1/computers/node/install.sh");
}

export function listTerminals(computerId: string) {
  return ccRequest<{ sessions: TerminalSession[] }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals`,
  );
}

export function openTerminal(
  computerId: string,
  body: { cols: number; rows: number; title?: string; as_task?: boolean },
) {
  return ccRequest<{ id: string; task_id?: string }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function closeTerminal(computerId: string, sessionId: string) {
  return ccRequest<{ ok?: boolean }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export function listTerminalsWithRecords(computerId: string) {
  return cloudComputerRequest<{
    sessions: TerminalRecord[];
    records_supported: boolean;
  }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals?include_ended=1`,
  );
}

export function openTerminalSession(
  computerId: string,
  body: {
    cols: number;
    rows: number;
    title?: string;
    command?: string;
    kind?: "shell" | "cli";
    program?: string;
    as_task?: boolean;
  },
) {
  return cloudComputerRequest<{ session: TerminalRecord }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function readTerminalRecord(
  computerId: string,
  sessionId: string,
  options: { offset?: number; limit?: number } = {},
) {
  const query = new URLSearchParams();
  if (options.offset !== undefined) query.set("offset", String(options.offset));
  if (options.limit !== undefined) query.set("limit", String(options.limit));
  const suffix = query.toString();
  return cloudComputerRequest<TerminalRecordRead>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals/${encodeURIComponent(sessionId)}/record${suffix ? `?${suffix}` : ""}`,
  );
}

export function deleteTerminalRecord(computerId: string, sessionId: string) {
  return cloudComputerRequest<{ ok: boolean }>(
    `/v1/computers/${encodeURIComponent(computerId)}/terminals/${encodeURIComponent(sessionId)}/record`,
    { method: "DELETE" },
  );
}

export function getNodeInfo(computerId: string) {
  return cloudComputerRequest<NodeInfo>(
    `/v1/computers/${encodeURIComponent(computerId)}/node`,
  );
}

export function upgradeNode(computerId: string) {
  return cloudComputerRequest<{
    ok: boolean;
    from: string | null;
    to: string;
  }>(`/v1/computers/${encodeURIComponent(computerId)}/node/upgrade`, {
    method: "POST",
  });
}

export function getAgentSettings(computerId: string) {
  return cloudComputerRequest<AgentSettings>(
    `/v1/computers/${encodeURIComponent(computerId)}/agent-settings`,
  );
}

export function patchAgentSettings(
  computerId: string,
  patch: Partial<AgentSettings>,
) {
  return cloudComputerRequest<AgentSettings>(
    `/v1/computers/${encodeURIComponent(computerId)}/agent-settings`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
}

export function getOceanleoAgent(computerId: string) {
  return cloudComputerRequest<OceanleoAgentStatus>(
    `/v1/computers/${encodeURIComponent(computerId)}/oceanleo-agent`,
  );
}

export function installOceanleoAgent(computerId: string) {
  return cloudComputerRequest<{ ok: boolean; version: string }>(
    `/v1/computers/${encodeURIComponent(computerId)}/oceanleo-agent/install`,
    { method: "POST" },
  );
}

export function uninstallOceanleoAgent(computerId: string) {
  return cloudComputerRequest<{ ok: boolean }>(
    `/v1/computers/${encodeURIComponent(computerId)}/oceanleo-agent`,
    { method: "DELETE" },
  );
}

export function listCliPrograms(computerId: string) {
  return cloudComputerRequest<{ programs: CliProgram[] }>(
    `/v1/computers/${encodeURIComponent(computerId)}/cli/programs`,
  );
}

export function listCliSessions(computerId: string, program: string) {
  const query = new URLSearchParams({ program });
  return cloudComputerRequest<{ supported: boolean; sessions: CliChat[] }>(
    `/v1/computers/${encodeURIComponent(computerId)}/cli/sessions?${query.toString()}`,
  );
}

export function launchCli(
  computerId: string,
  body: {
    program: string;
    resume_id?: string;
    options?: Record<string, string | boolean>;
    cols: number;
    rows: number;
  },
) {
  return cloudComputerRequest<{ session: TerminalRecord }>(
    `/v1/computers/${encodeURIComponent(computerId)}/cli/launch`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getCliTools(computerId: string) {
  return cloudComputerRequest<{
    programs: Record<"cursor" | "claude" | "codex", boolean>;
  }>(`/v1/computers/${encodeURIComponent(computerId)}/agent/cli-tools`);
}

export function setCliTools(
  computerId: string,
  program: "cursor" | "claude" | "codex",
  enabled: boolean,
) {
  return cloudComputerRequest<{
    ok: boolean;
    program: string;
    enabled: boolean;
  }>(`/v1/computers/${encodeURIComponent(computerId)}/agent/cli-tools`, {
    method: "PUT",
    body: JSON.stringify({ program, enabled }),
  });
}

export function getUsage(id: string, days = 30) {
  const query = new URLSearchParams({ days: String(days) });
  return ccRequest<UsageResponse>(
    `/v1/computers/${encodeURIComponent(id)}/usage?${query.toString()}`,
  );
}

export function getUsageSummary() {
  return ccRequest<UsageSummary>("/v1/computers/usage/summary");
}

export type CloudComputerClient = {
  listComputers: typeof listComputers;
  getCatalog: typeof getCatalog;
  createAliyunComputer: typeof createAliyunComputer;
  createByoComputer: typeof createByoComputer;
  getComputer: typeof getComputer;
  renameComputer: typeof renameComputer;
  stopComputer: typeof stopComputer;
  startComputer: typeof startComputer;
  deleteComputer: typeof deleteComputer;
  listComputerEvents: typeof listComputerEvents;
  regenerateInstallCommand: typeof regenerateInstallCommand;
  confirmComputer: typeof confirmComputer;
  listTerminals: typeof listTerminals;
  openTerminal: typeof openTerminal;
  closeTerminal: typeof closeTerminal;
  listTerminalsWithRecords: typeof listTerminalsWithRecords;
  openTerminalSession: typeof openTerminalSession;
  readTerminalRecord: typeof readTerminalRecord;
  deleteTerminalRecord: typeof deleteTerminalRecord;
  getNodeInfo: typeof getNodeInfo;
  upgradeNode: typeof upgradeNode;
  getAgentSettings: typeof getAgentSettings;
  patchAgentSettings: typeof patchAgentSettings;
  getOceanleoAgent: typeof getOceanleoAgent;
  installOceanleoAgent: typeof installOceanleoAgent;
  uninstallOceanleoAgent: typeof uninstallOceanleoAgent;
  listCliPrograms: typeof listCliPrograms;
  listCliSessions: typeof listCliSessions;
  launchCli: typeof launchCli;
  getCliTools: typeof getCliTools;
  setCliTools: typeof setCliTools;
  getUsage: typeof getUsage;
  getUsageSummary: typeof getUsageSummary;
};

export const cloudComputerApi: CloudComputerClient = {
  listComputers,
  getCatalog,
  createAliyunComputer,
  createByoComputer,
  getComputer,
  renameComputer,
  stopComputer,
  startComputer,
  deleteComputer,
  listComputerEvents,
  regenerateInstallCommand,
  confirmComputer,
  listTerminals,
  openTerminal,
  closeTerminal,
  listTerminalsWithRecords,
  openTerminalSession,
  readTerminalRecord,
  deleteTerminalRecord,
  getNodeInfo,
  upgradeNode,
  getAgentSettings,
  patchAgentSettings,
  getOceanleoAgent,
  installOceanleoAgent,
  uninstallOceanleoAgent,
  listCliPrograms,
  listCliSessions,
  launchCli,
  getCliTools,
  setCliTools,
  getUsage,
  getUsageSummary,
};
