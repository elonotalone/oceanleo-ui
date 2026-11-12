import type { ComputerEvent } from "../../lib/cloud-computer-api";
import { formatMinor } from "../../lib/money";

const LABELS: Record<string, string> = {
  "node.confirmed": "主人已确认", "node.enrolled": "节点已注册",
  "lifecycle.provisioning": "正在购买服务器", "lifecycle.running": "服务器已开机",
  "lifecycle.stopped": "服务器已停机，磁盘仍保留", "lifecycle.released": "服务器已释放",
  "server.purchase_reserved": "已预留服务器预算", "server.purchased": "服务器已购买",
  "server.renewed": "包月服务器已续费", "server.expiring": "包月服务器即将到期",
  "server.agent_start": "Agent 已开机", "server.agent_stop": "Agent 已停机，磁盘仍保留",
  "server.price_limit": "时价超过授权，已停机", "server.order_uncertain": "订单结果需要核对，预算仍保留",
  "billing.metered": "服务器费用已扣除", "billing.unpaid": "余额不足，服务器已停机",
  "aliyun.error": "服务器操作失败",
};
export function serverEventCopy(event: ComputerEvent, tt: (key: string) => string): string {
  const detail = event.detail;
  const label = event.kind === "aliyun.system_event"
    ? /spot|preempt/i.test(String(detail.event_type ?? "")) ? "抢占式服务器收到回收通知" : "阿里云服务器通知"
    : LABELS[event.kind] || "设备活动";
  const parts = [tt(label)];
  if (typeof detail.amount_minor === "number" && typeof detail.currency === "string") parts.push(formatMinor(detail.amount_minor, detail.currency));
  if (typeof detail.expires_at === "string") parts.push(`${tt("到期时间")} ${detail.expires_at}`);
  return parts.join(" · ");
}
