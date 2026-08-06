# `tests/repro/` —— 一次性复现脚本

这里放的**不是**测试（`pnpm test` 的 glob 是 `tests/*.test.mjs`，不会收进来），
而是「某条结论当初是怎么亲手看出来的」的原始脚本。判据固化在同名的 `*.test.mjs` 里；
这些脚本留着，是为了下一个人能把同一幕再放一遍，而不是只能读别人的转述。

在仓根跑：

```
node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs tests/repro/<脚本>
```

## W4 · 失败面与操作入口（2026-08-06）

结论与读数：`docs/work-logs/2026-08/explore-inplace-preview/signals/W4-journal.md`
（在 `/opt/cursor-workspaces/oceandino`）。

| 脚本 | 回答的问题 |
|---|---|
| `w4-browser-fetch-message.mjs` | 「Failed to fetch」是谁发出的？（真 Chromium，三种传输层失败成因） |
| `w4-client-error-passthrough.mjs` | `artifact-client` 拿到那个异常后往上交什么字符串？ |
| `w4-detail-failure-render.mjs` | 用户在详情里到底看到什么？带 `MODE=ok` 对照组 |

`w4-browser-fetch-message.mjs` 直接用 `playwright-core`，跑法是普通的 `node <脚本>`。
