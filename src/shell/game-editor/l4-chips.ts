/**
 * L4：游戏编辑器的 agent 快捷动作（chips），走契约 v2 的 `tools-manifest` v2。
 *
 * 校验器用宿主那一份（`validAgentChips`），不复制 —— 复制一份的结果必然是两边慢慢
 * 长歪，而歪的那天没人会收到通知。
 *
 * `appliesTo` 里的取值必须逐字等于编辑面真正发出去的 `SelectionContext.kind`，
 * 写错一个字 chip 就永远不出现，而且没有任何报错。游戏这一件今天只发三种：
 * 见 `GAME_SELECTION_KINDS`。
 *
 * ⚠️ **凡是会改游戏源码的 chip，落地路径都必须过 `game-agent-gate.ts`**
 * （A-41/A-43：agent 改动 100% 进审阅）。chips 本身只是提示词模板，它不写代码；
 * 真正的写入口只有一个，在那个文件里。
 */
import {
  CHIP_ANY_SELECTION,
  validAgentChips,
  type EditorAgentChip,
  // 目录 import 在 Node ESM 下是 ERR_UNSUPPORTED_DIR_IMPORT，必须写 /index。
} from "../hosted-editor/index";
import {
  CC0_ART_SOURCES,
  renderCc0ArtSourceLines,
} from "./cc0-art-sources";

/** 游戏编辑面会发出的三种选区 kind。 */
export const GAME_SELECTION_KINDS = [
  /** 代码编辑器里选中的一段源码。 */
  "game-code",
  /** 整份游戏文档（没选具体片段时的默认对象）。 */
  "game-document",
  /** 参数面板里的某一项可调参数。 */
  "game-param",
] as const;

const CODE_OR_DOCUMENT = ["game-code", "game-document"];

/**
 * 「换美术风格」这一条的提示词（判据 3）。
 *
 * 素材来源由 `cc0-art-sources.ts` 渲染进来，**不在这里手抄地址**：手抄一次，
 * 那张表的许可栏就管不住这条提示词了，而这条提示词才是作者真正会照着去做的东西。
 */
function reskinPrompt(): string {
  const lines = renderCc0ArtSourceLines(CC0_ART_SOURCES)
    .map((line) => `- ${line}`)
    .join("\n");
  return [
    "请把这份游戏的美术风格换掉，**玩法与关卡结构一个字都不要改**：",
    "只替换精灵、配色、字体与音效的引用，保持所有坐标、碰撞体积、数值与逻辑不变。",
    "素材只许从下面这些 CC0 来源取（可直接商用、不需要署名）：",
    lines,
    "不要引用任何其它站点的素材，也不要生成 base64 位图塞进源码。",
    "当前对象：{selection}",
  ].join("\n");
}

/**
 * 八条快捷动作（契约 v2 上限 8）。
 *
 * 选这八条的依据是「作者在代码编辑面前最常想干的事」，而不是「引擎能做什么」：
 * 前四条是玩法迭代，第五条是判据 3 的换皮，后三条是他每次发布前都要过一遍的
 * 手活（找 bug、调难度、补手机适配）。
 */
export const GAME_AGENT_CHIPS: readonly EditorAgentChip[] = [
  {
    id: "game.chip.reskin",
    label: "换美术风格",
    kind: "restyle",
    appliesTo: [CHIP_ANY_SELECTION],
    prompt: reskinPrompt(),
  },
  {
    id: "game.chip.explain",
    label: "讲清这段在干什么",
    kind: "summarize",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "请用人话讲清这段游戏代码在干什么，按「谁在什么时候被调用」组织，不要逐行翻译：{selection}",
  },
  {
    id: "game.chip.add-mechanic",
    label: "加一条玩法",
    kind: "generate",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "我想给这个游戏加一条玩法（我会在下一句说是什么）。请只改必要的那几处，并说明你动了哪些函数：{selection}",
  },
  {
    id: "game.chip.fix-bug",
    label: "找出跑不起来的原因",
    kind: "analyze",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "这个游戏跑起来不对（我会在下一句描述现象）。请只指出最可能的那一处原因并给出最小改动：{selection}",
  },
  {
    id: "game.chip.tune-difficulty",
    label: "调难度曲线",
    kind: "rewrite",
    appliesTo: ["game-param", "game-document"],
    prompt:
      "请调整这个游戏的难度曲线：把速度、生成频率、血量这些数值改成前松后紧，并把改动理由按关卡阶段列出来：{selection}",
  },
  {
    id: "game.chip.expose-params",
    label: "抽出可调参数",
    kind: "extract",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "请把这段代码里写死的数值抽成 3–6 个可调参数（每项要有 label / min / max / step / default），并说明每一项影响什么手感：{selection}",
  },
  {
    id: "game.chip.mobile",
    label: "补手机适配",
    kind: "layout",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "请补上手机端适配：触屏输入、按安全区留边、画布按视口自适应。键鼠操作要保持原样可用：{selection}",
  },
  {
    id: "game.chip.cleanup",
    label: "清掉没用的代码",
    kind: "cleanup",
    appliesTo: CODE_OR_DOCUMENT,
    prompt:
      "请找出这份源码里不会被执行到的分支、没被引用的变量与重复的函数，列成清单。先别改，等我确认：{selection}",
  },
];

/** chips 合法吗。模块加载时就跑（见文件末尾）。 */
export function gameAgentChipsAreValid(): boolean {
  return validAgentChips(GAME_AGENT_CHIPS);
}

/** `tools-manifest` v2 的那两个可选字段，游戏这一份。 */
export function gameToolsManifestChips(): {
  manifestVersion: 2;
  chips: EditorAgentChip[];
} {
  return { manifestVersion: 2, chips: [...GAME_AGENT_CHIPS] };
}

/**
 * 「换美术风格」那一条 chip。判据 3 的验收入口：它必须存在，且它的提示词里
 * 必须真的出现 CC0 来源表里的地址。
 */
export function gameReskinChip(): EditorAgentChip | null {
  return GAME_AGENT_CHIPS.find((chip) => chip.id === "game.chip.reskin") || null;
}

if (!gameAgentChipsAreValid()) {
  throw new Error(
    "GAME_AGENT_CHIPS 没通过契约 v2 的 validAgentChips（数量 >8、id 重复、kind 不在闭集，或 prompt 超长）。",
  );
}
