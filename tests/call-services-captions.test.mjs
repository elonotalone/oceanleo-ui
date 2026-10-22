// calls-v2 W06：字幕上行与显示的纯函数（合同 §3.1 / §3.3 / §3.6）。
// 覆盖：重采样与分帧（48k / 44.1k / 16k / 8k → 16 kHz s16le、100 ms 一帧、跨块不丢不重）、
//       上行状态机（何时连、首帧 auth、何时 pause/resume、何时关、断线退避、服务端 error 分流、丢帧）、
//       字幕聚合（中间结果替换、句末定稿、按说话人合并、只认当前通话、淡出）。
import assert from "node:assert/strict";
import test from "node:test";

const pcm = await import("../src/shell/messages/call/services/pcm.ts");
const model = await import("../src/shell/messages/call/services/captions-model.ts");
const uplinkMod = await import("../src/shell/messages/call/services/uplink.ts");

// ---------------------------------------------------------------------------
// PCM：重采样 + 分帧
// ---------------------------------------------------------------------------

function sine(rate, hz, seconds, amp = 0.5) {
  const out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i += 1) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
}

function chunked(samples, size) {
  const parts = [];
  for (let i = 0; i < samples.length; i += size) parts.push(samples.subarray(i, i + size));
  return parts;
}

function int16Samples(frame) {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const out = [];
  for (let i = 0; i < frame.byteLength; i += 2) out.push(view.getInt16(i, true));
  return out;
}

test("帧形状：16 kHz、100 ms = 1600 个采样 = 3200 字节；只接受 40–200 ms", () => {
  assert.equal(pcm.CAPTIONS_SAMPLE_RATE, 16000);
  assert.equal(pcm.CAPTIONS_FRAME_MS, 100);
  assert.equal(pcm.captionsFrameSamples(), 1600);
  assert.equal(pcm.captionsFrameSamples(16000, 40), 640);
  assert.equal(pcm.captionsFrameSamples(16000, 200), 3200);
  assert.throws(() => pcm.captionsFrameSamples(16000, 20), RangeError, "20 ms 小于合同下限");
  assert.throws(() => pcm.captionsFrameSamples(16000, 250), RangeError, "250 ms 超过合同上限");
  const pipeline = pcm.createCaptionsPcmPipeline(48000);
  assert.equal(pipeline.frameSamples, 1600);
  assert.equal(pipeline.frameBytes, 3200);
});

test("48 kHz → 16 kHz：1 秒输入恰好 10 帧，每帧 3200 字节，任意分块结果一致", () => {
  const input = sine(48000, 440, 1);
  const whole = pcm.createCaptionsPcmPipeline(48000).push(input);
  assert.equal(whole.length, 10);
  for (const frame of whole) {
    assert.ok(frame instanceof Uint8Array);
    assert.equal(frame.byteLength, 3200);
  }
  // 按音频线程的 128 采样一块喂，结果逐字节相同（块边界不丢不重）。
  const pipeline = pcm.createCaptionsPcmPipeline(48000);
  const streamed = [];
  for (const part of chunked(input, 128)) streamed.push(...pipeline.push(part));
  assert.equal(streamed.length, 10);
  assert.deepEqual(
    streamed.map((frame) => Buffer.from(frame).toString("base64")),
    whole.map((frame) => Buffer.from(frame).toString("base64")),
  );
});

test("44.1 kHz → 16 kHz：非整数倍率，10 秒不漂移（输出采样数 = 输入 × 16000/44100，误差 ≤1）", () => {
  const resampler = pcm.createResampler(44100, 16000);
  let total = 0;
  const input = sine(44100, 300, 10);
  for (const part of chunked(input, 441)) total += resampler.push(part).length;
  assert.ok(Math.abs(total - 160000) <= 1, `得到 ${total} 个采样`);
});

test("降采样保留语音频段、压低混叠：300 Hz 正弦幅度基本不变，7.9 kHz 以上的高频被衰减", () => {
  const rms = (arr) => Math.sqrt(arr.reduce((sum, v) => sum + v * v, 0) / arr.length);
  const low = pcm.createResampler(48000, 16000).push(sine(48000, 300, 0.5));
  assert.ok(Math.abs(rms(low) - 0.5 / Math.SQRT2) < 0.01, `300 Hz 幅度变了：${rms(low)}`);
  // 15 kHz 在 16 kHz 输出里会混叠到 1 kHz；面积平均要把它压下去（直接抽点几乎不衰减）。
  const high = pcm.createResampler(48000, 16000).push(sine(48000, 15000, 0.5));
  assert.ok(rms(high) < 0.5 / Math.SQRT2 / 2, `15 kHz 没被压低：${rms(high)}`);
});

test("8 kHz → 16 kHz 线性插值：采样数翻倍，插值点在两点之间", () => {
  const resampler = pcm.createResampler(8000, 16000);
  const out = resampler.push(new Float32Array([0, 0.5, 1, 0.5]));
  assert.deepEqual(Array.from(out), [0, 0.25, 0.5, 0.75, 1, 0.75]);
  const total = resampler.push(new Float32Array(8000)).length + out.length;
  assert.ok(Math.abs(total - 16008) <= 2, `得到 ${total}`);
});

test("同采样率原样通过；非有限值按 0 处理；s16le 小端、削顶", () => {
  const same = pcm.createResampler(16000, 16000).push(new Float32Array([0.1, Number.NaN, -0.2]));
  assert.ok(Math.abs(same[0] - 0.1) < 1e-6);
  assert.equal(same[1], 0);
  const framer = pcm.createPcmFramer(4);
  const frames = framer.push(new Float32Array([1, -1, 2, -2]));
  assert.equal(frames.length, 1);
  assert.deepEqual(int16Samples(frames[0]), [32767, -32768, 32767, -32768]);
  assert.deepEqual(Array.from(frames[0].subarray(0, 2)), [0xff, 0x7f], "小端：低字节在前");
});

test("分帧：不满一帧先攒着，reset 丢掉尾巴（静音后不把旧声音拼到新的一段前面）", () => {
  const framer = pcm.createPcmFramer(1600);
  assert.equal(framer.push(new Float32Array(1000)).length, 0);
  assert.equal(framer.pendingSamples(), 1000);
  assert.equal(framer.push(new Float32Array(700)).length, 1);
  assert.equal(framer.pendingSamples(), 100);
  framer.reset();
  assert.equal(framer.pendingSamples(), 0);
  assert.throws(() => pcm.createPcmFramer(0), RangeError);
  assert.throws(() => pcm.createResampler(1000, 16000), RangeError);
});

test("多声道平均成单声道", () => {
  const mono = pcm.downmixToMono([new Float32Array([1, 0.5]), new Float32Array([0, -0.5])]);
  assert.deepEqual(Array.from(mono), [0.5, 0]);
  const single = new Float32Array([0.3]);
  assert.equal(pcm.downmixToMono([single]), single);
  assert.equal(pcm.downmixToMono([]).length, 0);
});

// ---------------------------------------------------------------------------
// 上行状态机
// ---------------------------------------------------------------------------

class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = null;
    this.bufferedAmount = 0;
    this.binaryType = "blob";
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  send(data) {
    if (this.closed) throw new Error("closed");
    this.sent.push(data);
  }
  close(code) {
    this.closed = code ?? 1000;
  }
  open() {
    this.onopen?.();
  }
  serverText(obj) {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  drop() {
    this.onclose?.({ code: 1006 });
  }
  texts() {
    return this.sent.filter((item) => typeof item === "string").map((item) => JSON.parse(item));
  }
  binaries() {
    return this.sent.filter((item) => typeof item !== "string");
  }
}

function harness({ token = "jwt-test", url = (callId) => `wss://gw.test/v1/im/calls/${callId}/captions/ws` } = {}) {
  const sockets = [];
  const timers = new Map();
  let nextTimer = 1;
  let clock = 0;
  const statuses = [];
  const uplink = uplinkMod.createCaptionsUplink({
    url,
    getToken: async () => (typeof token === "function" ? token() : token),
    createSocket: (address) => {
      const socket = new FakeSocket(address);
      sockets.push(socket);
      return socket;
    },
    setTimer: (fn, ms) => {
      const id = nextTimer++;
      timers.set(id, { fn, at: clock + ms, ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    random: () => 0.5,
    now: () => clock,
  });
  uplink.subscribe((status) => statuses.push(status));
  return {
    uplink,
    sockets,
    timers,
    statuses,
    last: () => sockets[sockets.length - 1],
    async advance(ms) {
      clock += ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= clock).sort((a, b) => a[1].at - b[1].at);
        if (due.length === 0) break;
        const [id, timer] = due[0];
        timers.delete(id);
        timer.fn();
        await flush();
      }
    },
    pendingDelays: () => [...timers.values()].map((timer) => timer.ms).sort((a, b) => a - b),
  };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

const LIVE = { callId: "call-1", participantId: "11111111-2222-3333-4444-555555555555", inCall: true, transcription: true, mic: true };

async function connected(h, target = LIVE, sampleRate = 16000) {
  h.uplink.update(target);
  await flush();
  const socket = h.last();
  socket.open();
  socket.serverText({ type: "ready", sample_rate: sampleRate });
  return socket;
}

test("不该连的时候一个连接都不建：转写关、不在通话、缺 callId/participantId、静音", async () => {
  const h = harness();
  for (const target of [
    { ...LIVE, transcription: false },
    { ...LIVE, inCall: false },
    { ...LIVE, callId: null },
    { ...LIVE, participantId: null },
    { ...LIVE, mic: false },
  ]) {
    h.uplink.update(target);
    await flush();
  }
  assert.equal(h.sockets.length, 0);
  assert.equal(h.uplink.capturing(), false, "静音时不采集");
  assert.equal(h.uplink.status().state, "paused", "要转写但静音：暂停态");
  assert.equal(uplinkMod.uplinkWanted({ ...LIVE, mic: false }), true);
  assert.equal(uplinkMod.uplinkWanted({ ...LIVE, transcription: false }), false);
});

test("连上：地址按网关推、首帧是 auth（access_token + participant_id），ready 之后才发 PCM", async () => {
  const h = harness();
  h.uplink.update(LIVE);
  await flush();
  assert.equal(h.sockets.length, 1);
  const socket = h.last();
  assert.equal(socket.url, "wss://gw.test/v1/im/calls/call-1/captions/ws");
  assert.equal(socket.binaryType, "arraybuffer");
  assert.equal(h.uplink.status().state, "connecting");
  assert.equal(h.uplink.capturing(), true, "连接建立期间就开始采集，ready 后马上有帧");
  assert.equal(h.uplink.sendFrame(new Uint8Array(3200)), false, "ready 之前不发");
  socket.open();
  assert.deepEqual(socket.texts(), [{ type: "auth", access_token: "jwt-test", participant_id: LIVE.participantId }]);
  socket.serverText({ type: "ready", sample_rate: 16000 });
  assert.equal(h.uplink.status().state, "streaming");
  assert.equal(h.uplink.status().sampleRate, 16000);
  const frame = new Uint8Array(3200);
  assert.equal(h.uplink.sendFrame(frame), true);
  assert.equal(socket.binaries().length, 1);
  assert.equal(socket.binaries()[0], frame);
  assert.equal(h.uplink.stats().framesSent, 1);
});

test("静音发 pause、开麦发 resume；静音期间不发 PCM、也不采集", async () => {
  const h = harness();
  const socket = await connected(h);
  h.uplink.update({ ...LIVE, mic: false });
  assert.deepEqual(socket.texts().slice(1), [{ type: "pause" }]);
  assert.equal(h.uplink.status().state, "paused");
  assert.equal(h.uplink.capturing(), false);
  assert.equal(h.uplink.sendFrame(new Uint8Array(3200)), false);
  h.uplink.update({ ...LIVE, mic: false });
  assert.deepEqual(socket.texts().slice(1), [{ type: "pause" }], "重复的静音状态不重复发 pause");
  h.uplink.update(LIVE);
  assert.deepEqual(socket.texts().slice(1), [{ type: "pause" }, { type: "resume" }]);
  assert.equal(h.uplink.status().state, "streaming");
  assert.equal(h.uplink.sendFrame(new Uint8Array(3200)), true);
  assert.equal(h.sockets.length, 1, "pause/resume 不重建连接");
});

test("连接建立期间静音：ready 时立刻补发 pause", async () => {
  const h = harness();
  h.uplink.update(LIVE);
  await flush();
  const socket = h.last();
  socket.open();
  h.uplink.update({ ...LIVE, mic: false });
  socket.serverText({ type: "ready", sample_rate: 16000 });
  assert.deepEqual(socket.texts().slice(1), [{ type: "pause" }]);
  assert.equal(h.uplink.status().state, "paused");
});

test("关转写 / 离开 / 通话结束 → 关闭连接且不重连", async () => {
  for (const off of [{ transcription: false }, { inCall: false }, { callId: null }]) {
    const h = harness();
    const socket = await connected(h);
    h.uplink.update({ ...LIVE, ...off });
    assert.equal(socket.closed, 1000);
    assert.equal(h.uplink.status().state, "idle");
    assert.equal(h.uplink.capturing(), false);
    await h.advance(120_000);
    assert.equal(h.sockets.length, 1, `${JSON.stringify(off)} 之后又连了`);
  }
});

test("换了通话：旧连接关掉，新通话用新地址重连", async () => {
  const h = harness();
  const first = await connected(h);
  h.uplink.update({ ...LIVE, callId: "call-2" });
  await flush();
  assert.equal(first.closed, 1000);
  assert.equal(h.sockets.length, 2);
  assert.equal(h.last().url, "wss://gw.test/v1/im/calls/call-2/captions/ws");
});

test("开麦时断线：按退避重连（1 s 起、加倍、封顶 30 s）；稳定连过 10 秒后断线从 1 s 重来", async () => {
  const h = harness();
  const socket = await connected(h);
  socket.drop();
  assert.equal(h.uplink.status().state, "retrying");
  assert.deepEqual(h.pendingDelays(), [1000]);
  await h.advance(1000);
  assert.equal(h.sockets.length, 2);
  h.last().drop(); // 握手前就断
  assert.deepEqual(h.pendingDelays(), [2000]);
  await h.advance(2000);
  h.last().drop();
  assert.deepEqual(h.pendingDelays(), [4000]);
  await h.advance(4000);
  const stable = h.last();
  stable.open();
  stable.serverText({ type: "ready", sample_rate: 16000 });
  await h.advance(11_000);
  stable.drop();
  assert.deepEqual(h.pendingDelays(), [1000], "稳定连接断开后从最短退避重来");
  for (let i = 0; i < 8; i += 1) {
    const delay = h.pendingDelays()[0];
    await h.advance(delay);
    h.last().drop();
  }
  assert.ok(h.pendingDelays()[0] <= 30_000, "退避封顶 30 秒");
});

test("连上就被断（不稳定）：退避不清零，防止每秒重连的死循环", async () => {
  const h = harness();
  let socket = await connected(h);
  socket.drop();
  assert.deepEqual(h.pendingDelays(), [1000]);
  await h.advance(1000);
  socket = h.last();
  socket.open();
  socket.serverText({ type: "ready", sample_rate: 16000 });
  socket.drop();
  assert.deepEqual(h.pendingDelays(), [2000]);
});

test("静音时断线：不重连；开麦立刻重连", async () => {
  const h = harness();
  const socket = await connected(h);
  h.uplink.update({ ...LIVE, mic: false });
  socket.drop();
  assert.equal(h.uplink.status().state, "paused");
  assert.deepEqual(h.pendingDelays(), []);
  await h.advance(60_000);
  assert.equal(h.sockets.length, 1);
  h.uplink.update(LIVE);
  await flush();
  assert.equal(h.sockets.length, 2);
});

test("握手超时（10 秒没 ready）：关掉重来", async () => {
  const h = harness();
  h.uplink.update(LIVE);
  await flush();
  const socket = h.last();
  socket.open();
  await h.advance(10_000);
  assert.equal(socket.closed, 1000);
  assert.equal(h.uplink.status().error, "auth_timeout");
  assert.equal(h.uplink.status().state, "retrying");
  await h.advance(1000);
  assert.equal(h.sockets.length, 2);
});

test("服务端 error：transcription_off 不立刻重连（等状态变或 60 秒），asr_unavailable 至少 15 秒，auth_failed 走退避", async () => {
  {
    const h = harness();
    const socket = await connected(h);
    socket.serverText({ type: "error", code: "transcription_off" });
    assert.equal(socket.closed, 1000);
    assert.equal(h.uplink.capturing(), false, "服务端说转写已关：停止采集");
    h.uplink.update(LIVE);
    await flush();
    assert.equal(h.sockets.length, 1, "同样的状态再喂一次也不重连");
    assert.deepEqual(h.pendingDelays(), [60_000]);
    // 服务端状态广播过来：先关再开 → 立刻重连。
    h.uplink.update({ ...LIVE, transcription: false });
    h.uplink.update(LIVE);
    await flush();
    assert.equal(h.sockets.length, 2);
  }
  {
    const h = harness();
    const socket = await connected(h);
    socket.serverText({ type: "error", code: "transcription_off" });
    await h.advance(60_000);
    assert.equal(h.sockets.length, 2, "60 秒后再核一次");
  }
  {
    const h = harness();
    const socket = await connected(h);
    socket.serverText({ type: "error", code: "asr_unavailable" });
    assert.equal(h.uplink.status().error, "asr_unavailable");
    assert.ok(h.pendingDelays()[0] >= 15_000);
    await h.advance(15_000);
    assert.equal(h.sockets.length, 2);
    h.last().open();
    h.last().serverText({ type: "ready", sample_rate: 16000 });
    assert.equal(h.uplink.status().error, null, "重新连上后清掉错误");
  }
  {
    const h = harness();
    h.uplink.update(LIVE);
    await flush();
    h.last().open();
    h.last().serverText({ type: "error", code: "auth_failed" });
    assert.equal(h.uplink.status().error, "auth_failed");
    assert.deepEqual(h.pendingDelays(), [1000]);
  }
});

test("没有 token：不建连接，退避后再取；地址取不到：5 秒后再试", async () => {
  let token = null;
  const h = harness({ token: () => token });
  h.uplink.update(LIVE);
  await flush();
  assert.equal(h.sockets.length, 0);
  assert.equal(h.uplink.status().error, "auth_failed");
  token = "jwt-later";
  await h.advance(1000);
  assert.equal(h.sockets.length, 1);
  h.last().open();
  assert.equal(h.last().texts()[0].access_token, "jwt-later");

  const noUrl = harness({ url: () => null });
  noUrl.uplink.update(LIVE);
  await flush();
  assert.equal(noUrl.sockets.length, 0);
  assert.deepEqual(noUrl.pendingDelays(), [5000]);
});

test("取 token 的工夫里重复 update 不会建两条连接", async () => {
  const h = harness();
  h.uplink.update(LIVE);
  h.uplink.update(LIVE);
  h.uplink.update({ ...LIVE });
  await flush();
  assert.equal(h.sockets.length, 1);
});

test("网络慢：发送缓冲超过 64 KB 就丢帧（不攒），计数可查", async () => {
  const h = harness();
  const socket = await connected(h);
  socket.bufferedAmount = uplinkMod.UPLINK_MAX_BUFFERED_BYTES + 1;
  assert.equal(h.uplink.sendFrame(new Uint8Array(3200)), false);
  assert.equal(h.uplink.stats().framesDropped, 1);
  socket.bufferedAmount = 0;
  assert.equal(h.uplink.sendFrame(new Uint8Array(3200)), true);
});

test("服务端给的采样率被采纳；不合理的值回落 16000", async () => {
  const h = harness();
  await connected(h, LIVE, 8000);
  assert.equal(h.uplink.status().sampleRate, 8000);
  const bad = harness();
  await connected(bad, LIVE, 999999);
  assert.equal(bad.uplink.status().sampleRate, 16000);
});

test("stop()：关连接、清计时器", async () => {
  const h = harness();
  const socket = await connected(h);
  socket.drop();
  h.uplink.stop();
  assert.deepEqual(h.pendingDelays(), []);
  assert.equal(h.uplink.status().state, "idle");
});

test("上行地址：https → wss、http → ws，callId 编码；不合格返回 null", () => {
  assert.equal(
    uplinkMod.captionsSocketUrl("https://api.oceanbizs.com/", "c 1"),
    "wss://api.oceanbizs.com/v1/im/calls/c%201/captions/ws",
  );
  assert.equal(uplinkMod.captionsSocketUrl("http://127.0.0.1:8008", "c1"), "ws://127.0.0.1:8008/v1/im/calls/c1/captions/ws");
  assert.equal(uplinkMod.captionsSocketUrl("", "c1"), null);
  assert.equal(uplinkMod.captionsSocketUrl("ftp://x", "c1"), null);
  assert.equal(uplinkMod.captionsSocketUrl("https://x", ""), null);
});

// ---------------------------------------------------------------------------
// 字幕聚合
// ---------------------------------------------------------------------------

const ev = (over) => ({
  call_id: "call-1",
  participant_id: "p-a",
  user_id: "u-a",
  sentence_id: 1,
  text: "",
  is_final: false,
  ...over,
});

test("中间结果原地替换，句末定稿；定稿后迟到的中间结果丢弃", () => {
  let m = model.emptyCaptions("call-1");
  m = model.applyCaptionEvent(m, ev({ text: "大家" }), 1000);
  m = model.applyCaptionEvent(m, ev({ text: "大家好" }), 1100);
  assert.equal(m.entries.length, 1);
  assert.equal(m.entries[0].text, "大家好");
  assert.equal(m.entries[0].isFinal, false);
  m = model.applyCaptionEvent(m, ev({ text: "大家好。", is_final: true }), 1200);
  assert.equal(m.entries[0].isFinal, true);
  const late = model.applyCaptionEvent(m, ev({ text: "大家", is_final: false }), 1300);
  assert.equal(late, m, "迟到的中间结果不改动（引用不变）");
  assert.equal(model.applyCaptionEvent(m, ev({ text: "大家好。", is_final: true }), 1400), m, "重复的定稿不重绘");
});

test("只认当前通话；没有 participant_id 的丢弃；sentence_id 数字与字符串同等对待", () => {
  const m = model.emptyCaptions("call-1");
  assert.equal(model.applyCaptionEvent(m, ev({ call_id: "call-x", text: "别的通话" }), 1), m);
  assert.equal(model.applyCaptionEvent(m, ev({ participant_id: "", text: "无名" }), 1), m);
  assert.equal(model.applyCaptionEvent(model.emptyCaptions(null), ev({ text: "未入会" }), 1).entries.length, 0);
  let n = model.applyCaptionEvent(m, ev({ sentence_id: 7, text: "一" }), 1);
  n = model.applyCaptionEvent(n, ev({ sentence_id: "7", text: "一二" }), 2);
  assert.equal(n.entries.length, 1);
  assert.equal(n.entries[0].text, "一二");
  assert.equal(model.captionsForCall(n, "call-1"), n);
  assert.deepEqual(model.captionsForCall(n, "call-2"), model.emptyCaptions("call-2"), "换通话清空");
});

test("空文本的定稿 = 撤回这一句；空的中间结果不建新句", () => {
  let m = model.applyCaptionEvent(model.emptyCaptions("call-1"), ev({ text: "嗯" }), 1);
  m = model.applyCaptionEvent(m, ev({ text: "  ", is_final: true }), 2);
  assert.equal(m.entries.length, 0);
  assert.equal(model.applyCaptionEvent(m, ev({ sentence_id: 2, text: "" }), 3), m);
});

test("同一说话人开始新的一句：上一句没定稿就按定稿处理", () => {
  let m = model.emptyCaptions("call-1");
  m = model.applyCaptionEvent(m, ev({ sentence_id: 1, text: "第一句" }), 1);
  m = model.applyCaptionEvent(m, ev({ sentence_id: 2, text: "第二句" }), 2);
  assert.deepEqual(m.entries.map((e) => [e.sentenceId, e.isFinal]), [["1", true], ["2", false]]);
});

test("按说话人合并成行：连续同一人的句子并成一行；小窗 1 行、放大视图 2 行", () => {
  let m = model.emptyCaptions("call-1");
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-a", sentence_id: 1, text: "我们开始吧。", is_final: true }), 1);
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-a", sentence_id: 2, text: "先看数据。", is_final: true }), 2);
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-b", user_id: "u-b", sentence_id: 1, text: "Sounds good." }), 3);
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-b", user_id: "u-b", sentence_id: 2, text: "Go ahead." }), 4);
  const two = model.captionLines(m, 5, 2, 200);
  assert.deepEqual(
    two.map((line) => [line.participantId, line.text]),
    [
      ["p-a", "我们开始吧。先看数据。"],
      ["p-b", "Sounds good. Go ahead."],
    ],
  );
  const one = model.captionLines(m, 5, 1, 200);
  assert.deepEqual(one.map((line) => line.participantId), ["p-b"], "小窗只显示最新一行");
  assert.equal(one[0].userId, "u-b");
  assert.equal(one[0].isFinal, false);
  assert.deepEqual(model.captionLines(m, 5, 0, 200), []);
});

test("只保留最近几句；太长的行保留结尾（最新的字）", () => {
  let m = model.emptyCaptions("call-1");
  for (let i = 1; i <= 12; i += 1) {
    m = model.applyCaptionEvent(m, ev({ participant_id: i % 2 ? "p-a" : "p-b", sentence_id: i, text: `第${i}句`, is_final: true }), i);
  }
  assert.equal(m.entries.length, model.CAPTION_MAX_ENTRIES);
  assert.equal(m.entries[0].sentenceId, String(12 - model.CAPTION_MAX_ENTRIES + 1));
  assert.equal(model.tailText("abcdefghij", 5), "…ghij");
  assert.equal(model.tailText("短", 5), "短");
  assert.equal(model.tailText("😀😀😀😀😀😀", 3), "…😀😀", "按字符截，不切坏表情");
  const long = model.applyCaptionEvent(model.emptyCaptions("call-1"), ev({ text: "字".repeat(1000) }), 1);
  assert.equal(long.entries[0].text.length, model.CAPTION_TEXT_MAX);
  const line = model.captionLines(long, 2, 1, 40)[0];
  assert.equal(Array.from(line.text).length, 40);
  assert.ok(line.text.startsWith("…"));
});

test("静默后淡出：定稿 8 秒、未定稿 15 秒不更新就不再显示；prune 无变化时引用不变", () => {
  let m = model.emptyCaptions("call-1");
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-a", sentence_id: 1, text: "说完了", is_final: true }), 0);
  m = model.applyCaptionEvent(m, ev({ participant_id: "p-b", sentence_id: 1, text: "还在说" }), 0);
  assert.equal(model.nextCaptionExpiry(m), model.CAPTION_FINAL_TTL_MS);
  assert.equal(model.captionLines(m, 7_999, 2, 100).length, 2);
  assert.deepEqual(model.captionLines(m, 8_000, 2, 100).map((l) => l.participantId), ["p-b"]);
  const pruned = model.pruneCaptions(m, 8_000);
  assert.equal(pruned.entries.length, 1);
  assert.equal(model.pruneCaptions(pruned, 8_001), pruned);
  assert.equal(model.pruneCaptions(pruned, 15_000).entries.length, 0);
  assert.equal(model.nextCaptionExpiry(model.emptyCaptions("call-1")), null);
});

test("句子拼接：中日文之间不加空格，其余语言（含韩文）加一个空格", () => {
  assert.equal(model.joinCaptionText("好的。", "开始"), "好的。开始");
  assert.equal(model.joinCaptionText("OK.", "Next"), "OK. Next");
  assert.equal(model.joinCaptionText("안녕하세요.", "반갑습니다."), "안녕하세요. 반갑습니다.");
  assert.equal(model.joinCaptionText("はい。", "次へ"), "はい。次へ");
  assert.equal(model.joinCaptionText("", "x"), "x");
  assert.equal(model.joinCaptionText("x", ""), "x");
});
