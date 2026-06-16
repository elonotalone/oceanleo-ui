// @oceanleo/ui — 统一 Tailwind preset（单一事实源的设计令牌）
//
// 各站在自己的 tailwind.config.* 里：
//   import preset from "@oceanleo/ui/tailwind-preset";
//   export default {
//     presets: [preset],
//     content: [
//       "./app/**/*.{ts,tsx}",
//       "./components/**/*.{ts,tsx}",
//       "./node_modules/@oceanleo/ui/src/**/*.{ts,tsx}",  // ← 让共享组件的类名被扫到
//     ],
//   };
//
// Tailwind v3 直接吃 presets；v4 也兼容（v4 仍支持 JS preset via @config 或
// tailwind.config）。改这里 = 改全站配色/圆角/字号基线。

// 用结构化的宽松类型而非 import("tailwindcss")，这样本包在 v3 / v4 两代消费端
// 都不强依赖 tailwindcss 的具体类型版本（preset 本身只用到 theme.extend）。
type LoosePreset = { theme?: { extend?: Record<string, unknown> } };

const preset: LoosePreset = {
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Noto Sans SC",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      colors: {
        // 全家桶中性底色（侧栏背景 / 卡片描边等都基于这套灰）
        leo: {
          bg: "#f7f3eb",
          fg: "#292524",
          sidebar: "#f7f7f7",
        },
      },
      borderRadius: {
        leo: "0.75rem",
      },
    },
  },
};

export default preset;
