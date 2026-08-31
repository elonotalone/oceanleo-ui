"use client";

import { useEffect, useRef } from "react";

/**
 * 音频封面：把字节解出来画成波形。
 *
 * 从 `workspace-library-cover.tsx` 拆出来，是因为那份文件顶到了 800 行硬顶，而这一段
 * 正好是它里面唯一自成一体的东西 —— 判据那半边（媒体类型白名单、封面证据、渲染器选择）
 * 全是纯函数，这一段则是唯一自己出网、自己建 AudioContext、自己管生命周期的组件，
 * 两边不共用任何常量。按这条缝切，两份各自都还读得懂。
 *
 * 拆出来在过去是不许的：本族模块被渲染测试编成 `data:` 模块加载，而 `data:` 模块里
 * 留下的相对 specifier 在运行期会炸。W28 的编译台（`tests/helpers/module-bench.mjs`）
 * 之后这条限制没有了 —— 相对 specifier 一律自动解析成真模块。
 */
export function AudioCoverWaveform({
  url, alt, className, resourceKey, mediaType, onReady, onError,
}: {
  url: string; alt: string; className: string; resourceKey: string;
  mediaType: string; onReady: () => void; onError: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onError();
      return;
    }
    const width = 640;
    const height = 360;
    canvas.width = width;
    canvas.height = height;

    void (async () => {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: "omit",
          mode: "cors",
        });
        if (!response.ok) throw new Error(`audio cover HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        if (!alive) return;
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AudioCtx) throw new Error("AudioContext unavailable");
        const audioCtx = new AudioCtx();
        try {
          const decoded = await audioCtx.decodeAudioData(buffer.slice(0));
          if (!alive) return;
          const channel = decoded.getChannelData(0);
          const bars = 64;
          const samplesPerBar = Math.max(1, Math.floor(channel.length / bars));
          const peaks: number[] = [];
          for (let i = 0; i < bars; i += 1) {
            let peak = 0;
            const start = i * samplesPerBar;
            const end = Math.min(channel.length, start + samplesPerBar);
            for (let j = start; j < end; j += 1) {
              peak = Math.max(peak, Math.abs(channel[j] || 0));
            }
            peaks.push(peak);
          }
          const maxPeak = Math.max(...peaks, 0.001);
          ctx.fillStyle = "#1c1917";
          ctx.fillRect(0, 0, width, height);
          const barWidth = width / bars;
          for (let i = 0; i < bars; i += 1) {
            const amplitude = peaks[i] / maxPeak;
            const barHeight = Math.max(4, amplitude * (height * 0.72));
            const x = i * barWidth + barWidth * 0.18;
            const y = (height - barHeight) / 2;
            ctx.fillStyle = `hsl(${210 + amplitude * 40} 72% ${42 + amplitude * 28}%)`;
            ctx.fillRect(x, y, barWidth * 0.64, barHeight);
          }
          onReady();
        } finally {
          void audioCtx.close();
        }
      } catch {
        if (alive) onError();
      }
    })();

    return () => {
      alive = false;
      controller.abort();
    };
  }, [mediaType, onError, onReady, resourceKey, url]);

  return (
    <canvas
      ref={canvasRef}
      data-cover-renderer="audio"
      data-cover-fit="contain"
      data-cover-media-type={mediaType}
      role="img"
      aria-label={alt}
      className={className}
    />
  );
}
