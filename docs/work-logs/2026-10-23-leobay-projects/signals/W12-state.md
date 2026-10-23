# W12 state（帮助文与其余法律页跟上本波的改动）

更新：2026-10-23 开工后第 1 步结束（读完全部 content/help、三个测试、各 owner 已提交代码），进入逐篇改写

## 已确认的事实
- bootstrap 已跑；任务书/_COMMON/合同/W01–W11 任务书与 state/journal/W07 交卷已读。
- 门户 `/root/projects/oceanleo` 工作区有别人未提交文件（不碰）：package.json、pnpm-lock.yaml、.github/workflows/oceanleo-cn-frontend.yml、backend/scripts/retire_operator_examples_20261021.py、W11 的 app/projects/page.tsx + components/project/* + tests/project-*。
- 我的边界：门户 content/help/**、app/refund/page.tsx、app/privacy/page.tsx、app/legal/subprocessors/page.tsx、三个帮助测试（仅限测试钉了已被操作员拍板改掉的旧说法）。
- 已提交代码里的真实结构（改写依据）：
  - 逛 LeoBay：页头 搜索「搜索 LeoBay」/查看选项(仅看收藏)/网格列表/按键「我的」「发布」；第二行 出售⌄(出售|求购) 种类⌄(人工服务|现成文件|网站与软件服务|课程|其他) 站点⌄(全部站点；人工服务栏末尾多「专业咨询」)；现成文件栏 站点下拉换成素材库自己的筛选，来源含「卖家在售」(境内没有)；境内 /bay 只剩现成文件库。
  - 发布：顶上「我想要卖还是买」+「分类」；卖 → 「你交付什么」五选一；块 产品信息/价格/向谁展示/交付条款(默认收起)；按钮 存草稿/发布（网站与软件服务、课程叫「上架」）。
  - 我的：下划线页签 交易(列表下拉 我发布的/我卖出的/我买到的/我的收藏 + 类别下拉 全部类别/现成文件/人工服务/网站与软件服务/课程/其他) / 我的主页 / 数据面板；我买到的每行有金额，有订单的行有「查看对账单」；我发布的不含需求(10-14 起)。
  - 我的主页：别人看到的那张页，按键 公开主页/编辑主页；编辑有 底色/主色/字体/封面、公开主页开关、取消/保存主页、版块 上移/下移/删除/添加版块，页底「资质核验」白卡(仅本人、LeoBay 开着)。
  - 数据面板：累计收入/本段收入/托管中/收款状态/…、商品明细、收入流水(逐笔、单笔对账单、导出 CSV、加载更多)。
  - 设置 → LeoBay：只有一页「付款卡」+「收款账户」。设置 → 账户：多一行「用 OceanLeo 账号登录的应用」(管理)。
  - LeoChat：收件箱最上方「通知」行(未读数+最新标题)→通知列表(全部标记已读)；内容处置经通知进入，地址 /leochat?im=cases。
  - 条款页 /legal/marketplace：第 7 节 #fees、第 10 节 #bay-terms（W07 交卷）。
- 测试钉子：见 journal；bay 文章禁用「人才市场」；「真人协作」只在 what-is-bay 以「原名…更早叫」出现 1 次；bay 文章不能写 /leochat；站内链接只许 oceanleo.com 的 4 个法律路径；每篇末尾「还没解决？在右上角和我们聊」。
- 基线红(非我造成)：bay-portal-help.test.mjs「新事实」一条缺 LeoSlides。

## 正在做
- 第 2 步：逐篇改写（先 bay/ 13 篇，再 account/content-cases、sites/*、wallet/*、status/*），然后三个法律页。

## 下一步
3. 三个法律页「人才市场」→ LeoBay（中英两段）
4. 更新 bay-portal-help.test.mjs 里钉旧说法的断言（我的五块、素材/服务形式、素材在哪标题、同一排类目…）
5. 跑三个测试；红的修内容
6. 交卷 verdicts/W12-delivery.md（oceanleo-ui 仓）并提交；内容改动提交在 oceanleo 仓

## 复现命令
cd /root/projects/oceanleo && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --test tests/help-content.test.mjs tests/bay-portal-help.test.mjs tests/help-route-public.test.mjs
