# W02 交卷 · LeoBay 逛：出售/求购下拉、种类新名字、每一类里显示的就是按这一类发布的东西

2026-10-23，W02（重派后接手；上一轮只读了代码，边界内没有遗留改动）。不 push、不重启容器、不写库、不开浏览器。

提交（main）：

| 仓 | 提交 |
|---|---|
| 门户后端 `/root/projects/oceanleo` | `3145092`（信息流出售侧按 listing_kind 筛 + 新测试） |
| 共享 UI `/root/projects/oceanleo-ui` | `5ceebf4a`（前端主体）、`bc83fd4f`、`4491dd92`、交卷提交（见文末「提交号」） |

## 1. 用户看到的变化

1. `/bay` 第二行：**出售 ⌄ · 人工服务 ⌄ · 全部站点 ⌄**。原来并排的「出售」「求购」两个胶囊并成一个下拉（值 出售 / 求购），后面是「种类」下拉，再后面是站点下拉。样式、只写当前值、读屏名都由 W01 的共用 `BayFilterSelect` 负责，这边只传参。键盘（方向键、Home/End、Enter、Esc）与读屏（listbox + option、按键 aria-label）也是它提供。
2. 种类五个，名字统一（§5.1）：**人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他**（英文 Human service / Ready-made files / Website & software service / Lessons / Other）。顺序就是下拉里的顺序。求购侧也有同样五个（改的是 `offer`，不离开求购）。
3. **每一类里显示的就是按这一类发布的东西**（见 §2）。以前按任何一类发布的东西都出现在「服务」里。
4. 现成文件的「来源」下拉：第一项**卖家在售**；有已发布的卖家现成文件时默认它，否则保持原来的默认。「我的」改名**我上传的**。选「卖家在售」时，类型 / 目录 / 行业 / 成套 / 授权说明收起，多一个「全部站点」下拉。
5. 筛选的字：站点「全部站点」；素材库目录「全部目录」（行业「全部行业」、类型「全部类型」原本就带名词）；素材库的类型下拉读屏名改叫「文件类型」，与页级「种类」不再同叫 Type。
6. 右侧栏同步：同一套下拉；搜索提示改「搜索 LeoBay」；站点「全部站点」。
7. 清除筛选（空列表时的键）只清搜索词和站点，种类留在原处（以前会把「其他」/「网站与软件服务」之类的种类一并重置成人工服务）。

## 2. 每一类显示什么

| 种类（界面） | 内部值 | 地址 | 显示的数据 | 取数 |
|---|---|---|---|---|
| 人工服务 | `service` | `/bay`（默认，不写 kind） | 人工服务 + 答疑 | `GET /v1/talent/bay/feed?kind=supply&listing_kind=service` |
| 现成文件 | `asset` | `?kind=asset` | 素材库（官方成品、我上传的、开源专区、实时搜索）+ 来源「卖家在售」 | 素材库照旧；卖家在售：`kind=supply&listing_kind=digital`（只在有交易市场的站点；境内没有） |
| 网站与软件服务 | `app` | `?kind=app` | 站点上架的应用与网站（`bay_apps`）在前，卖家按这一类发布的条目接在后，同一张网格 | 现有数据 + `kind=supply&listing_kind=app`；两边都空才显示空态 |
| 课程 | `lesson` | `?kind=lesson` | 「课程」页签：站点开的课（`bay_lessons`）在前，卖家按这一类发布的条目接在后；「套餐」页签只有套餐 | 现有数据 + `kind=supply&listing_kind=lesson`；两边都空才显示空态 |
| 其他 | `other` | `?kind=other` | 按「其他」发布的条目 | `kind=supply&listing_kind=other` |
| 求购 | `request` + `offer` | `?kind=request[&offer=asset\|app\|lesson\|other]` | 需求（含求助，求助只给专家看） | `kind=needs&listing_kind=<offer 对应的发布种类>`，没写 offer = 人工服务 |

种类 → 发布种类：人工服务 `service`、现成文件 `digital`、网站与软件服务 `app`、课程 `lesson`、其他 `other`（`bayListingKindFor`，`bay-links.ts`）。

「卖家在售」默认规则：用一次 `limit=1` 的探测（与搜索词、站点无关）知道有没有已发布的卖家现成文件；有且用户还没动过类型 / 来源且地址没钉来源时默认它；探测没回来时画骨架、不先画自有再跳；用户换了类型或来源之后不再抢默认；`?view=owned` 等地址钉住的来源优先；境内（`bayEnabledHere()` 为假）既不探测也不认 `?view=sellers`。

## 3. 后端参数语义（I-10）

`GET /v1/talent/bay/feed` 的 `listing_kind`（`service` / `digital` / `app` / `lesson` / `other`）出售（`supply`）与求购（`needs`）两侧都生效：

- `service` = `listing_kind` 为 `service` **或空**（老行）；其余五值中的另外四个等值匹配。口径与求购侧 `_demand_query` 一致（`listing_kind.eq.service,listing_kind.is.null`）。
- `consult`（答疑）、`help`（求助）本身没有发布种类，它们就是「人工服务」：只在**不传或传 `service`** 时出现；传 `digital` / `app` / `lesson` / `other` 时两者都不出（`kind=consult&listing_kind=digital` 直接返回空页）。
- 不传、传空串、传不认识的值（含大小写不对、塞了逗号的）= 不筛，与改之前一模一样；不报 400。
- 搜索 `q` 和 `listing_kind=service` 会叠两个 `or_()`：已用真 PostgREST 只读验证过，叠起来是 AND（`slug.eq.design,slug.eq.video` AND `slug.eq.video` → 只剩 `video`），所以搜索词与种类叠加是对的。
- 搜索 `q`、站点 `category`、游标翻页与它叠在一起仍然不重不漏。
- 库里 `talent_services.listing_kind` 是 `NOT NULL DEFAULT 'service'`（0273 起允许 `other`），不需要迁移。现存数据：2 条草稿（other、service 各一）；`bay_apps` 2 条未发布；`bay_lessons` 0 条——改动不影响已有数据。

## 4. 旧地址兼容表

页面种类 `?kind=`（`normalizeBayFeedKind` / `canonicalBayFeedKind`）：

| 地址里的值 | 落到 |
|---|---|
| 没写 / `service` / `supply` / `all` / `consult` | `service`（人工服务） |
| `asset` / `material` | `asset`（现成文件） |
| `app` | `app`（网站与软件服务） |
| `lesson` | `lesson`（课程） |
| `other`（新） | `other`（其他） |
| `request` / `demand` / `help` | `request`（求购） |
| 其它任何值 | 当没写（人工服务） |

`?kind=request&offer=service\|asset\|app\|lesson` 照旧；`offer=other` 是新的（靠 `bay-state.ts` 的白名单，父 agent 已加，`9a31e864`）。素材库地址参数 `type` / `view` / `cat` / `series` / `asset` 全部照旧，`view` 多一个值 `sellers`（`owned` / `stocked` / `mine` / `live` / `open` / `library` / `series` 不变）。`?bay=` 深链（`service:<id>`、`app:<id>`、`lesson:<id>` 等）一个字没动。

## 5. 文件清单

共享 UI（`/root/projects/oceanleo-ui`）：

- `src/shell/bay/shell/bay-links.ts`：`BAY_FEED_KINDS` 六值（含 `other`）、`BAY_SELL_KINDS`、`BAY_SELL_KIND_LABEL`、`bayListingKindFor`、`isBaySellKind`
- `src/shell/bay/shell/use-bay-data.ts`：`bayFeedRequestFor`、`useBayFeed(filter, signedIn, options?)`（`options = { listingKind?, enabled?, limit? }`）
- `src/shell/bay/shell/BayList.tsx`：`BayViewSwitch` 改成两个下拉；站点「全部站点」；清除筛选语义；`startPublish` 认 `other`
- `src/shell/bay/shell/BayFeedItemCard.tsx`（新）：`FeedCard` / `targetForFeedItem`，信息流、货架、卖家在售共用
- `src/lib/bay/feed.ts`：`BayFeedListingKind` 含 `other`，`listing_kind` 两侧通用
- `src/shell/bay/apps/BayAppShelf.tsx`、`src/shell/bay/lessons/BayLessonShelf.tsx`：现有数据之后接卖家发布的条目
- `src/shell/bay/asset/BayAssetLibrary.tsx`、`BayAssetSellers.tsx`（新）、`origin-index.ts`、`library-client.ts`：来源 `sellers`
- `src/shell/bay/panel/PanelBrowse.tsx`
- `src/i18n/ui/messages/lbp-w02-copy.ts`：6 条新词（全部站点、全部目录、我上传的、卖家在售、网站与软件服务、登录后查看你上传的这一类文件。），16 语齐全
- 测试：`tests/lbp-w02-browse.test.mjs`（新）；小范围精确改了 `bay3-page`、`bay4-browse`、`bay5-panel`、`bay-apps-nav`、`bay-lessons-nav`、`bay-template-shelf`、`bay-shell-feed`、`bay-shell-copy`

门户后端（`/root/projects/oceanleo`）：`backend/app/talent/bay_feed.py`、`backend/tests/test_bay_feed_listing_kind.py`（新）。

## 6. 测试命令与结果原文

共享 UI（轻活，逐个文件）：

```bash
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
```

```
tests/lbp-w02-browse.test.mjs  tests=46 pass=46 fail=0 todo=0
tests/bay3-page.test.mjs  tests=16 pass=16 fail=0 todo=0
tests/bay4-browse.test.mjs  tests=9 pass=9 fail=0 todo=0
tests/bay5-panel.test.mjs  tests=9 pass=9 fail=0 todo=0
tests/bay5-categories.test.mjs  tests=5 pass=5 fail=0 todo=0
tests/bay-apps-nav.test.mjs  tests=6 pass=6 fail=0 todo=0
tests/bay-apps-shelf.test.mjs  tests=2 pass=2 fail=0 todo=0
tests/bay-asset-browse.test.mjs  tests=15 pass=15 fail=0 todo=0
tests/bay-asset-library.test.mjs  tests=4 pass=4 fail=0 todo=0
tests/bay-artifact-deep-link.test.mjs  tests=4 pass=4 fail=0 todo=0
tests/bay-collection-views.test.mjs  tests=8 pass=8 fail=0 todo=0
tests/bay-lessons-nav.test.mjs  tests=5 pass=5 fail=0 todo=0
tests/bay-lessons-shelf.test.mjs  tests=5 pass=5 fail=0 todo=0
tests/bay-shell-feed.test.mjs  tests=6 pass=6 fail=0 todo=0
tests/bay-shell-state.test.mjs  tests=16 pass=16 fail=0 todo=0
tests/bay-template-shelf.test.mjs  tests=8 pass=8 fail=0 todo=0
tests/bay-toolbar.test.mjs  tests=6 pass=6 fail=0 todo=0
tests/bay-shell-copy.test.mjs  tests=3 pass=3 fail=0 todo=0
```

- `lbp-w02-browse` 里「bay-state 的求购 offer 白名单认 other」那条原先是 `todo`（`bay-state.ts` 不归我）；父 agent 已按 §9 第 1 条改了 `bay-state.ts`（`9a31e864`）并把它转成正式测试（`7ba00bc0`），现在 46 条全绿。
- `bay-shell-copy` 第 3 条原来只认 `bay-copy.ts` 和基础词典，认不出各 owner 写在自己 `lbp-wNN-copy.ts` 里的新词条（`全部站点`、`网站与软件服务`、W04 的 `列表` 都因此红）。我在该测试里做了一处小范围精确改：外壳源码里的句子在最终的运行时总表 `UI_MESSAGES`（用户真正查的那一份）里有 16 语译文就算数。现在 3/3 绿。
- 新增的 `lbp-w02-browse` 覆盖：种类合同与旧值兼容、`bayFeedRequestFor` / `useBayFeed` 每类带对 `listing_kind`（含求购 `other`、现成文件默认不取、选项透传）、客户端查询串、出售/求购下拉与种类下拉（五个选项、名字、求购改 offer、读到的永远是真正在取的那一类）、站点「全部站点」、其他栏信息流、清除筛选、发布键按栏发布、两个货架（顺序、空态、加载中不算空、出错重试只重取出错那边、翻页）、素材库「卖家在售」（来源顺序与名字、默认规则、探测未回、换类型不再抢默认、地址钉住、境内、站点筛选、各「全部」带名词）、右侧栏、分表 16 语、英文命名。

后端：

```
$ cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_bay_feed_listing_kind.py -q
14 passed, 31 subtests passed in 2.96s
$ .venv/bin/python -m pytest tests/test_bay_feed_listing_kind.py tests/test_bay_feed.py tests/test_bay_feed_zones.py tests/test_bay_digital_listing.py tests/test_bay_posting.py tests/test_bay_related.py -q
154 passed, 139 subtests passed in 8.03s
$ .venv/bin/python -m pytest tests/test_bay_*.py tests/test_talent_services.py tests/test_talent_demands.py tests/test_talent_categories_v2.py -q -x -p no:cacheprovider
960 passed, 1454 subtests passed in 32.83s
```

类型检查 / 文案闸：见 §7、§8。

## 7. 类型检查

共享 UI `pnpm typecheck`（`agent-io-guard.sh run-heavy`，21:12 在最终代码上跑完）：输出只有一行 `$ tsc --noEmit`，没有任何 `error TS`，也没有 `ELIFECYCLE`，即 0 错误（开工时的 3 条 `video-project-doc.ts` 基线错已被别的工程修掉）。20:58 的上一次在排队等 heavy 槽时被别的 owner 改到一半的文件拖红过 10 条（`BaySettingsSection`、`BayMine`、`collection-chrome`），0 条在我的文件里。

门户 `pnpm typecheck`（21:20 跑完）：4 条错，全是依赖副本版本不一致，与 Bay 无关、也不是这一波引入的——`lib/oceanleo-ai.ts(24,3)`、`lib/supabase.ts(13,3)`（共享 UI 那份 `@supabase/supabase-js@2.108.1` 的 `SupabaseClient` 不能赋给门户那份）、`proxy.ts(58,27)` / `proxy.ts(58,47)`（共享 UI 的 `next@16.2.9` 与门户的 `next@16.2.6` 的 `NextResponse` / `NextRequest`）。门户的 `package.json` / `pnpm-lock.yaml` 在工作区里带着别人未提交的改动（`_COMMON` §3 点名的那批）。除此之外门户源码（`app/`、`components/`、`lib/`）里没有任何文件引用我改过或删掉的导出（`BAY_FEED_KINDS`、`canonicalBayFeedKind`、`useBayFeed`、`BayViewSwitch`、`BayAssetLibrary`、`TYPE_ZONES`、`ZONE_LABELS`、`BayAppShelf`、`BayLessonShelf`、`fetchBayFeed` 都 grep 过，零命中），`src/architecture/public-api.snapshot.json` 也没有这些名字。

## 8. 文案闸与其他红

- `tests/i18n-tt-key-coverage.test.mjs`：我新增的每条 `tt()` 都 16 语齐全（我的 `lbp-w02-browse` 里也有一条专查）。该文件现在有 3 条红，**只有一处与我有关**：第 9 条「历史基线不许留死条目」点名 `全部站点`——这条本来就在 `PRE_EXISTING_GAPS` 里（`AppMarket.tsx` 早就在用、一直没译），我补译之后它就该从基线表里删掉。测试文件不许我改，见 §9 第 2 条。第 8 条（别人的新词没译：`BaySettingsSection`、`messages/cases/*`、`Inbox` 等）和第 10 条（183 条没有调用点的死登记，编辑器那一波）不是我的。
- `tests/i18n-key-collision.test.mjs` 两条红是 `WORK_CHAT_MESSAGES:置顶` / `BAY_MESSAGES:游戏` / `IM_*` 的改写，不是我的分表（我的 6 条与基础词典英文一致，网站与软件服务 = `Website & software service`）。
- 本来就红、不归我：`bay-shell-hooks` 第 1 条（W08 的 `MESSAGES_VIEWS`）、`bay-seller-panes` / `bay-seller-profile-reveal`（W05 / W06 在改）、`bay-shell-static` 第 3 条（`BayMine.tsx` 的 `page` 类）、`plugin-module-hosting` 与 `e2-result-canvas-stability`（`Toast` / 右栏，别的工程）。

## 9. 对父 agent 的请求

1. **（已完成：父 agent `9a31e864`）`src/shell/bay/shell/bay-state.ts` 两处白名单加 `other`**。不改的后果是：求购侧下拉选「其他」会被丢回人工服务，地址 `?kind=request&offer=other` 也读不回来；出售侧的「其他」不受影响。当时请求的补丁是（`BayOfferKind` 的类型本来就自动含 `other`，只差运行期的字面量比较）：

   ```diff
   -    if (offer === "service" || offer === "asset" || offer === "app" || offer === "lesson") out.offer = offer;
   +    if (offer === "service" || offer === "asset" || offer === "app" || offer === "lesson" || offer === "other") out.offer = offer;
   ...
   -  if (raw === "service" || raw === "asset" || raw === "app" || raw === "lesson") return raw;
   +  if (raw === "service" || raw === "asset" || raw === "app" || raw === "lesson" || raw === "other") return raw;
   ```

   （前一处在 `normalizeFilter`，后一处在 `readPageOffer`。）
2. **`tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 删掉 `"全部站点"`**（约第 702 行；同一次第 9 条还点名了 `"解锁"`，那条不是我的）。
3. **重启开发网关**（`oceanleo-api` 挂载 `backend/` 但不热更新），然后跑 §10 的 HTTP 命令。在重启之前，新前端发出的 `listing_kind` 参数会被旧网关忽略——每一栏仍然显示全部服务，不会报错。
4. （顺手，不急）`src/lib/bay/types.ts` 的 `BayFeedItem.listing_kind` 类型是 `"service" | "digital"`，后端实际会给五个值；只是类型窄，运行期不受影响，我的代码没有读这个字段。该文件不在我的边界。
5. 不需要重编 `ui.css`：我新增的组件只用了同文件里已有的样式类；`bay-shell-static` 的样式类检查只点名了 `BayMine.tsx`（W04）。

## 10. 需要父 agent 重启网关后验证的 HTTP 命令

```bash
BASE=https://api.dev.oceanleo.com/v1/talent/bay/feed
for q in "kind=supply&listing_kind=service" "kind=supply&listing_kind=digital" "kind=supply&listing_kind=app" \
         "kind=supply&listing_kind=lesson" "kind=supply&listing_kind=other" "kind=supply" \
         "kind=needs&listing_kind=other" "kind=consult&listing_kind=digital" "kind=supply&listing_kind=bogus"; do
  printf '%-45s ' "$q"; curl -s -m 20 -w ' HTTP %{http_code}\n' "$BASE?$q&limit=5"
done
```

预期：九条都是 HTTP 200。库里目前没有已发布的服务 / 需求（只有 2 条草稿），所以都会是 `{"items":[],"next_cursor":null}`——这能证明过滤语法被真 PostgREST 接受、没有 503。我已经在不改网关的前提下验证过：用后端自己的 `.env` 在临时进程里对真库只读跑了 `bay_feed.feed`（`supply` / `needs` / `all` × 六种 `listing_kind`），全部 200 空列表、无报错。要看到「真的筛掉了」需要已发布的夹具，而造夹具要写生产库（本波禁止），所以分类行为由 `backend/tests/test_bay_feed_listing_kind.py`（假客户端，含翻页不重不漏）担保。

重启后用同一组命令对比重启前（旧网关忽略 `listing_kind`，现在也是空列表，所以重启前后表面看不出差别——有任何一条出 503 或 400 才是出问题）。

## 11. 没做完 / 判断后保留的

- 出售侧、求购侧的「其他」都已完整可用（求购侧靠父 agent 改的 `bay-state.ts`，`9a31e864`）。
- 「卖家在售」里不能按「文件类型」（图片 / PPT 模板 …）筛：卖家按「现成文件」发布的条目没有素材库那种类型，所以这一档把类型 / 目录 / 行业 / 成套收起来，换成站点筛选。想要类型筛选得先让发布表单记下文件类型（后端 `digital_work` 里有作品信息，但没有统一的类型字段）。
- 不在边界内、因此没动的：`LeoBayPage.tsx` 页头搜索提示「搜素材、服务、作品、课程、需求…」（W04）、`BayMine` / 「我的」里的类别名（W04）、发布表单与各详情页里的旧叫法（W03）、`bay_related`（右栏「与我的问题相关的服务」仍是不带 `listing_kind` 的 supply 查询，会混入非人工服务的条目；这是否要收窄是产品问题，没有改）。
- 没有开浏览器、没有截图（本任务未批准）。验证靠类型检查、测试、对真库的只读查询、对开发网关的 HTTP GET。
- **判定为非种类、原样保留的句子**（它们说的是素材库里的库存素材 / 用户自己的东西，不是种类名）：
  - `官方成品`（目录名，素材库「官方成品」那一档）、`OceanLeo 官方成品` / `我的成品`（授权徽标名，用户看不到全文）、`素材网关暂时读不到，稍后再试。`、`素材数`、`素材没读出来，请稍后再试。`、`正在打开这份素材…`、`共 {n} 件 · 风格统一的整套开源素材，可整套取用`、`暂无成套素材。`、`此素材需署名，使用时请保留：`、`外部素材` 等授权 / 出处说明里的「素材」（开源库存素材的统称）、授权说明里的「成品」「作品」（用户做出来的东西）。
  - 右栏 `RelatedServices.tsx` 的「与我的问题相关的服务 / 相关服务没读出来 / 没有直接匹配的服务」：泛指「能帮上忙的服务」，不是五个种类里的哪一个（已有 bay5-panel 测试钉着这些句子）。
  - 已改的：`登录后查看你这一类的成品。` → `登录后查看你上传的这一类文件。`（来源改名「我上传的」后跟着改）；`搜素材、服务、作品、课程、需求…` → `搜索 LeoBay`（右栏）；`SELL_KIND_LABEL` 的 服务 / 素材 / 作品 → 新五个名字；`全部` → `全部站点` / `全部目录`；`我的`（来源）→ `我上传的`；`类型`（素材库读屏名）→ `文件类型`。

## 12. 对别的 owner 的接口说明

- `BayViewSwitch`（`BayList.tsx`）名字与 props 不变；DOM 变了：`[data-bay-view]` 里不再有 `role="tablist"` / `role="tab"`，是两个 `BayFilterSelect`：`[data-bay-filter="intent"]`（值 `sell` / `buy`，外面的 `[data-bay-browse-intent]` 的值是 `sell` / `buy`）和 `[data-bay-filter="kind"]`（外面的 `[data-bay-browse-kind]`；值 `service` / `asset` / `app` / `lesson` / `other`）。素材库里新增的下拉名：`seller-site`；类型下拉名仍是 `type`，来源 `view`，目录 `cat`。
- `bay-links.ts` 新导出：`BAY_SELL_KINDS`、`BAY_SELL_KIND_LABEL`（五个种类的中文名，用时经 `tt()`）、`bayListingKindFor`、`isBaySellKind`；`BAY_FEED_KINDS` 现在是六值。W04 的「我的」类别名若要和逛的种类名保持一致，可以直接用 `BAY_SELL_KIND_LABEL`。
- `useBayFeed(filter, signedIn)` 老调用不变；第三个参数是可选的 `{ listingKind?, enabled?, limit? }`。`FeedCard`（`BayFeedItemCard.tsx`）是信息流条目的统一卡片 / 行，W03 如有货架要接信息流可以直接复用。
- `TYPE_ZONES` 变成 `["sellers", "owned", "mine", "stocked", "live"]`，`ZONE_LABELS.mine` 现在是「我上传的」；`defaultZone(type, counts)` 的 `counts` 多一个可选的 `sellers`。
- `BayFeed` 的「清除筛选」现在是 `setBayFilter({ ...filter, category: undefined, q: undefined })`，不再把种类重置成人工服务。

## 提交号

- 门户后端：`3145092`
- 共享 UI：`5ceebf4a`（前端主体）、`bc83fd4f`、`4491dd92`、`a3a38e64`（交卷）、`c0520f7f`（bay-shell-copy 测试 + 交卷订正）；之后若还有改动，以 `git log -- docs/work-logs/2026-10-23-leobay-projects/verdicts/W02-delivery.md` 的最新一条为准
