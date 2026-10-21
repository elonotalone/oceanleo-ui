/** A bounded display buffer for live server deltas, never completed history. */
export function createStreamingTextBuffer(
  publish: (text: string) => void,
  schedule: (run: () => void, delay: number) => unknown = setTimeout,
  cancel: (id: unknown) => void = (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let shown = "";
  let target = "";
  let queue: string[] = [];
  let timer: unknown = null;
  let disposed = false;
  const stopTimer = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const tick = () => {
    timer = null;
    if (disposed || !queue.length) return;
    shown += queue.shift();
    publish(shown);
    if (queue.length) timer = schedule(tick, Math.max(4, Math.min(24, 400 / queue.length)));
  };
  return {
    update(text: string, active: boolean) {
      if (disposed) return;
      target = text;
      if (!active || !text.startsWith(shown)) {
        stopTimer();
        queue = [];
        shown = target;
        publish(shown);
        return;
      }
      queue = Array.from(segmenter.segment(target.slice(shown.length)), (part) => part.segment);
      // A resumed tab or a very large server frame must not create seconds of
      // artificial latency. Keep at most a small live tail to reveal.
      if (queue.length > 100) {
        shown += queue.splice(0, queue.length - 60).join("");
        publish(shown);
      }
      if (timer === null && queue.length) tick();
    },
    dispose() { disposed = true; stopTimer(); queue = []; },
  };
}
