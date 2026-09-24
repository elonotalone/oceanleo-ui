import type { Computer } from "../../lib/cloud-computer-api";

/**
 * 一台云电脑对用户而言只有这几种状态。所有展示（坞、我的设备、状态小窗）都从这里取，
 * 不再各自拼 `status` / `node_online` / `confirmed_at`。
 *
 * - provisioning   阿里云正在开机/装节点，还不能用
 * - pending_install 自有服务器：命令还没在机器上跑过（节点从未注册）
 * - pending_confirm 自有服务器：节点已注册，等主人核对指纹并确认
 * - ready          已接入且节点在线，可以开 Shell
 * - offline        已接入但节点此刻不在线
 * - stopped        阿里云已停机（不计费，需要开机）
 * - unpaid         欠费，已被冻结
 * - error          阿里云开机失败（可移除后重买）
 * - gone           已释放/已移除（列表里不该出现）
 */
export type ComputerDisplayState =
  | "provisioning"
  | "pending_install"
  | "pending_confirm"
  | "ready"
  | "offline"
  | "stopped"
  | "unpaid"
  | "error"
  | "gone";

export function computerDisplayState(computer: Computer): ComputerDisplayState {
  const status = computer.status;
  if (status === "released" || status === "removed" || status === "releasing") return "gone";
  if (status === "error") return "error";
  if ((computer.charge_status || "ok") === "unpaid") return "unpaid";
  if (status === "provisioning" || status === "starting") return "provisioning";
  if (status === "stopped" || status === "stopping") return "stopped";
  // 阿里云：实例已 running 但机内节点还没注册 → 仍在开通中；
  // 自有服务器：`status=active` 但从未注册/确认的行是 v1 遗留，对用户就是「还没接上」。
  if (!computer.enrolled_at) {
    return computer.source === "aliyun" ? "provisioning" : "pending_install";
  }
  if (!computer.confirmed_at) return "pending_confirm";
  if (status === "active" || status === "running") {
    return computer.node_online === true ? "ready" : "offline";
  }
  if (status === "enrolled" || status === "pending") {
    return computer.confirmed_at ? "offline" : "pending_confirm";
  }
  return "offline";
}

/** 已接入（主人确认过）的机器：进「我的设备 · 云电脑」正式列表，可挂载到坞上。 */
export function isConnectedComputer(computer: Computer): boolean {
  const state = computerDisplayState(computer);
  return state === "ready" || state === "offline" || state === "stopped" || state === "unpaid";
}

/** 还在接入途中（装命令 / 待确认 / 开机中）。开通失败不算接入中，也不上坞。 */
export function isPendingComputer(computer: Computer): boolean {
  const state = computerDisplayState(computer);
  return (
    state === "provisioning" ||
    state === "pending_install" ||
    state === "pending_confirm"
  );
}

/** 坞上「新建 Shell」唯一放行条件：已接入且此刻在线。 */
export function canOpenShell(computer: Computer | null | undefined): boolean {
  return Boolean(computer) && computerDisplayState(computer as Computer) === "ready";
}
