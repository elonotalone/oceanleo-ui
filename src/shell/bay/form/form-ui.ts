// 填写页共用的版式：一列的宽度、三档字、底部操作条。
// 发布 / 发需求 / 我的 垫白底圆角板，四边露出页底。输入是中灰胶囊，次要键是白描边药丸，主操作是深色药丸。
// 选项块、作品图格、右侧模板条仍是自己的物件，不涂成灰槽。
// 间距三档：标签到自己的控件 8px，项与项 24px，组与组 48px。
// 只用已在 theme/ui.css 产物里的类（tests/bay-shell-static 按 HEAD 的产物查）；要新类先重建产物。

/** 发帖（服务/素材/作品/课程/套餐/需求）、我的、数据面板正文：白底圆角板。返回和标题不进板。板上不出滚动条；正文不够高时板铺满页里剩下的一截，避免页底露出一条空白。 */
export const BAY_FORM_PAPER_CLASS = "relative z-10 flex min-h-0 flex-1 flex-col rounded-3xl bg-white p-6";

/** 填写页的一列。页标题行和表单都用它，左边缘才对得齐。 */
export const BAY_FORM_COLUMN_CLASS = "mx-auto w-full max-w-3xl px-4";

/** 填写页正文：一列，页内各大块之间 24px。上下空白由外层白板的 p-6 出，这里不再垫一层。 */
export const BAY_FORM_PAGE_CLASS = `${BAY_FORM_COLUMN_CLASS} flex flex-col gap-6`;

/** 一组的标题（「产品信息」「价格」这一级）。 */
export const BAY_FORM_SECTION_TITLE_CLASS = "text-[15px] font-semibold text-neutral-900";

/** 一项的标签。 */
export const BAY_FORM_LABEL_CLASS = "text-[13px] font-medium text-neutral-900";

/** 要读的灰字：说明、已填的值。不用 neutral-400。 */
export const BAY_FORM_HELP_CLASS = "text-[13px] leading-5 text-neutral-600";

/** 两个短字段并排。 */
export const BAY_FORM_PAIR_CLASS = "grid gap-4 sm:grid-cols-2";

/** 单行输入：浅灰槽、无描边、两头圆。比 100 深一点，不到实心 200。 */
export const BAY_FORM_INPUT_CLASS =
  "h-11 w-full rounded-full border-0 bg-neutral-200/80 px-4 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50";

/** 金额框：短槽，后面跟币种。不用 w-full，避免把 USD 挤到下一行。 */
export const BAY_FORM_AMOUNT_INPUT_CLASS =
  "h-11 w-28 rounded-full border-0 bg-neutral-200/80 px-4 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50";

/** 多行输入：同一套浅灰槽，大圆角深井。 */
export const BAY_FORM_TEXTAREA_CLASS =
  "min-h-32 w-full resize-y rounded-3xl border-0 bg-neutral-200/80 px-4 py-3 text-[13px] leading-6 text-neutral-900 outline-none placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50";

/** 安静的按键：白底、细深色边、两头圆。 */
export const BAY_FORM_CHIP_BUTTON_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-neutral-900 bg-white px-4 py-2 text-[13px] font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40";

/** 主操作：深色实心药丸。 */
export const BAY_FORM_PRIMARY_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-40";

/** 次要按键，和行尾胶囊同一套。 */
export const BAY_FORM_SECONDARY_BUTTON_CLASS = BAY_FORM_CHIP_BUTTON_CLASS;

/** 危险按键：白底红描边药丸。 */
export const BAY_FORM_DANGER_BUTTON_CLASS =
  "inline-flex items-center justify-center rounded-full border border-rose-300 bg-white px-4 py-2 text-[13px] font-medium text-rose-600 disabled:opacity-40";

/** 底部操作行：普通小按钮，不垫半透明底板、不吸底。左右怎么排由调用方加 justify-*。 */
export const BAY_FORM_BAR_CLASS = "flex flex-wrap items-center gap-2 pt-2";
