// 通话字幕上行的 AudioWorklet 采集处理器（calls-v2 W06；仲裁 A-26：放在消息目录 src/shell/messages/** 与
// src/lib/im/** 之外，`tests/im-acceptance-static.test.mjs`「消息目录不收发 postMessage」那道闸保持原样）。
//
// 这里的 postMessage 只是 AudioWorklet 自己的 MessagePort：处理器（音频线程）把采到的 PCM 块交回创建它的
// 主线程节点。不是窗口间通信——没有 window.postMessage、没有 origin、不接收任何外来消息；
// 主线程这一侧只认 Float32Array，别的数据一律丢弃。
//
// 处理器做的事：把输入的多声道逐采样平均成单声道，攒够 `chunk` 个采样（约 50 ms）就交一块（转移缓冲区，不拷贝）；
// 输出全写 0（节点接到 destination 只是为了让音频图持续拉取，不出声）。重采样与 100 ms 分帧在主线程
// （`src/shell/messages/call/services/pcm.ts`）。

export const CALL_PCM_WORKLET_NAME = "oceanleo-call-pcm-capture";

/** 处理器源码（Blob URL 加载；写法与 Leo 实时通话的采集处理器一致）。 */
export const CALL_PCM_WORKLET_SOURCE =
  "class OceanLeoCallPcmCapture extends AudioWorkletProcessor{" +
  "constructor(options){super();const o=(options&&options.processorOptions)||{};" +
  "this.size=Math.max(128,o.chunk|0);this.buf=new Float32Array(this.size);this.fill=0;}" +
  "process(inputs,outputs){const out=outputs[0];if(out){for(let c=0;c<out.length;c++)out[c].fill(0);}" +
  "const input=inputs[0];if(!input||input.length===0)return true;const ch=input.length,n=input[0].length;" +
  "for(let i=0;i<n;i++){let s=0;for(let c=0;c<ch;c++)s+=input[c][i];this.buf[this.fill++]=s/ch;" +
  "if(this.fill===this.size){this.port.postMessage(this.buf,[this.buf.buffer]);this.buf=new Float32Array(this.size);this.fill=0;}}" +
  "return true;}}" +
  `registerProcessor(${JSON.stringify(CALL_PCM_WORKLET_NAME)},OceanLeoCallPcmCapture);`;

/** 每块采样数：约 50 ms，至少一个渲染量子（128）。 */
export function callPcmWorkletChunk(sampleRate: number): number {
  return Math.max(128, Math.round(sampleRate * 0.05));
}

export interface CallPcmWorklet {
  /** 断开并停止接收（幂等）。 */
  dispose(): void;
}

/**
 * 加载处理器、建节点、接到 `source` 上，把每块单声道 Float32 交给 `onSamples`。
 * 浏览器不支持 AudioWorklet，或模块加载被拦（例如内容安全策略不放行 blob:）→ 返回 null，调用方回落 ScriptProcessor。
 */
export async function connectCallPcmWorklet(
  ctx: AudioContext,
  source: AudioNode,
  onSamples: (samples: Float32Array) => void,
): Promise<CallPcmWorklet | null> {
  if (typeof AudioWorkletNode === "undefined" || !ctx.audioWorklet) return null;
  const url = URL.createObjectURL(new Blob([CALL_PCM_WORKLET_SOURCE], { type: "text/javascript" }));
  try {
    await ctx.audioWorklet.addModule(url);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(ctx, CALL_PCM_WORKLET_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { chunk: callPcmWorkletChunk(ctx.sampleRate) },
  });
  let disposed = false;
  node.port.onmessage = (event: MessageEvent<unknown>) => {
    if (disposed) return;
    const data = event.data;
    if (data instanceof Float32Array && data.length > 0) onSamples(data);
  };
  source.connect(node);
  node.connect(ctx.destination);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      node.port.onmessage = null;
      try {
        source.disconnect(node);
      } catch {
        /* 已断开 */
      }
      try {
        node.disconnect();
      } catch {
        /* 已断开 */
      }
    },
  };
}
