# 表格计算层选型（Grid Formula Engine）

> **SUPERSEDED（2026-09-03，操作员裁定）**：本文「候选 A（自研扩展）」的选型已撤销。表格计算层改为 **Univer Sheets**（`@univerjs/presets@0.25.1`，Apache-2.0，原生 React 嵌入）；自研 `grid-formula.ts` / `grid-model.ts` 在 `editor-core-swap` 波 W03 验收绿后删除。理由与证据：`/opt/cursor-workspaces/oceandino/docs/architecture/oceanleo-editors-buy-vs-build-and-template-supply.md` §4.2、`docs/work-logs/2026-09/editor-core-swap/00-dispatch-contract.md`。本文保留作历史。


Status: 操作员 2026-08-31 裁定两条前置约束后，选型定为候选 A（自研扩展）。

## 两条前置约束（操作员裁定，规范性）

1. **UI 用现有统一 UI。** 这一条是硬约束，不是偏好。
2. **本波就要动选型**，不推迟到「先修交互」之后。

约束 1 直接淘汰一整类候选：凡是自带渲染器或工具栏的引擎，采用它就等于换掉统一 UI。

## Product outcome

`excel` 站与全系列的表格插件能打开真实 xlsx 并**正确显示公式结果**，包括跨表引用；
办公高频函数覆盖到位；而 `grid-formula.ts` 已经建立的三条不变量
——**确定性、可审计、fail-closed**——一条都不丢。

## 现状（`[读码]`，出处见 `01-verified-facts.md` §2.8 与 §1.4）

- `GRID_FORMULA_WHITELIST` **22 个**函数，自研 tokenizer + 引用图 + 拓扑排序，
  1,302 行。
- 三张显式拒绝表：`GRID_NONDETERMINISTIC_FUNCTIONS`（`RAND RANDBETWEEN RANDARRAY
  NOW TODAY`）、`GRID_UNREACHABLE_FUNCTIONS`（`INDIRECT OFFSET WEBSERVICE HYPERLINK`）、
  `GRID_MACRO_FUNCTIONS`（XLM 宏 5 个）。
- 9 种结构化拒绝码；`MAX_LENGTH=500`、`MAX_DEPTH=32`、`TIE_OUT_TOLERANCE=0.01`（元）。
- `GridFormulaInspection` **已经解析出** `qualifiedReferences`（`Sheet!A1` 形）
  与 `names`（命名区域候选）。
- **但求值入口丢了 workbook 上下文**：`grid-model.ts:606` 的 `gridDisplayValue`
  在 `:612` 调 `evaluateGridCell(sheet.rows, row, col)`，只给一张表的 rows。
  同形状调用另有 `:563` `:658` `:711`。

**结论先行：这不是「没有引擎」，是「引擎的能力没接到画布上」。**
跨表引用在解析层与导出链都是对的，只在实时 UI 上算不出来。

## Dispatch architecture comparison

| 候选 | 成熟度与互操作 | 保证与环境契合 | 活动部件与已知失效模式 |
| --- | --- | --- | --- |
| **A. 扩自研引擎（选中）** | 骨架已在：白名单、tokenizer、引用图、拓扑排序、9 种拒绝码、深度/长度上限。从 22 扩到约 150 是有界工作，不是从零 | 零新依赖、零许可风险；三条不变量原样保留；与 `GridWorkbookExport.ts` 的 IR 导出链共用同一套判据 | 函数实现要自己写并逐个补测试；数值边界（IEEE754、日期序列号、区域设置）要自己踩 |
| B. HyperFormula 商业授权 | 约 400 函数、Excel/Sheets 语法兼容、可跑 Web Worker、自带 CRUD/undo/剪贴板/命名表达式；**纯无头，零 UI**，形状与约束 1 完全兼容 | 立刻拿到函数覆盖 | **要付费**；它自带一套 cell/sheet 数据模型，要和 `grid-model.ts` 的 `GridSheet` 做双向同步（第二个真相）；**三条不变量会丢**——它不认识白名单、不认识 `TIE_OUT_TOLERANCE`、不产出结构化拒绝码，要在外面再包一层守门人，等于两套判据 |
| C. HyperFormula GPLv3 | 同 B | — | **GPLv3 进分发到 31 个租户站的前端 bundle 有实质法律风险**。`[外部检索 2026-08-31]`，未经法务确认 ⇒ 本波不采用 |
| D. Univer `@univerjs/engine-formula` | Apache-2.0，Canvas 渲染 + Worker 公式引擎，官方称支持千万级单元格 | 许可干净 | 无头部分与 Univer 的 `IWorkbookData` 模型 + DI 容器强耦合，文档基本假设你在用整套 Univer；**整套 Univer 自带 UI，违反约束 1**。只取引擎的路径缺少文档支撑 ⇒ 集成成本不可估 |
| E. formulajs（MIT）只借函数体 | 纯函数库，约 500 个 Excel 函数实现 | 许可宽松；我们保留自己的 tokenizer / 引用图 / 白名单 / 拒绝码，只 vendor 纯计算的函数体 | 它**没有**引用图、没有环检测、没有依赖排序——这些本来就是我们自己的；风险在数值口径与我们既有 22 个的实现不一致 |

## Decision

**选 A，并允许把 E 作为加速器**：纯数学/文本/日期类函数的实现体，
在**逐个核对数值口径**并**通过我们自己的测试**的前提下，可以参考或 vendor
MIT 来源的实现，但**必须**接在我们自己的 tokenizer / 引用图 / 白名单 / 拒绝码之下。

> ⚠️ formulajs 的许可与 API 形状是 `[待核]`，父 agent 未验证。
> W14 若要走 E 这条加速器，**第一个 P 就是自证许可与形状**；
> 证不了就纯自研，不许因为「据说是 MIT」就 vendor 进来。

否决 B 的理由不是钱，是**它解决不了真正的瓶颈**：

- 跨表引用在 UI 上算不出（§现状）——那是我们求值入口的签名问题，换引擎也要改；
- 粘贴保真、填充柄、列宽、查找替换——**全是 UI 层**，无头引擎一个都不给；
- 三条不变量是产品要求（台账 / 文献矩阵 / 三表模型的可审计口径），
  引通用引擎会把它们弄丢，然后我们要在外面再造一遍。

## 规范一 · 求值入口带上 workbook 上下文

这是本文优先级最高的一条，**它是 bug 修复，不是新功能**。

```ts
// grid-formula.ts —— 新增，旧签名保留为薄封装以免一次改爆调用点
export interface GridWorkbookContext {
  /** sheet id / name → rows。名字解析大小写不敏感，与 OOXML 一致 */
  sheetRows(ref: string): GridRow[] | undefined;
  /** 命名区域 → A1 或 Sheet!A1:B9 */
  namedRange(name: string): string | undefined;
  /** 本次求值的冻结时刻与随机种子，见 §规范三 */
  recalc: GridRecalcStamp;
}

export function evaluateGridCellInWorkbook(
  ctx: GridWorkbookContext,
  sheetRef: string,
  row: number,
  col: number,
): GridFormulaValue;
```

`grid-model.ts` 的五处调用点（`:563` `:606/612` `:658` `:711`）全部改走新入口。
旧的 `evaluateGridCell(rows, row, col)` 保留，内部构造一个只含当前表的
单表 context ——**但要标记 `@deprecated` 并加一条机检禁止新增调用点**，
否则下一个人会照旧写法再引入一次同样的缺陷。

## 规范二 · 目标函数集（约 150）

**分三批**。每批的验收是「每个函数至少两条用例：一条正常值、一条边界或错误值」，
且错误值必须落在既有 9 种拒绝码或 Excel 错误值（`#DIV/0!` `#N/A` `#VALUE!`
`#REF!` `#NAME?` `#NUM!` `#NULL!`）里，**不许返回 `undefined` 或 `NaN`**
（这条沿用上一波定下的「要么算出有限数、要么如实空着，不许出 NaN」）。

**已有的 22 个用 `✓` 标注，不重复实现。**

### 批一（办公命中率最高，约 60）

- **逻辑**：`IF ✓` `IFS` `IFERROR ✓` `IFNA` `SWITCH` `AND ✓` `OR ✓` `NOT ✓` `XOR` `TRUE` `FALSE`
- **数学**：`SUM ✓` `SUMIF ✓` `SUMIFS` `SUMPRODUCT` `PRODUCT` `ABS ✓` `ROUND ✓`
  `ROUNDUP ✓` `ROUNDDOWN ✓` `MROUND` `CEILING` `FLOOR` `INT` `TRUNC` `MOD`
  `POWER` `SQRT` `SIGN`
- **统计**：`COUNT ✓` `COUNTA ✓` `COUNTBLANK` `COUNTIF ✓` `COUNTIFS` `AVERAGE ✓`
  `AVERAGEIF` `AVERAGEIFS` `MEDIAN` `MIN ✓` `MAX ✓` `MINIFS` `MAXIFS`
  `LARGE` `SMALL` `RANK`
- **文本**：`CONCAT` `TEXTJOIN` `LEFT` `RIGHT` `MID` `LEN` `FIND` `SEARCH`
  `SUBSTITUTE` `REPLACE` `TRIM` `UPPER` `LOWER` `TEXT` `VALUE` `EXACT`
- **查找**：`VLOOKUP ✓` `HLOOKUP` `INDEX ✓` `MATCH ✓` `CHOOSE` `ROW` `COLUMN`
  `ROWS` `COLUMNS`

### 批二（日期与财务，约 45）

- **日期**：`DATE` `YEAR` `MONTH` `DAY` `HOUR` `MINUTE` `SECOND` `WEEKDAY`
  `WEEKNUM` `EDATE` `EOMONTH` `DATEDIF` `DAYS` `NETWORKDAYS` `WORKDAY`
  `DATEVALUE` `TIME` `TODAY*` `NOW*`（带 `*` 的见 §规范三）
- **财务**：`PMT` `IPMT` `PPMT` `PV` `FV` `NPV ✓` `IRR ✓` `XIRR` `XNPV`
  `RATE` `NPER` `SLN` `DB` `DDB` `SYD`
- **信息**：`ISBLANK` `ISNUMBER` `ISTEXT` `ISERROR` `ISERR` `ISNA` `ISLOGICAL`
  `ISEVEN` `ISODD` `N` `NA` `TYPE`

**日期序列号口径必须写死并测**：以 1899-12-30 为 0 的 Excel 序列号，
含 1900 闰年 bug 的兼容位——这一条不测会在导出到 Excel 时静默差一天。

### 批三（现代与统计尾巴，约 45）

- **动态数组**：`UNIQUE` `SORT` `SORTBY` `FILTER` `SEQUENCE` `TRANSPOSE`
  ——需要溢出（spill）语义，见下 §规范四
- **现代查找**：`XLOOKUP` `XMATCH` `LOOKUP`
- **文本尾巴**：`TEXTSPLIT` `TEXTBEFORE` `TEXTAFTER` `REPT` `CHAR` `CODE`
  `PROPER` `NUMBERVALUE` `CLEAN`
- **统计尾巴**：`STDEV.S` `STDEV.P` `VAR.S` `VAR.P` `PERCENTILE.INC`
  `QUARTILE.INC` `CORREL` `SLOPE` `INTERCEPT` `FORECAST.LINEAR` `TREND`
  `COUNTUNIQUE`

## 规范三 · volatile 函数：允许，但把求值时刻写进文档

现状把 `TODAY` / `NOW` / `RAND*` 一律拒绝，理由是确定性。
**这个理由是对的，但结论过强**——它把办公里最常见的一批公式挡在门外。

正确解法是：**允许 volatile 函数，让文档自己携带求值时刻与随机种子**，
于是「同一份文档字节 ⇒ 同一组计算结果」这条不变量原样成立。

```ts
/** 写进 oceanleo.grid.v1 项目档 */
export interface GridRecalcStamp {
  /** ISO8601，UTC。TODAY()/NOW() 一律读这个，禁止读 Date.now() */
  at: string;
  /** uint32。RAND 系列用它 + 单元格地址派生，禁止读 Math.random() */
  seed: number;
}
```

规则：

1. `TODAY()` / `NOW()` 从 `recalc.at` 取值，**不许**碰 `Date.now()`；
2. `RAND()` / `RANDBETWEEN()` / `RANDARRAY()` 用
   `hash(recalc.seed, sheetId, row, col, callIndex)` 派生的确定性 PRNG，
   **不许**碰 `Math.random()`；
3. 打开文档**不**自动更新 `recalc`；只有用户显式「重新计算」才更新，
   并且那是一次**新的 revision**（与既有 CAS 保存链一致）；
4. 导出 xlsx 时，缓存值写 `<v>`、公式写 `<f>`，与 Excel 行为一致；
5. `GRID_NONDETERMINISTIC_FUNCTIONS` 这张表**改名并改语义**为
   `GRID_VOLATILE_FUNCTIONS`，从「拒绝」变成「标记 + 要求 recalc stamp 在场」；
   文档缺 `recalc` 时 fail-closed 拒绝，**不许**静默回落到系统时间。

`GRID_UNREACHABLE_FUNCTIONS`（`INDIRECT` `OFFSET` `WEBSERVICE` `HYPERLINK`）
与 `GRID_MACRO_FUNCTIONS` **保持拒绝**——它们被拒的理由是引用图在 emit 前
链不出来 / 那是代码执行，与确定性无关，那条理由今天依然成立。

## 规范四 · 溢出（spill）语义

批三的动态数组需要它。最小实现：

- 公式可以返回 `GridSpillRange`（二维值 + 锚点）；
- 溢出区内的单元格标记 `spilledFrom: {row, col}`，**只读**；
- 目标区非空 ⇒ 返回 `#SPILL!`，不覆盖用户数据；
- 引用图把整个溢出区当作锚点单元格的产物参与拓扑排序，避免假环。

不做溢出就不要收批三的动态数组函数——半个实现比没有更坏。

## 规范五 · 性能与放置

- 现有上限 `[子报，W13 自证]`：`GRID_MAX_ROWS=10_000`、`GRID_MAX_COLS=256`，
  规格建议 5,000 数据行。**本波不提这两个上限**——先把 UI 的虚拟化做好
  （归 W13），再谈更大的表。
- 求值先做**脏依赖增量重算**（只重算受影响的拓扑子图），不做全表重算。
  这一条比塞进 Worker 更值钱，且不改架构。
- **暂不进 Web Worker。** 理由：跨线程要序列化整个 workbook，
  在当前 5,000 行量级上得不偿失；等虚拟化落地、有实测的重算耗时读数之后再评估。
  这条决定要在 W14 的交付说明里带一个实测重算耗时，供下一波复算。

## Falsifying assumption

这条链在下面任一情况下不成立：

1. 批一落地后，真实用户 xlsx 的公式**拒绝率仍 > 5%** ——
   说明办公函数分布与本文的三批切分不符，应重排优先级而不是继续扩表；
2. `recalc` 冻结时刻的方案让用户困惑到需要「打开就自动重算」——
   则确定性不变量与产品要求真的冲突，需要操作员重新裁定；
3. 增量重算在 5,000 行 / 2,000 公式上单次 > 200ms ——
   则 §规范五「暂不进 Worker」的结论作废。

## Proof and acceptance

开工前的一次性证明（throwaway）：

取 **10 份真实 xlsx**（覆盖台账、三表模型、课程表、报价单、考勤），
用现有引擎跑一遍统计：总公式数、被拒公式数、按拒绝码分布、按函数名分布。
**这份分布决定批一批二的最终名单**——本文的三批切分是先验的，
必须用真实分布校正一次，校正结果写进 `verdicts/`。

生产验收（永久机检）：

- `tests/grid-formula-cross-sheet.test.mjs`：`Sheet2!B3` 在**编辑器画布**上
  算得出（不是只在导出链上）。反面用例：把 workbook context 换成单表 context，
  这条必须当场红。
- `tests/grid-formula-determinism.test.mjs`：同一份含 `TODAY()` `RAND()` 的文档，
  两次独立加载求值，逐格相等；改 `recalc.seed` 后 `RAND()` 结果改变而
  `TODAY()` 不变；缺 `recalc` 时 fail-closed 抛既有拒绝码。
- `tests/grid-formula-coverage.test.mjs`：白名单里每个函数至少两条用例
  （正常 + 边界/错误），**没有任何函数返回 `undefined` 或 `NaN`**。
- `tests/grid-formula-legacy-entry.test.mjs`：`evaluateGridCell` 旧签名的调用点
  数量只减不增（`PENDING_LEGACY_EVAL` 预算锁）。
- `tests/grid-formula-date-serial.test.mjs`：日期序列号与 Excel 逐值对齐，
  含 1900 闰年兼容位。
- 既有 `tests/grid-carrier-contract.test.mjs`（1,100 行）**判据一条不许放宽**。
