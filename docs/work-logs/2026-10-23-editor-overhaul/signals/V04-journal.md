# V04 journal（每条实测结论一行，UTC）

- 05:07Z 开工：bootstrap 通过，HEAD `89f9070f`，无 `*-to-V04` 信号，`verdicts/` 为空。
- 05:15Z [实测] 生成 `[V04]` 素材 10 份（`/tmp/v04/`）：docx 带用户红字/蓝字/黄高亮，xlsx 带用户红字、黄底、深蓝底白字（D6「用户颜色保留」要用）。
- 05:18Z [实测] 上传场景 `upload.mjs`：`page.goto('/library')` 150 s 超时；`curl` 槽 `/`、`/library`、`/favicon.ico`：TLS 40 ms 通，120 s 无首字节。`oceanleo-dev-slots-fresh.sh status`：槽 `FRESH(dev)`。根因 W02 / W11 已报父 agent（`signals/W11-to-parent.md`：会话代理上游连接池 64 满）。V04 不重启、不绕过，先写场景，隔几分钟重试。
- 05:25Z 父 agent 通知：槽代理连接池已扩到 512 并重启；之前的浏览器失败重跑即可（不再排查）。
- 05:31Z [实测] `[V04]` 素材 10 份全部入库（验收账号）：docx `8f8f41ad-9a68-4ce4-beee-7ba673e555f0`、xlsx `9c1c6d50-eefd-4bc5-933a-a0494595d038`、pdf `bccc84be-1c59-4eb5-9d05-a71ea14ad491`、txt `e79ffa48-d9a4-40d4-b164-33729595f2c5`、md `73d172d1-95a0-4cb6-b6e0-f46b48f2be06`、pptx(deck) `bba5fd2b-e79e-4cb4-889f-270f28c38b35`、png(image) `918a500e-437f-4f98-b898-34bd9626a886`、mp3 `28e2e11f-8822-4b8b-ba8e-56f0051dca1b`、mp4 `9fa5a16c-d5ab-4832-8352-a61e8ca0f730`、glb `77659f13-064d-48ed-8e50-4670e56d5263`。
