# 插件初始态

一个插件被打开、用户还什么都没输入时，右栏第一屏上到底有什么。

今天全平台的按键共用五份通用空白起手件（`../blank-draft-items.ts`），点地图和点换算器
落到的是同一份「输入 A / 输入 B / 比例」。这个目录按插件逐个给出真正的第一屏。

## 谁用它

- `pluginInitialState(pluginId)` —— 查一个插件的初始态，**查不到返回 `null`**。
  调用方不许回退到通用起手件：没有初始态的插件按键不出现，这是 fail-closed 的设计。
- `pluginInitialItemInput(pluginId)` —— 摊成入口层造 `LibraryItem` 要的那几格。
  `key` / `id` / `siteId` / `app_id` / 草稿标记由入口层补。
- `loadPluginGeoFeatures(pluginId)` —— 地图三件第一屏要画的 GeoJSON 要素，
  给 `renderGeoMapToCanvas({ features })` 用。**动态 import**，不渲地图的站不下这 170 KB。

## 目录

| 文件 | 内容 |
|---|---|
| `index.ts` | 清册与查表 |
| `types.ts` | 初始态的形状 |
| `geo-plugins.ts` | 地图、地球仪、户型标注 |
| `grid-plugins.ts` | 台账、文献矩阵、三表模型 |
| `doc-plugins.ts` | 间隔排程、换算器、金融计算器 |
| `data/build-basemap.mjs` | 内置底图生成器 |
| `data/geo/manifest.ts` | 内置底图清单（路径、真实 sha256、真实字节数） |
| `data/geo/*.ts` | 内置底图字节（生成物，不要手改） |

## 内置数据

内置数据是**随包发布的字节，不是素材**：不进货架、不进 `artifact_revisions`、
没有份数、没有预览图。

| 件 | 来源 | 许可 | 字节 |
|---|---|---|---|
| `geo/ne-110m-land.geojson` | Natural Earth 5.1.1 `ne_110m_admin_0_countries` | **PDM** | 172 944 |
| `plan/grid-1m.geojson` | OceanLeo 自制量图纸网格 | CC0 | 7 766 |
| `plan/sheet.geojson` | OceanLeo 自制量图纸边框 | CC0 | 319 |

Natural Earth 是 **PDM**（公有领域标记），不是 CC0 —— 别照抄
`scripts/material-families/interactive-globe/constants.mjs:137` 的写法，那是已知错误。

重新生成（源文件路径见脚本头注释）：

```bash
node src/shell/plugin-initial-states/data/build-basemap.mjs [源 geojson]
```

生成后 `tests/plugin-initial-states.test.mjs` 会重算 sha256 与字节数对账；
摘要对不上就报错，不会让「sha256 全 0、byteSize 写 1」那种假摘要再次落地。
