// ui/index 从 ./Toast 再导出 TOAST_DWELL / ToastProvider 等。谁把
// ../ui/Toast 打成只剩 useToast 的桩，汇总口加载期就会整文件死掉。

export const TOAST_BARREL_STUB_SOURCE = `
export const TOAST_MAX_VISIBLE = 3;
export const TOAST_DWELL = Object.freeze({
  success: 4000,
  info: 6000,
  error: 0,
  loading: 0,
});
export function ToastProvider({ children }) {
  return children;
}
export function ToastViewport() {
  return null;
}
export function ensureToastMotionStyles() {}
`;
