// 断线重连间隔：1 秒起，每次翻倍，到 30 秒封顶。连上之后调用方把间隔改回 1 秒。

export function nextReconnectDelay(current: number): number {
  const base = !Number.isFinite(current) || current < 1000 ? 1000 : current;
  return Math.min(base * 2, 30000);
}
