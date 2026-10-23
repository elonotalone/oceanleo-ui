# V02 journal（每条实测结论一行）

- 05:08Z [实测] harness 可用：验收账号登录 `/library`，`htmlClass=light`，库里只有父 agent 的 `[P] notes.txt`（root `467fd217`）。验收账号历史 root 144 个，现存 1 个，`editorInternal` 现存 0 个。
- 05:10Z [实测] 库卡片 DOM：`[data-collection-card-grid] > div > button[aria-label="预览「<标题>」"]`；验收账号是全波共用账号（已见 `[W07] sample.pptx`），所以 V02 的计数一律按标题前缀 `[V02]` 过滤。
- 05:20Z [实测] 开发槽过载：`/advanced/presentation_editing` 两次 150s 导航超时，curl 502（78s）；`/library` curl 200s 超时。容器日志在 05:16–05:20Z 每 30–90s 一次「shared UI source changed」（owner 们在改共享源码）。等一会儿重试。
