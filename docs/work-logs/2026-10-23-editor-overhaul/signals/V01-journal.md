# V01 journal（每条实测结论一行）

- 05:18Z [实测] 开发槽 `/library` 首次请求 150s 超时；父 agent 告知 05:09–05:25Z 是预览代理连接池满（已扩容重启），非产品问题，按指示重跑、不发信号。
- 05:22Z [实测] 未设 `NEXT_LOCALE` 时界面是英文（headless Chromium 的 Accept-Language=en-US）；`NEXT_LOCALE=zh` 切中文有效。之后每个场景都显式设语言。
- 05:26Z [实测] `[V01]` 素材 10 件已在验收账号库里（txt md docx pdf xlsx pptx png mp3 mp4 glb，均 ordinal 1）：txt `2fab19a3` md `4df2e961` docx `c28563ba` pdf `bfc6c630` xlsx `746355d2` pptx `2feaad77` png `ee334f45` mp3 `f913e0e4` mp4 `7def8144` glb `8ab73f0a`。
- 05:25Z [实测] 编译中途打开的页面会出现「Router action dispatched before initialization」并停在「正在加载我的库…」、账号显示「登录」；重跑即好（槽热更新的瞬态，不判产品红）。
