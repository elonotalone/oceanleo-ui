// Browser-only remote peer: real canvas MediaStream, synthetic ARTC lane/receipts.
// No component handlers are invoked by the tests. Production Video owns decoding callbacks.
export const browserMediaFixture = `
export class RemotePublisherStatusError extends Error {}
export async function openRemoteMedia(credentials, video, callbacks, signal) {
  const q = new URLSearchParams(location.search);
  const canvas = document.createElement("canvas");
  canvas.width = Number(q.get("w")); canvas.height = Number(q.get("h"));
  const paint = () => { const c = canvas.getContext("2d"); c.fillStyle = "#336699"; c.fillRect(0, 0, canvas.width, canvas.height); };
  paint();
  const stream = canvas.captureStream(30);
  const subscribers = new Set();
  window.__rd.receipt = (seq, extra = {}) => {
    const receipt = { t: "rd.input_receipt", v: 1, sid: callbacks.sessionId, seq, status: "executed", executed_at_ms: Date.now(), ...extra };
    window.__rd.receipts.push(receipt);
    for (const fn of subscribers) fn(receipt);
  };
  const lane = {
    send(raw) {
      const value = JSON.parse(raw);
      if (value.a) {
        window.__rd.writes.push({ ...value, at: performance.now() });
        window.__rd.inputs.push(value.a);
        if (window.__rd.autoReceipt) setTimeout(() => { if (!signal.aborted) window.__rd.receipt(value.seq); }, 0);
      }
      return true;
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
  callbacks.dataChannel(lane);
  let frameId;
  const frame = () => {
    if (signal.aborted) return;
    callbacks.frame(video.videoWidth, video.videoHeight);
    callbacks.state("playing");
    frameId = video.requestVideoFrameCallback(frame);
  };
  frameId = video.requestVideoFrameCallback(frame);
  video.srcObject = stream;
  await video.play();
  const timer = setInterval(paint, 33);
  return { async close() {
    clearInterval(timer); video.cancelVideoFrameCallback(frameId);
    stream.getTracks().forEach(track => track.stop());
    subscribers.clear(); video.srcObject = null;
  } };
}
`;
