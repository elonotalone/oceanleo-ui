import type { Locale } from "../../config";

// W1 task page (instant bubble, background tasks) — wave 2026-11-09. Chinese source text is the key; English is the value.
// Other locales fall back to English until a translated row exists.
const EN: Record<string, string> = {
  "正在发送": "Sending",
  "已排队": "Queued",
  "发送失败": "Failed to send",
  "重试": "Retry",
  "后台任务": "Background task",
  "运行中": "Running",
  "用时 {elapsed}": "Elapsed {elapsed}",
  "后台任务运行中 · {name} · {elapsed}": "Background task running · {name} · {elapsed}",
  "{count} 个后台任务运行中": "{count} tasks running in background",
  "展开后台任务": "Expand background tasks",
  "收起后台任务": "Collapse background tasks",
  "已完成": "Completed",
  "已失败": "Failed",
  "已停止": "Stopped",
};

export function taskLiveCopy(locale: Locale): Record<string, string> {
  if (locale === "zh") return Object.fromEntries(Object.keys(EN).map((key) => [key, key]));
  return { ...EN };
}
