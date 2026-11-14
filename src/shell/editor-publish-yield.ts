/** Publication is background work; pending input and working-copy PUTs run first. */
export async function yieldToEditor(): Promise<void> {
  if (typeof window === "undefined") return;
  const scheduler = (globalThis as typeof globalThis & {
    scheduler?: { postTask<T>(task: () => T, options: { priority: "background" }): Promise<T> };
  }).scheduler;
  if (scheduler?.postTask) await scheduler.postTask(() => undefined, { priority: "background" });
  else await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}
