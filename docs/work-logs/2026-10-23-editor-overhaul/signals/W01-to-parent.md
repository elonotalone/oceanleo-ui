# W01 → parent

- 2026-10-23 ~09:50Z：开发槽 `p-511af…dev.oceanleo.com` 无响应（`curl /library` 60 秒 0 字节；场景里 `page.goto` 150 秒超时，light / dark 各一次）。W01 没有重启任何东西，等它恢复再补网站一件的两档验收。
- 门户没有任何 toast 在渲染：`@oceanleo/ui` 的 `useToast()` 入队后控制台警告「没有任何 <ToastProvider> / <ToastViewport> 在渲染它」，DOM 无 `[data-leo-toast-viewport]`；门户 `app/layout.tsx` 只挂了 sonner 的 `<Toaster>`，没有 `registerToastHost()`。全门户所有 `@oceanleo/ui` toast（不止 W01）都被静默丢掉。请父 agent 在门户外壳挂一次 `<ToastViewport />`（或用 `registerToastHost` 桥到 sonner）。W01 已在 `···` 旁兜底显示反馈，有 toast 后会自动让位。
- 09:58Z 后：槽已恢复（父 agent 确认），网站两档已补跑通过，此条结案。
