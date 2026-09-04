/**
 * L4 chips 目录：优先消费各编辑器已入库的 `tools-manifest` v2 产出，
 * 校验一律走宿主 `validAgentChips` / `chipsForSelection` / `renderChipPrompt`。
 *
 * 不许另造校验器。W03/W04/W06 的函数在本仓；W08 的 `RICHDOC_CHIPS` 在 umo-hosted，
 * 运行期经 `rememberEditorChips("richdoc", …)` 注入（iframe 的 tools-manifest）。
 */
import {
  chipsForSelection,
  renderChipPrompt,
  validAgentChips,
  type EditorAgentChip,
} from "../hosted-editor/index";
import { gridToolsManifestChips } from "../doc-editors/grid-univer/l4-chips";
import { imageDesignChipManifestEntries } from "../image-editor/design-mode/l4-chips";
import { pdfToolsManifestV2Fields } from "../media-editors/pdf-agent-chips";
import { rememberedChips } from "../agent-review/inbox";

export type ChipEditorId =
  | "grid"
  | "image"
  | "pdf"
  | "richdoc"
  | "deck"
  | "video"
  | "audio"
  | "model3d"
  | "chart"
  | "website"
  | "game"
  | "workflow"
  | "wechat";

function chip(
  id: string,
  label: string,
  kind: EditorAgentChip["kind"],
  prompt: string,
  appliesTo: string[] = ["*"],
): EditorAgentChip {
  return { id, label, kind, prompt, appliesTo };
}

/** 规范 §3 里尚未由本仓导出函数的件：只作回退，仍过 `validAgentChips`。 */
const FALLBACK: Record<string, EditorAgentChip[]> = {
  richdoc: [
    chip("richdoc.shorten", "缩短", "rewrite", "把这段话改短，信息一条不丢：{selection}", ["text", "paragraph", "heading"]),
    chip("richdoc.expand", "加长", "rewrite", "把这段话展开，不要注水：{selection}", ["text", "paragraph", "heading"]),
    chip("richdoc.tone", "换语气", "rewrite", "把这段话换成更正式的书面语气：{selection}", ["text", "paragraph", "heading"]),
    chip("richdoc.translate", "翻译", "translate", "把这段话翻译成英文：{selection}", ["text", "paragraph", "heading"]),
    chip("richdoc.polish", "润色", "rewrite", "润色这段话，不要改变意思：{selection}", ["text", "paragraph", "heading"]),
    chip("richdoc.summarize", "生成摘要", "summarize", "给这份文档写一段摘要：{document}"),
    chip("richdoc.wechat", "转公众号排版", "export", "把这份文档转成微信公众号排版：{document}"),
    chip("richdoc.toc", "加目录", "layout", "为这份文档生成目录：{document}"),
  ],
  deck: [
    chip("deck.chip.theme", "换主题", "restyle", "给这些页换一套主题，版式不动：{selection}"),
    chip("deck.chip.shorten", "精简文字", "rewrite", "精简这些页的文字：{selection}"),
    chip("deck.chip.art", "配图", "generate", "为这些页配图：{selection}"),
    chip("deck.chip.add-page", "加一页", "generate", "在当前页后加一页：{selection}"),
    chip("deck.chip.split", "拆成两页", "layout", "把这一页拆成两页：{selection}"),
    chip("deck.chip.notes", "加演讲备注", "generate", "为这些页加演讲备注：{selection}"),
    chip("deck.chip.font", "统一字体", "restyle", "统一这些页的字体：{document}"),
    chip("deck.chip.outline", "生成大纲", "summarize", "根据文档生成大纲：{document}"),
  ],
  video: [
    chip("video.chip.um", "删口头语与静音", "cleanup", "删口头语与静音段：{selection}"),
    chip("video.chip.subs", "加字幕", "generate", "为这段视频加字幕：{document}"),
    chip("video.chip.cut", "按文字稿剪", "cleanup", "按文字稿剪辑：{selection}"),
    chip("video.chip.intro", "加片头片尾", "layout", "加片头片尾：{document}"),
    chip("video.chip.bgm", "换 BGM", "restyle", "换一段背景音乐：{document}"),
    chip("video.chip.vertical", "竖版适配", "layout", "适配竖版：{document}"),
    chip("video.chip.cover", "生成封面", "generate", "生成封面：{document}"),
    chip("video.chip.export", "导出预设", "export", "按预设导出：{document}"),
  ],
  audio: [
    chip("audio.chip.transcribe", "转写", "extract", "转写这段音频：{document}"),
    chip("audio.chip.cut", "按文字删段", "cleanup", "按文字删段：{selection}"),
    chip("audio.chip.denoise", "降噪", "cleanup", "降噪：{document}"),
    chip("audio.chip.lufs", "匀响度", "cleanup", "匀到 -14 LUFS：{document}"),
    chip("audio.chip.um", "去口头语", "cleanup", "去口头语：{document}"),
    chip("audio.chip.bgm", "加 BGM", "generate", "加背景音乐：{document}"),
    chip("audio.chip.chapters", "分章节", "layout", "按内容分章节：{document}"),
    chip("audio.chip.export", "导出预设", "export", "按预设导出：{document}"),
  ],
  model3d: [
    chip("model3d.chip.env", "换环境光", "restyle", "换环境光：{document}"),
    chip("model3d.chip.render", "出图", "export", "出四视角图：{document}"),
    chip("model3d.chip.glb", "转 GLB", "export", "导出 GLB：{document}"),
    chip("model3d.chip.mat", "生成材质", "generate", "生成材质：{selection}"),
    chip("model3d.chip.shadow", "加地面阴影", "layout", "加地面阴影：{document}"),
    chip("model3d.chip.spin", "自转预览", "analyze", "打开自转预览：{document}"),
  ],
  chart: [
    chip("chart.chip.advise", "推荐图型", "analyze", "为这些数据推荐图型：{selection}"),
    chip("chart.chip.title", "改标题与注释", "rewrite", "改标题与注释：{selection}"),
    chip("chart.chip.color", "换配色", "restyle", "换配色：{document}"),
    chip("chart.chip.trend", "加趋势线", "layout", "加趋势线：{selection}"),
    chip("chart.chip.dual", "双轴", "layout", "改成双轴：{document}"),
    chip("chart.chip.export", "导出 SVG/PNG", "export", "导出 SVG 或 PNG：{document}"),
    chip("chart.chip.read", "生成解读文字", "summarize", "生成解读文字：{document}"),
  ],
  website: [
    chip("website.chip.theme", "换主题", "restyle", "换主题，结构不动：{document}"),
    chip("website.chip.tone", "改文案语气", "rewrite", "改文案语气：{selection}"),
    chip("website.chip.block", "加一个区块", "generate", "加一个区块：{selection}"),
    chip("website.chip.responsive", "响应式检查", "analyze", "做响应式检查：{document}"),
    chip("website.chip.seo", "SEO 元信息", "generate", "补 SEO 元信息：{document}"),
    chip("website.chip.image", "生成图片", "generate", "为这个区块生成图片：{selection}"),
    chip("website.chip.publish", "发布", "export", "准备发布：{document}"),
  ],
  game: [
    chip("game.chip.difficulty", "改难度", "rewrite", "改难度：{document}"),
    chip("game.chip.art", "换美术风格", "restyle", "换美术风格：{document}"),
    chip("game.chip.level", "加关卡", "generate", "加一关：{document}"),
    chip("game.chip.bug", "修 bug", "cleanup", "修这个 bug：{selection}"),
    chip("game.chip.sfx", "加音效", "generate", "加音效：{document}"),
    chip("game.chip.export", "导出 HTML", "export", "导出 HTML：{document}"),
  ],
  workflow: [
    chip("workflow.chip.gen", "生成流程", "generate", "生成流程：{document}"),
    chip("workflow.chip.explain", "解释流程", "summarize", "解释这个流程：{document}"),
    chip("workflow.chip.prompt", "优化提示词", "rewrite", "优化提示词：{selection}"),
    chip("workflow.chip.errors", "加错误处理", "layout", "加错误处理：{document}"),
    chip("workflow.chip.cron", "转为定时任务", "layout", "转为定时任务：{document}"),
    chip("workflow.chip.export", "导出 JSON", "export", "导出 JSON：{document}"),
  ],
  wechat: [
    chip("wechat.chip.layout", "一键排版", "layout", "一键排版：{document}"),
    chip("wechat.chip.summary", "生成摘要", "summarize", "生成摘要：{document}"),
    chip("wechat.chip.cover", "配封面图", "generate", "配封面图：{document}"),
    chip("wechat.chip.ban", "检查违禁词", "analyze", "检查违禁词：{document}"),
    chip("wechat.chip.copy", "复制到公众号", "export", "复制到公众号：{document}"),
  ],
};

function normalizeEditorId(editorId: string | null | undefined): string {
  const raw = String(editorId || "").trim().toLowerCase();
  if (raw === "sheet" || raw === "table") return "grid";
  if (raw === "design" || raw === "design-canvas" || raw === "photo") return "image";
  if (raw === "doc" || raw === "document") return "richdoc";
  if (raw === "ppt" || raw === "slides") return "deck";
  if (raw === "flow") return "workflow";
  return raw;
}

function fromProducer(editorId: string): EditorAgentChip[] | null {
  if (editorId === "grid") return gridToolsManifestChips().chips;
  if (editorId === "image") return imageDesignChipManifestEntries("design");
  if (editorId === "pdf") return pdfToolsManifestV2Fields().chips;
  return null;
}

export function chipsForEditor(
  editorId: string | null | undefined,
  selectionKind: string | null,
): EditorAgentChip[] {
  const id = normalizeEditorId(editorId);
  const live = rememberedChips(id);
  const produced = fromProducer(id);
  const fallback = FALLBACK[id];
  const source = live || produced || fallback || [];
  if (!validAgentChips(source)) return [];
  return chipsForSelection(source, selectionKind);
}

export function promptForChip(
  chipItem: EditorAgentChip,
  ctx: { selection?: string; document?: string },
): string {
  return renderChipPrompt(chipItem, ctx);
}

export function fallbackChipLabels(editorId: string): string[] {
  return (FALLBACK[normalizeEditorId(editorId)] || []).map((item) => item.label);
}

export { chipsForSelection, renderChipPrompt, validAgentChips };
