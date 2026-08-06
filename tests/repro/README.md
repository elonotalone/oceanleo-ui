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
| `w4-before-tree.mjs` | 搭一棵「改前」的影子树（符号链接 + 旧版本的那四份文件），不动工作区 |

改前改后同一幕对着看（`W4_SRC_ROOT` 对后两个脚本都有效）：

```
W4_SRC_ROOT=$(node tests/repro/w4-before-tree.mjs) \
  node --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
  tests/repro/w4-detail-failure-render.mjs
```

`w4-detail-failure-render.mjs` 的两个开关：`MODE=ok` 换成成功的对照组；
`HOLD_DOWNLOAD=1` 把下载那一次请求停在半路，用来看下载在跑时收藏还按不按得动。

`w4-browser-fetch-message.mjs` 直接用 `playwright-core`，跑法是普通的 `node <脚本>`。
