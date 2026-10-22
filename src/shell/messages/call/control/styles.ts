// 远程控制界面的行内样式。共享界面的 ui.css 是构建产物（tests/theme-artifact-in-sync 判 HEAD），
// 这里不新增任何样式类，全部用行内样式 + 主题变量（深浅色都跟随宿主，带浅色兜底值）。
import type { CSSProperties } from "react";

/** 远程控制的提醒色（橙）：被控是高危状态，要一眼看到。 */
export const CONTROL_ACCENT = "#ea580c";
export const CONTROL_ACCENT_SOFT = "rgba(234, 88, 12, 0.12)";
export const CONTROL_ACCENT_BORDER = "rgba(234, 88, 12, 0.38)";

export const cardStyle: CSSProperties = {
  pointerEvents: "auto",
  background: "var(--card, #ffffff)",
  color: "var(--fg, #292524)",
  border: "1px solid var(--border, rgba(0, 0, 0, 0.08))",
  borderRadius: 14,
  boxShadow: "0 12px 32px rgba(0, 0, 0, 0.18)",
  padding: "12px 14px",
  fontSize: 13,
  lineHeight: 1.5,
  boxSizing: "border-box",
  maxWidth: "100%",
};

export const titleStyle: CSSProperties = { fontWeight: 600, fontSize: 14, margin: 0 };
export const mutedStyle: CSSProperties = { color: "var(--muted, #78716c)", fontSize: 12, margin: 0 };
export const rowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };

export const buttonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  minHeight: 30,
  padding: "4px 12px",
  borderRadius: 999,
  border: "1px solid var(--border, rgba(0, 0, 0, 0.12))",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: "1px solid transparent",
  background: CONTROL_ACCENT,
  color: "#ffffff",
};

export const iconButtonStyle: CSSProperties = {
  ...buttonStyle,
  minHeight: 26,
  width: 26,
  padding: 0,
  border: "0",
};

/** 盖在视频上的深色胶囊（视频上永远是深底白字，不随主题）。 */
export const overlayPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "6px 8px 6px 12px",
  borderRadius: 999,
  background: "rgba(17, 17, 17, 0.78)",
  color: "#ffffff",
  fontSize: 12,
  lineHeight: 1.4,
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.3)",
  maxWidth: "calc(100% - 24px)",
};

export const srOnlyStyle: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};
