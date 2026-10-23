# W03 journal（实测结论，一行一条，追加）

- 2026-10-23 18:5x 开工。边界 151 文件；带 服务/素材/作品/成品 的 187 行，约 66 文件。
- 边界内 BayAppCard/BayBundleCard/BayLessonCard 带别人未提交改动（collection-items 重构），本人不碰。
- 实测：`网站与软件服务` 只有 en.ts 有英文，其余 15 语缺（发布表单标签在非中文语种会回退中文）；人工服务/现成文件/课程/其他 17 语齐全（bay-mine-copy / bay-posting-copy / 基础词典）。
- 2026-10-23 21:05 重派后复核：上一轮没有任何 W03 源码改动入库；工作区干净，三个 collection-items 文件（BayAppCard/BayBundleCard/BayLessonCard）已由父入库，可以改。
- 实测：本机 `pnpm typecheck` 改完源码后 exit 0（W16 已修掉那 3 条基线错）。
- 实测：「网站与软件服务」15 语译文已由 W04 分表补齐（lbp-w04-copy.ts），本表不重定义，长句里照它的译法写。
- 实测：基线相关测试 126 个里有 19 个本来就红（bay3-page、bay-needs-help 等 5 个是测试里 domain-family 桩缺 `runtimePageOrigin` 导出，整份没执行，和我无关；bay-seller-copy / bay-settings-copy / bay-shell-copy 的「tt 字面量都有 16 语译文」红是别的 owner 的新词条）。
- 判定：作品=库条目（LibraryWorkPicker/附带作品/课程章节/打开作品）、作品图=图集名、抄袭他人作品、作品集、图表成品、原始素材、专业服务站网页、交付一件成品 —— 非种类，保留（共 18 句，写进 tests/lbp-w03-kind-names.test.mjs 的 KEEP 并逐条有理由）。
- 做完：apps/app*/ 全部「作品」→「网站或软件」（71 处）；supply/seller/deal/orders 的「服务」→「商品」或省略名词（44 处）；ServiceCard 角标按 listing_kind 五类取名；ServiceEditorPane 徽标改 offerKindLabel；预览里「素材」→「文件」。新分表 59 句 × 16 语。
