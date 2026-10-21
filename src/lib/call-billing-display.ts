export function formatConnectedTime(seconds: number | undefined): string {
  if (!Number.isFinite(seconds) || seconds === undefined || seconds < 0) return "用量暂不可读取";
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = whole % 60;
  return `${minutes} 分 ${remainder} 秒`;
}

export function callStatusLabel(status: string | undefined, pendingReconciliation = false): string {
  if (pendingReconciliation || status === "pending_reconciliation" || status === "unresolved") return "待服务端核对；预留余额尚未最终结算";
  if (status === "active") return "通话进行中；当前显示的是预留而非最终扣款";
  if (status === "closed" || status === "settled") return "服务端已结算";
  if (status === "failed") return "通话未完成；等待预留释放确认";
  return status || "账单处理中";
}

export function tokenUsageRows(value: unknown): Array<{ label: string; value: number }> {
  const labels: Record<string, string> = {
    input_tokens: "输入 token", prompt_tokens: "输入 token", output_tokens: "输出 token",
    completion_tokens: "输出 token", total_tokens: "总 token", audio_input_tokens: "音频输入 token",
    audio_output_tokens: "音频输出 token", text_input_tokens: "文本输入 token", text_output_tokens: "文本输出 token",
    image_tokens: "图像 token", video_tokens: "视频 token",
  };
  const found = new Map<string, number>();
  const visit = (item: unknown, depth: number) => {
    if (depth > 5 || !item || typeof item !== "object") return;
    if (Array.isArray(item)) { for (const child of item) visit(child, depth + 1); return; }
    for (const [key, child] of Object.entries(item)) {
      const normalized = key.toLowerCase();
      if (typeof child === "number" && Number.isFinite(child) && labels[normalized]) {
        found.set(labels[normalized], (found.get(labels[normalized]) ?? 0) + child);
      } else if (child && typeof child === "object") visit(child, depth + 1);
    }
  };
  visit(value, 0);
  return [...found].map(([label, count]) => ({ label, value: count }));
}

export function tokenRateRows(value: unknown): Array<{ label: string; rate: string }> {
  if (!value || typeof value !== "object") return [];
  const rates = (value as { rates_per_million_tokens?: unknown }).rates_per_million_tokens;
  if (!rates || typeof rates !== "object") return [];
  const labels: Record<string, string> = {
    input_audio: "音频输入", input_text: "文本输入", input_image: "图像输入",
    cached_input_audio: "缓存音频输入", cached_input_text: "缓存文本输入", cached_input_image: "缓存图像输入",
    output_audio: "音频输出", output_text: "文本输出",
  };
  return Object.entries(rates).flatMap(([key, rate]) => {
    const numeric = Number(rate);
    return labels[key] && Number.isFinite(numeric) ? [{ label: labels[key], rate: String(rate) }] : [];
  });
}
