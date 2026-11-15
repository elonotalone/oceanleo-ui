"use client";
import { useMemo, useRef } from "react";
import { useEditorState } from "@tiptap/react";
import { useUI } from "../../i18n/ui/useUI";
import { ADVANCED_EDITOR_FONTS } from "../AdvancedFontPicker";
import { viewOnlyContext } from "../collab/adapters/visual-readonly";
import { richDocFontSizePx, richDocLineHeightPx, richDocLineHeightFromPx } from "./rich-doc-selection-units";
import type { SelectionAdapter, SelectionCommand, SelectionAdapterContext, SelectionControlInput, SelectionControlIcon, } from "../selection-context";
import { richDocLetterSpacing, RICHDOC_IMAGE_WRAPS, RICHDOC_NUMBERING_PRESETS, applyRichDocParagraphAttrs, } from "./rich-doc-model";
import { RICHDOC_IMAGE_BORDER_MAX, RICHDOC_IMAGE_RADIUS_MAX, normalizeRichDocImageStyle, } from "./rich-doc-image-style";
import { normalizeRichDocImageTransform, patchRichDocImageTransform, richDocImageFrameAttrs } from "./rich-doc-image-transform";
import type { RichDocEditorState } from "./use-rich-doc-editor";
/** 「增加/减少缩进」一档走 24 磅（≈2 个中文字符），和 Word 的默认档一致。 */
const INDENT_STEP_PT = 24;
/** 下拉里「不设」那一项的值：选项值不许是空串（`normalizeSelectionContext`）。 */
const DEFAULT_VALUE = "default";
/** 数字控件回来的值可能是字符串；0 与空一律当「没设」，落成 `null` 才会清掉属性。 */
function numberOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function selectValue(value: unknown): string {
    const text = String(value ?? "");
    return text === DEFAULT_VALUE ? "" : text;
}
/** 字体栈的第一个名字（没登记过的字体，下拉里就显示它）。 */
function firstFamily(family: string): string {
    return family.split(",")[0]?.replace(/["']/g, "").trim() || family;
}
/** 面板分组：编辑器特有的几组共用同一形状（槽位、标签、可选图标）。 */
function inspector(inspectorGroup: string, inspectorLabel: string, inspectorIcon?: SelectionControlIcon) {
    return {
        slot: "inspector" as const,
        placement: "more" as const,
        inspectorGroup,
        inspectorLabel,
        ...(inspectorIcon ? { inspectorIcon } : {}),
    };
}
/** 选中一张图片时的节点（NodeSelection）；不是图片返回 null。 */
function selectedNodeOf(editor: NonNullable<RichDocEditorState["editor"]>) {
    return (editor.state.selection as typeof editor.state.selection & {
        node?: {
            type?: {
                name?: string;
            };
            attrs?: Record<string, unknown>;
            toJSON?: () => unknown;
            nodeSize?: number;
        };
    }).node;
}
function pickImageFile(onFile: (file: File) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
        const file = input.files?.[0];
        if (file)
            onFile(file);
    };
    input.click();
}
export function useRichDocSelectionAdapter({ editor: state, onCrop, }: {
    editor: RichDocEditorState;
    onCrop?: () => void;
}): SelectionAdapter {
    const tt = useUI();
    const editor = state.editor;
    // 协同里只读（viewer、专业模式锁在别人手里、还没同步完）：批注与修订的几项灰掉。
    const reviewReadOnly = Boolean(state.collabReadOnly || state.review?.readOnly);
    useEditorState({
        editor,
        selector: ({ transactionNumber }) => transactionNumber,
    });
    const context = useMemo<SelectionAdapterContext | null>(() => {
        if (!editor)
            return null;
        const { from, to } = editor.state.selection;
        const selectedNode = selectedNodeOf(editor);
        const inTable = editor.isActive("table");
        const objectGroup: SelectionControlInput[] = [
            { id: "duplicate" },
            { id: "delete", danger: true },
        ];
        if (selectedNode) {
            const image = selectedNode.type?.name === "image";
            const attrs = selectedNode.attrs || {};
            const transform = normalizeRichDocImageTransform(attrs);
            const borderPanel = inspector("border", tt("边框样式"));
            return {
                version: 1,
                kind: image ? "embedded-object" : "block",
                bar: image ? "image" : "object",
                id: `text:${from}-${to}`,
                label: image ? tt("嵌入图片（单选）") : tt("文档块（单选）"),
                text: "",
                revision: state.editRevision,
                controls: [
                    ...(image
                        ? ([
                            { id: "replace" },
                            ...(onCrop ? [{ id: "crop" as const }] : []),
                            { id: "flip-x", value: transform.flipX },
                            { id: "flip-y", value: transform.flipY },
                            { id: "rotate", value: transform.rotation },
                            ...(["brightness", "contrast", "saturation"] as const).map((key, index) => ({
                                id: `richdoc.${key}`, kind: "number" as const,
                                label: tt(["亮度", "对比度", "饱和度"][index]), suffix: "%", min: 0, max: 200, step: 1,
                                value: transform[key], ...inspector("adjust", tt("调色")), domain: "specific" as const,
                            })),
                            { id: "image-fit", value: transform.imageFit, options: [
                                { value: "contain", label: tt("完整") }, { value: "cover", label: tt("铺满裁切") }, { value: "fill", label: tt("拉伸铺满") },
                            ] },
                            {
                                id: "radius",
                                min: 0,
                                max: RICHDOC_IMAGE_RADIUS_MAX,
                                step: 2,
                                value: Number(attrs.radius ?? 8)
                            },
                            {
                                id: "border-width",
                                kind: "number",
                                label: tt("边框粗细"),
                                suffix: "px",
                                min: 0,
                                max: RICHDOC_IMAGE_BORDER_MAX,
                                step: 1,
                                value: Number(attrs.borderWidth) || 0,
                                ...borderPanel,
                                domain: "specific" as const
                            },
                            {
                                id: "border-color",
                                kind: "color",
                                label: tt("边框颜色"),
                                value: String(attrs.borderColor || "#a8a29e"),
                                ...borderPanel,
                                domain: "specific" as const
                            },
                            {
                                id: "opacity",
                                min: 10,
                                max: 100,
                                step: 5,
                                value: attrs.opacity === null || attrs.opacity === undefined ? 100 : Number(attrs.opacity)
                            },
                            {
                                // 只有「嵌入行内」与「上下型」两种，不做四周环绕：
                                // 理由写在 rich-doc-model.ts 的 RichDocImageWrap 注释里。
                                id: "image-wrap",
                                kind: "select",
                                label: tt("环绕方式"),
                                placement: "more",
                                value: String(attrs.wrap || "top-bottom"),
                                options: RICHDOC_IMAGE_WRAPS.map((wrap) => ({
                                    value: wrap.value,
                                    label: tt(wrap.label),
                                })),
                                domain: "specific" as const
                            },
                        ] satisfies SelectionControlInput[])
                        : []),
                    ...objectGroup,
                ],
            };
        }
        const format = [1, 2, 3, 4].find((level) => editor.isActive("heading", { level }));
        const textStyle = editor.getAttributes("textStyle");
        const highlight = editor.getAttributes("highlight");
        const link = editor.getAttributes("link");
        const align = ["center", "right", "justify"].find((value) => editor.isActive({ textAlign: value })) || "left";
        // 排版属性同时挂在 paragraph 与 heading 上，读的时候要认光标实际落在哪种节点，
        // 否则在标题里调行距会一直显示「默认」。
        const blockAttrs = editor.isActive("heading")
            ? editor.getAttributes("heading")
            : editor.getAttributes("paragraph");
        const inOrderedList = editor.isActive("orderedList");
        const cellAttrs = inTable
            ? { ...editor.getAttributes("tableCell"), ...editor.getAttributes("tableHeader") }
            : {};
        const family = String(textStyle.fontFamily || "");
        const knownFamily = ADVANCED_EDITOR_FONTS.some((font) => font.family === family);
        const fontSize = richDocFontSizePx(textStyle.fontSize, format);
        const typographyGroup = inspector("richdoc-typography", tt("段落设置"));
        const reviewGroup = inspector("richdoc-review", tt("批注与修订"), "note");
        const tableGroup = inspector("richdoc-table", tt("表格结构"), "table");
        const cellGroup = inspector("richdoc-cell", tt("单元格"));
        const linkGroup = inspector("link", tt("超链接"));
        return {
            version: 1,
            kind: inTable ? "table-cell" : from === to ? "text-caret" : "text-range",
            bar: "text",
            id: `text:${from}-${to}`,
            label: inTable ? tt("表格单元格") : from === to ? tt("当前段落") : tt("选中文字"),
            text: from === to ? "" : editor.state.doc.textBetween(from, to, " "),
            revision: state.editRevision,
            controls: [
                // --- 统一文字组（00-dispatch.md §4，顺序、图标、标签由外壳投影）--------
                {
                    id: "font-family",
                    value: family || DEFAULT_VALUE,
                    options: [
                        { value: DEFAULT_VALUE, label: tt("默认字体") },
                        ...(family && !knownFamily ? [{ value: family, label: firstFamily(family) }] : []),
                        ...ADVANCED_EDITOR_FONTS.map((font) => ({ value: font.family, label: tt(font.label) })),
                    ]
                },
                {
                    id: "font-size",
                    value: fontSize,
                    min: 1,
                    max: 1000,
                    step: 1
                },
                { id: "bold", value: editor.isActive("bold") },
                { id: "italic", value: editor.isActive("italic") },
                { id: "underline", value: editor.isActive("underline") },
                { id: "strike", value: editor.isActive("strike") },
                { id: "text-color", value: String(textStyle.color || "#1c1917") },
                { id: "highlight", value: String(highlight.color || "#fef08a") },
                {
                    id: "align",
                    value: align,
                    options: [
                        { value: "left", label: tt("左对齐") },
                        { value: "center", label: tt("居中") },
                        { value: "right", label: tt("右对齐") },
                        { value: "justify", label: tt("两端对齐") },
                    ]
                },
                {
                    id: "list",
                    value: editor.isActive("bulletList") ? "bullet" : inOrderedList ? "ordered" : "none",
                    options: [
                        { value: "none", label: tt("无列表") },
                        { value: "bullet", label: tt("项目符号列表") },
                        { value: "ordered", label: tt("编号列表") },
                    ]
                },
                {
                    id: "line-height",
                    value: richDocLineHeightPx(blockAttrs.lineHeight, fontSize, format),
                    min: 1,
                    max: 1333,
                    step: 1
                },
                { id: "letter-spacing", value: richDocLetterSpacing(textStyle.letterSpacing) ?? 0, min: -20, max: 100, step: 1 },
                ...(from < to ? [{ id: "case" as const, capabilities: { action: true } }] : []),
                // 竖排需段落/页面布局及 DOCX 支持；当前不申报 vertical-text。
                // 超链接是面板型规范项（A-1）：地址输入框与「移除链接」都在同一个面板里。
                { id: "link", value: String(link.href || ""), ...linkGroup },
                ...(editor.isActive("link")
                    ? [{ id: "unlink", kind: "action" as const, label: tt("移除链接"), ...linkGroup, domain: "specific" as const }]
                    : []),
                { id: "indent-increase" },
                ...(Number(blockAttrs.indentLeft) > 0
                    ? [{ id: "indent-decrease" as const }]
                    : []),
                { id: "clear-format" },
                // --- 文档特有控件：排在规范组之后，不借用规范图标 -------------------------
                {
                    id: "format",
                    kind: "select",
                    label: tt("段落样式"),
                    iconOnly: false,
                    value: format ? `h${format}` : "p",
                    options: [
                        { value: "p", label: tt("正文") },
                        { value: "h1", label: tt("标题 1") },
                        { value: "h2", label: tt("标题 2") },
                        { value: "h3", label: tt("标题 3") },
                        ...(format === 4 ? [{ value: "h4", label: tt("标题 4") }] : []),
                    ],
                    domain: "specific" as const
                },
                ...(editor.isActive("highlight")
                    ? [{ id: "highlight-remove", kind: "action" as const, label: tt("去掉高亮"), placement: "more" as const, domain: "specific" as const }]
                    : []),
                { id: "blockquote", kind: "toggle", label: tt("引用"), value: editor.isActive("blockquote"), placement: "more", domain: "specific" as const },
                { id: "code-block", kind: "toggle", label: tt("代码块"), value: editor.isActive("codeBlock"), placement: "more", domain: "specific" as const },
                // 行距 / 缩进 / 段间距：全部走 applyRichDocParagraphAttrs()，一次打到 paragraph 与 heading。
                { id: "first-line-chars", kind: "number", label: tt("首行缩进"), suffix: tt("字符"), min: 0, max: 20, step: 0.5, value: Number(blockAttrs.firstLineChars) || 0, ...typographyGroup, domain: "specific" as const },
                { id: "hanging-chars", kind: "number", label: tt("悬挂缩进"), suffix: tt("字符"), min: 0, max: 20, step: 0.5, value: Number(blockAttrs.hangingChars) || 0, ...typographyGroup, domain: "specific" as const },
                { id: "indent-right", kind: "number", label: tt("右缩进"), suffix: tt("磅"), min: 0, max: 720, step: 6, value: Number(blockAttrs.indentRight) || 0, ...typographyGroup, domain: "specific" as const },
                { id: "space-before", kind: "number", label: tt("段前"), suffix: tt("磅"), min: 0, max: 720, step: 3, value: Number(blockAttrs.spaceBefore) || 0, ...typographyGroup, domain: "specific" as const },
                { id: "space-after", kind: "number", label: tt("段后"), suffix: tt("磅"), min: 0, max: 720, step: 3, value: Number(blockAttrs.spaceAfter) || 0, ...typographyGroup, domain: "specific" as const },
                // --- 多级编号（P3）---------------------------------------------------
                ...(inOrderedList
                    ? [
                        {
                            id: "numbering",
                            kind: "select" as const,
                            label: tt("编号格式"),
                            value: String(editor.getAttributes("orderedList").numbering || "decimal"),
                            options: RICHDOC_NUMBERING_PRESETS.map((preset) => ({
                                value: preset.value,
                                label: tt(preset.label),
                            })),
                            ...inspector("richdoc-numbering", tt("多级编号")),
                            domain: "specific" as const
                        },
                    ]
                    : []),
                // --- 批注与修订：没有选区时批注锚不上，灰掉（外壳不显示灰按钮）；只读的人能看不能加。
                {
                    // `kind: "text"`：属性面板渲染成一格输入框，回车即提交；空正文不建批注。
                    id: "richdoc.add-comment",
                    kind: "text",
                    label: tt("插入批注"),
                    disabled: reviewReadOnly || !(state.review?.hasSelection ?? false),
                    ...reviewGroup,
                    domain: "specific" as const
                },
                { id: "richdoc.toggle-track-changes", kind: "toggle", value: state.review?.trackChangesEnabled ?? false, disabled: reviewReadOnly, label: tt("修订模式"), ...reviewGroup, domain: "specific" as const },
                { id: "richdoc.delete-tracked", kind: "action", label: tt("删除（留痕）"), disabled: reviewReadOnly || !(state.review?.hasSelection ?? false), ...reviewGroup, domain: "specific" as const },
                { id: "richdoc.accept-all-changes", kind: "action", label: tt("全部接受修订"), disabled: reviewReadOnly, ...reviewGroup, domain: "specific" as const },
                { id: "richdoc.reject-all-changes", kind: "action", label: tt("全部拒绝修订"), disabled: reviewReadOnly, ...reviewGroup, domain: "specific" as const },
                ...(inTable
                    ? ([
                        { id: "row-add", kind: "action", label: tt("增加行"), ...tableGroup, domain: "specific" as const },
                        { id: "row-delete", kind: "action", label: tt("删除行"), ...tableGroup, domain: "specific" as const },
                        { id: "column-add", kind: "action", label: tt("增加列"), ...tableGroup, domain: "specific" as const },
                        { id: "column-delete", kind: "action", label: tt("删除列"), ...tableGroup, domain: "specific" as const },
                        { id: "cell-merge", kind: "action", label: tt("合并单元格"), ...tableGroup, domain: "specific" as const },
                        { id: "cell-split", kind: "action", label: tt("拆分单元格"), ...tableGroup, domain: "specific" as const },
                        // Word 的「标题行重复」= 首行是表头行；我们只要把 tableHeader 带进 docx（w:tblHeader）。
                        { id: "header-row", kind: "toggle", label: tt("表头行重复"), value: editor.isActive("tableHeader"), ...tableGroup, domain: "specific" as const },
                        { id: "table-delete", kind: "action", label: tt("删除表格"), danger: true, ...tableGroup, domain: "specific" as const },
                        { id: "cell-background", kind: "color", label: tt("单元格底色"), value: String(cellAttrs.backgroundColor || "#ffffff"), ...cellGroup, domain: "specific" as const },
                        {
                            id: "cell-valign",
                            kind: "select",
                            label: tt("垂直对齐"),
                            value: String(cellAttrs.verticalAlign || "top"),
                            options: [
                                { value: "top", label: tt("顶端") },
                                { value: "center", label: tt("居中") },
                                { value: "bottom", label: tt("底端") },
                            ],
                            ...cellGroup,
                            domain: "specific" as const
                        },
                        {
                            // 设列宽的入口；打开 TableKit.resizable 之后拖拽写的也是同一个 colwidth。
                            id: "cell-width",
                            kind: "number",
                            label: tt("列宽"),
                            suffix: "px",
                            min: 0,
                            max: 1200,
                            step: 10,
                            value: Array.isArray(cellAttrs.colwidth) ? Number(cellAttrs.colwidth[0]) || 0 : 0,
                            ...cellGroup,
                            domain: "specific" as const
                        },
                    ] satisfies SelectionControlInput[])
                    : []),
            ] satisfies SelectionControlInput[],
        };
        // `trackChangesEnabled` 是审阅 hook 里的 React state，它变的那一次
        // `editor.state` 可能没动；不列进依赖，开关会一直显示上一次的值。
    }, [
        editor,
        editor?.state,
        state.editRevision,
        state.review?.hasSelection,
        state.review?.trackChangesEnabled,
        reviewReadOnly,
        onCrop,
        tt,
    ]);
    const latest = useRef({ state, context, onCrop });
    latest.current = { state, context, onCrop };
    const command = (message: SelectionCommand) => {
        const { state, context, onCrop } = latest.current;
        const editor = state.editor;
        const reviewReadOnly = Boolean(state.collabReadOnly || state.review?.readOnly);
        if (!editor || !context || state.collabReadOnly || state.sourceReady === false || state.loading || state.sourceFailed)
            return;
        const liveSelection = editor.state.selection;
        if (message.selectionId !== context.id || message.selectionId !== `text:${liveSelection.from}-${liveSelection.to}`)
            return;
        if (message.selectionRevision !== undefined &&
            message.selectionRevision !== state.editRevision) {
            return;
        }
        if (message.transactionId && message.phase !== "commit")
            return;
        const chain = editor.chain().focus();
        const value = message.value;
        switch (message.controlId) {
            case "delete":
            case "delete-selection":
                chain.deleteSelection().run();
                break;
            case "duplicate": {
                const node = selectedNodeOf(editor);
                const json = node?.toJSON?.();
                if (json)
                    chain.insertContentAt(editor.state.selection.to, json).run();
                break;
            }
            case "replace":
                pickImageFile((file) => void state.replaceSelectedImage(file));
                break;
            case "crop":
                onCrop?.();
                break;
            case "flip-x":
            case "flip-y":
            case "rotate":
            case "image-fit":
            case "richdoc.cropTop":
            case "richdoc.cropRight":
            case "richdoc.cropBottom":
            case "richdoc.cropLeft":
            case "richdoc.brightness":
            case "richdoc.contrast":
            case "richdoc.saturation": {
                if (selectedNodeOf(editor)?.type?.name !== "image") break;
                const current = normalizeRichDocImageTransform(editor.getAttributes("image"));
                const key = message.controlId.startsWith("richdoc.") ? message.controlId.slice(8)
                    : ({ "flip-x": "flipX", "flip-y": "flipY", rotate: "rotation", "image-fit": "imageFit" } as Record<string, string>)[message.controlId];
                const nextValue = key === "flipX" ? !current.flipX : key === "flipY" ? !current.flipY
                    : key === "rotation" ? current.rotation + 90 : value;
                patchRichDocImageTransform(editor, { ...current, [key]: nextValue });
                break;
            }
            case "radius":
            case "border-width":
            case "border-color":
            case "opacity": {
                const key = {
                    radius: "radius",
                    "border-width": "borderWidth",
                    "border-color": "borderColor",
                    opacity: "opacity",
                }[message.controlId] as "radius" | "borderWidth" | "borderColor" | "opacity";
                const next = normalizeRichDocImageStyle({ [key]: value });
                // 第一次加边框时没有颜色：给一个中性灰，不然 0 宽之外看不出来。
                if (key === "borderWidth" && next.borderWidth && !editor.getAttributes("image").borderColor) {
                    next.borderColor = "#a8a29e";
                }
                chain.updateAttributes("image", { ...richDocImageFrameAttrs(editor), ...next }).run();
                break;
            }
            case "format": {
                const level = String(value || "p");
                if (level === "p")
                    chain.setParagraph().run();
                else
                    chain.setHeading({ level: Number(level.slice(1)) as 1 | 2 | 3 | 4 }).run();
                break;
            }
            case "font-family": {
                const family = selectValue(value);
                if (family)
                    chain.setFontFamily(family).run();
                else
                    chain.unsetFontFamily().run();
                break;
            }
            case "font-size": {
                if (typeof value === "number" && !Number.isFinite(value))
                    return;
                const size = typeof value === "number" ? `${Math.max(1, Math.min(1000, value))}px` : selectValue(value);
                if (size)
                    chain.setFontSize(size).run();
                else
                    chain.unsetFontSize().run();
                break;
            }
            case "letter-spacing": {
                const px = richDocLetterSpacing(value);
                if (px !== null) chain.setMark("textStyle", { letterSpacing: px }).run();
                break;
            }
            case "case": {
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(from, to, " ");
                const mode = value === "upper" || value === "lower" ? value
                    : selectedText === selectedText.toUpperCase() ? "lower" : "upper";
                const spans: Array<{ from: number; to: number; text: string; marks: typeof editor.state.doc.marks }> = [];
                editor.state.doc.nodesBetween(from, to, (node, pos) => {
                    if (!node.isText) return true;
                    const start = Math.max(from, pos), end = Math.min(to, pos + node.nodeSize);
                    const text = (node.text || "").slice(start - pos, end - pos);
                    const next = mode === "upper" ? text.toUpperCase() : text.toLowerCase();
                    if (next !== text) spans.push({ from: start, to: end, text: next, marks: node.marks });
                });
                if (spans.length) {
                    const tr = editor.state.tr;
                    for (const span of spans.reverse()) tr.replaceWith(span.from, span.to, editor.schema.text(span.text, span.marks));
                    editor.view.dispatch(tr);
                }
                break;
            }
            case "bold":
                chain.toggleBold().run();
                break;
            case "italic":
                chain.toggleItalic().run();
                break;
            case "underline":
                chain.toggleUnderline().run();
                break;
            case "strike":
                chain.toggleStrike().run();
                break;
            case "text-color":
                if (String(value || ""))
                    chain.setColor(String(value)).run();
                else
                    chain.unsetColor().run();
                break;
            case "highlight":
                chain.setHighlight({ color: String(value || "#fef08a") }).run();
                break;
            case "highlight-remove":
                chain.unsetHighlight().run();
                break;
            case "align":
                chain.setTextAlign(String(value || "left")).run();
                break;
            case "list": {
                const next = String(value || "none");
                const bullet = editor.isActive("bulletList");
                const ordered = editor.isActive("orderedList");
                if (next === "bullet" && !bullet)
                    chain.toggleBulletList().run();
                else if (next === "ordered" && !ordered)
                    chain.toggleOrderedList().run();
                else if (next === "none" && (bullet || ordered))
                    chain.liftListItem("listItem").run();
                break;
            }
            case "blockquote":
                chain.toggleBlockquote().run();
                break;
            case "code-block":
                chain.toggleCodeBlock().run();
                break;
            case "clear-format":
                state.clearFormat();
                break;
            case "link":
                if (String(value || "").trim())
                    state.setLinkHref(String(value).trim());
                else
                    state.unsetLink();
                break;
            case "unlink":
                state.unsetLink();
                break;
            case "row-add":
                chain.addRowAfter().run();
                break;
            case "row-delete":
                chain.deleteRow().run();
                break;
            case "column-add":
                chain.addColumnAfter().run();
                break;
            case "column-delete":
                chain.deleteColumn().run();
                break;
            case "table-delete":
                chain.deleteTable().run();
                break;
            case "line-height":
                // 选倍数就把固定值一起清掉，否则两种模式同时挂着，导出以固定值为准。
                applyRichDocParagraphAttrs(chain, { lineHeight: typeof value === "number" ? richDocLineHeightFromPx(value) : selectValue(value) || null });
                break;
            case "line-height-exact": {
                const pt = numberOrNull(value);
                applyRichDocParagraphAttrs(chain, { lineHeight: pt === null ? null : `${pt}pt` });
                break;
            }
            case "first-line-chars":
                // 首行缩进与悬挂缩进在 OOXML 里互斥：同步清掉另一边，导出时不静默丢一个。
                applyRichDocParagraphAttrs(chain, { firstLineChars: numberOrNull(value), hangingChars: null });
                break;
            case "hanging-chars":
                applyRichDocParagraphAttrs(chain, { hangingChars: numberOrNull(value), firstLineChars: null });
                break;
            case "indent-increase":
            case "indent-decrease": {
                const current = Number((editor.isActive("heading")
                    ? editor.getAttributes("heading")
                    : editor.getAttributes("paragraph")).indentLeft) || 0;
                const next = message.controlId === "indent-increase"
                    ? Math.min(720, current + INDENT_STEP_PT)
                    : Math.max(0, current - INDENT_STEP_PT);
                applyRichDocParagraphAttrs(chain, { indentLeft: next || null });
                break;
            }
            case "indent-right":
                applyRichDocParagraphAttrs(chain, { indentRight: numberOrNull(value) });
                break;
            case "space-before":
                applyRichDocParagraphAttrs(chain, { spaceBefore: numberOrNull(value) });
                break;
            case "space-after":
                applyRichDocParagraphAttrs(chain, { spaceAfter: numberOrNull(value) });
                break;
            case "numbering":
                chain.updateAttributes("orderedList", { numbering: String(value || "decimal") }).run();
                break;
            case "cell-merge":
                chain.mergeCells().run();
                break;
            case "cell-split":
                chain.splitCell().run();
                break;
            case "header-row":
                chain.toggleHeaderRow().run();
                break;
            case "cell-background":
                chain.setCellAttribute("backgroundColor", String(value || "") || null).run();
                break;
            case "cell-valign":
                chain.setCellAttribute("verticalAlign", String(value || "top")).run();
                break;
            case "cell-width": {
                const px = numberOrNull(value);
                chain.setCellAttribute("colwidth", px === null ? null : [px]).run();
                break;
            }
            case "image-wrap":
                chain.updateAttributes("image", { wrap: String(value || "top-bottom") }).run();
                break;
            // --- 批注与修订：审阅层自己开事务，这里不接 `chain`，纯转调 `RichDocReviewApi`。
            case "richdoc.add-comment": {
                if (reviewReadOnly)
                    break;
                const body = String(value || "").trim();
                if (body)
                    state.review?.addComment(body);
                break;
            }
            case "richdoc.toggle-track-changes":
                if (reviewReadOnly)
                    break;
                // 关掉修订模式**不会**清除既有标记：开关状态与「文档里有没有修订」是两件事。
                state.review?.setTrackChangesEnabled(!state.review.trackChangesEnabled);
                break;
            case "richdoc.delete-tracked":
                if (reviewReadOnly)
                    break;
                state.review?.deleteSelectionTracked();
                break;
            case "richdoc.accept-all-changes":
                if (reviewReadOnly)
                    break;
                state.review?.acceptAllChanges();
                break;
            case "richdoc.reject-all-changes":
                if (reviewReadOnly)
                    break;
                state.review?.rejectAllChanges();
                break;
        }
    };
    return {
        context: viewOnlyContext(context, Boolean(state.collabReadOnly), tt),
        dispatch: command,
    };
}
