# V04 journal（每条实测结论一行，UTC）

- 05:07Z 开工：bootstrap 通过，HEAD `89f9070f`，无 `*-to-V04` 信号，`verdicts/` 为空。
- 05:15Z [实测] 生成 `[V04]` 素材 10 份（`/tmp/v04/`）：docx 带用户红字/蓝字/黄高亮，xlsx 带用户红字、黄底、深蓝底白字（D6「用户颜色保留」要用）。
- 05:18Z [实测] 上传场景 `upload.mjs`：`page.goto('/library')` 150 s 超时；`curl` 槽 `/`、`/library`、`/favicon.ico`：TLS 40 ms 通，120 s 无首字节。`oceanleo-dev-slots-fresh.sh status`：槽 `FRESH(dev)`。根因 W02 / W11 已报父 agent（`signals/W11-to-parent.md`：会话代理上游连接池 64 满）。V04 不重启、不绕过，先写场景，隔几分钟重试。
