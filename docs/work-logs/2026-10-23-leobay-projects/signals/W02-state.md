# W02 state

更新：2026-10-23 18:45（开工）

## 已确认的事实
- 工作区在开工前就带着上一轮 `2026-10-23-bay-library-dashboard` 波（W1/W2/W3）未提交的改动：`src/shell/collection-items.tsx`（未跟踪）、`BayList.tsx`、`BayAppShelf.tsx`、`BayLessonShelf.tsx`、`asset/BayAssetCard.tsx`、`asset/BayAssetLibrary.tsx` 已被它改过（view 属性 + CollectionItem*）。这些文件在我的边界里，提交时会连带提交；`collection-items.tsx` 不在任何 owner 边界，HEAD 的 `src/shell/index.ts` 已经导出它——需要父 agent 提交。
- 基线：共享 UI typecheck 3 条错在 video-project-doc.ts（别人的）。

## 正在做
- 读代码：BayList / bay-links / use-bay-data / asset / panel / feed.ts / bay_feed.py

## 下一步
1. 后端 `_service_query` 的 listing_kind 过滤 + 测试
2. `bay-links.ts` 加 other；`use-bay-data.ts` 出售侧传 listing_kind
3. BayList：出售/求购并成一个下拉；种类下拉五个名字
4. BayAppShelf / BayLessonShelf 接 listing_kind=app / lesson
5. 素材库「卖家在售」来源；筛选的字
6. PanelBrowse 同步
7. 测试 tests/lbp-w02-browse.test.mjs；改绿被打红的

## 复现命令
见 _COMMON.md §2
