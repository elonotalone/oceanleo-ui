"use client";

// ============================================================================
// 输入框 `/` 调用技能（skills-overhaul W15，2026-10-24；合同 §3.5）
// ----------------------------------------------------------------------------
// LeoComposer 只做最小接线（一个 prop、一次 hook 调用、handleKeyDown 头一行、渲染一个浮层），
// 全部逻辑在这里：
//   - 触发：光标前是行首或空白、刚键入 `/`（值恰好多了一个字符）。之后继续键入 = 过滤。
//   - ↑↓ 选、Enter / Tab 确认、Esc 关、点外关；光标离开这段 `/片段` 也关。
//   - 确认：把 `/<当前片段>` 替换成 `/name `（编辑器里一次事务，可撤销）。
//   - IME 组字时不触发、不拦键。
//   - 模板实填（TemplateFillArea 灌了模板）时整套不启用。
//   - 没开 `skillSlash`：hook 不挂任何监听、不请求、不渲染，onKeyDown 恒为 false。
// 提交前不改写 `/name`（网关在任务创建时解析，合同 §3.6）。
// 数据：W09B 的 `useAvailableSkills`（个人 + 当前项目），第一次打开浮层时才挂载 → 才请求。
// ============================================================================

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import { openSettingsModal } from "../pages/settings/settings-tabs";
import { SkillPickerList, useAvailableSkills, type AvailableSkill } from "./skills/manager";

/** `LeoComposer` 的 `skillSlash` prop：`true` = 个人技能；`{ projectId }` = 个人 + 该项目技能。 */
export type ComposerSkillSlashOption = boolean | { projectId?: string };

/** 浮层里一条技能（= W09B `useAvailableSkills` 的条目）。 */
export type SlashSkill = AvailableSkill;

/** 光标前那段 `/片段`：`start` 是 `/` 在当前行里的下标，`end` 是光标下标。 */
export interface SlashToken {
  start: number;
  end: number;
  query: string;
}

/** 设置页技能栏地址（「还没有技能 · 去添加」）。 */
export const SKILL_SLASH_SETTINGS_HREF = "/settings/skills";

/** 网关认的技能名字符集（§3.6 `[a-z0-9-]{1,64}`）。片段允许大写，过滤时不分大小写。 */
const SLASH_TOKEN_RE = /(^|\s)\/([A-Za-z0-9-]{0,64})$/;

export function resolveSkillSlashOption(
  option: ComposerSkillSlashOption | undefined,
  templateActive: boolean,
): { enabled: boolean; projectId?: string } {
  if (!option || templateActive) return { enabled: false };
  if (option === true) return { enabled: true };
  const projectId =
    typeof option.projectId === "string" && option.projectId.trim()
      ? option.projectId.trim()
      : undefined;
  return { enabled: true, projectId };
}

/** 光标前文字（当前行）→ `/片段`；不在行首/空白后的 `/`（如 `a/b`、URL）不算。 */
export function detectSlashToken(textBeforeCaret: string): SlashToken | null {
  const match = SLASH_TOKEN_RE.exec(textBeforeCaret);
  if (!match) return null;
  const start = match.index + match[1].length;
  return { start, end: textBeforeCaret.length, query: match[2] };
}

/**
 * 「刚键入 `/`」：片段为空（光标紧贴 `/`）且整段值恰好比上一次多一个字符。
 * 删回 `/`、粘贴一段含 `/` 的文字、程序化写值都不弹。
 */
export function isFreshSlash(prevValue: string, nextValue: string, token: SlashToken | null): boolean {
  return Boolean(token && token.query === "" && nextValue.length === prevValue.length + 1);
}

/**
 * 把一行里的 `/片段` 换成 `/name `（合同 §3.5：插入 `/name `）。
 * 返回要插入的文字（编辑器事务用）与替换后的整行（纯文本回退路径与测试用）。
 */
export function applySkillPick(
  line: string,
  token: SlashToken,
  name: string,
): { insert: string; text: string } {
  const insert = `/${name} `;
  return { insert, text: line.slice(0, token.start) + insert + line.slice(token.end) };
}

export type SlashKeyAction = "next" | "prev" | "pick" | "close" | null;

/** 浮层开着时一次按键该做什么；返回 null = 不拦，按键照常交给编辑器 / 发送逻辑。 */
export function slashKeyAction(
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; isComposing?: boolean },
  itemCount: number,
): SlashKeyAction {
  if (event.isComposing) return null;
  if (event.altKey || event.ctrlKey || event.metaKey) return null;
  switch (event.key) {
    case "ArrowDown":
      return itemCount > 0 ? "next" : null;
    case "ArrowUp":
      return itemCount > 0 ? "prev" : null;
    case "Enter":
      if (event.shiftKey) return null;
      return itemCount > 0 ? "pick" : null;
    case "Tab":
      return itemCount > 0 && !event.shiftKey ? "pick" : null;
    case "Escape":
      return "close";
    default:
      return null;
  }
}

// ── 编辑器适配：读光标前文字、把片段换成 `/name ` ─────────────────────────────

/** 编辑器现在的样子：当前行光标前的文字，以及是否在 IME 组字。 */
export interface SlashEditorContext {
  textBefore: string;
  /** 当前整行（替换时用来判断后面是否紧跟空白）。 */
  line: string;
  composing: boolean;
}

export interface SlashEditorAdapter {
  read: () => SlashEditorContext | null;
  replace: (token: SlashToken, name: string) => void;
}

/** 只用到 Tiptap 编辑器的这几处（`@tiptap/core` 把实例挂在 `view.dom.editor` 上）。 */
interface TiptapLike {
  isDestroyed?: boolean;
  state: {
    selection: {
      empty: boolean;
      $from: {
        parentOffset: number;
        start: () => number;
        parent: { textContent: string; textBetween: (from: number, to: number, block?: string, leaf?: string) => string };
      };
    };
  };
  view: { composing: boolean };
  chain: () => {
    focus: () => {
      insertContentAt: (
        range: { from: number; to: number },
        content: { type: "text"; text: string },
      ) => { run: () => boolean };
    };
  };
}

function tiptapOf(el: HTMLElement | null): TiptapLike | null {
  const editor = (el as (HTMLElement & { editor?: TiptapLike }) | null)?.editor;
  if (!editor || editor.isDestroyed || !editor.state?.selection || !editor.view) return null;
  return editor;
}

/**
 * LeoComposer 的编辑器适配。正常路径直接读写 Tiptap 选区（替换是一次可撤销事务，光标落在插入之后）；
 * 拿不到编辑器实例时退回「光标在末尾」的纯文本路径（读 value 最后一行，用 setText 整体写回）。
 */
export function composerSlashAdapter(
  getEl: () => HTMLElement | null,
  getValue: () => string,
  setText: (value: string) => void,
): SlashEditorAdapter {
  return {
    read() {
      const editor = tiptapOf(getEl());
      if (editor) {
        const { selection } = editor.state;
        if (!selection.empty) return null;
        const { $from } = selection;
        const line = $from.parent.textContent;
        return {
          textBefore: $from.parent.textBetween(0, $from.parentOffset, undefined, "￼"),
          line,
          composing: Boolean(editor.view.composing),
        };
      }
      const value = getValue();
      const line = value.slice(value.lastIndexOf("\n") + 1);
      return { textBefore: line, line, composing: false };
    },
    replace(token, name) {
      const editor = tiptapOf(getEl());
      if (editor) {
        const { $from } = editor.state.selection;
        const { insert } = applySkillPick($from.parent.textContent, token, name);
        const base = $from.start();
        editor
          .chain()
          .focus()
          .insertContentAt(
            { from: base + token.start, to: base + token.end },
            { type: "text", text: insert },
          )
          .run();
        return;
      }
      const value = getValue();
      const lineStart = value.lastIndexOf("\n") + 1;
      const { text } = applySkillPick(value.slice(lineStart), token, name);
      setText(value.slice(0, lineStart) + text);
    },
  };
}

// ── hook ─────────────────────────────────────────────────────────────────────

export interface ComposerSkillSlashInput {
  option: ComposerSkillSlashOption | undefined;
  /** 模板实填模式（TemplateFillArea 灌了模板）——此时不启用。 */
  templateActive: boolean;
  disabled?: boolean;
  value: string;
  adapter: SlashEditorAdapter;
}

export interface ComposerSkillSlash {
  /** 浮层是否开着。 */
  open: boolean;
  /** 放在宿主 onKeyDown 第一行：返回 true = 这一键被浮层吃掉了，宿主别再处理。 */
  onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => boolean;
  /** 渲染在输入框卡片（`relative`）里；未启用时是 null。 */
  popover: ReactNode;
}

const NEVER = () => false;

export function useComposerSkillSlash({
  option,
  templateActive,
  disabled = false,
  value,
  adapter,
}: ComposerSkillSlashInput): ComposerSkillSlash {
  const { enabled: optionEnabled, projectId } = resolveSkillSlashOption(option, templateActive);
  const enabled = optionEnabled && !disabled;
  const [token, setToken] = useState<SlashToken | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // 第一次打开才挂数据层（才发请求）；之后保持挂载，再开不闪「加载中」。
  const [mounted, setMounted] = useState(false);
  const itemsRef = useRef<SlashSkill[]>([]);
  const prevValueRef = useRef(value);
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const layerRef = useRef<HTMLDivElement>(null);
  const open = enabled && token !== null;

  const close = useCallback(() => {
    setToken(null);
    setActiveIndex(0);
  }, []);

  // 值变了：开着就跟着更新片段（没了就关）；关着只在「刚键入 /」时打开。
  useEffect(() => {
    const prev = prevValueRef.current;
    prevValueRef.current = value;
    if (!enabled) return;
    const ctx = adapterRef.current.read();
    if (!ctx || ctx.composing) return;
    const next = detectSlashToken(ctx.textBefore);
    setToken((current) => {
      if (current) {
        if (!next || next.start !== current.start) return null;
        return next.query === current.query && next.end === current.end ? current : next;
      }
      return isFreshSlash(prev, value, next) ? next : null;
    });
  }, [enabled, value]);

  // 未启用（或模板灌进来 / 被禁用）时把残留状态清掉。
  useEffect(() => {
    if (!enabled && token !== null) close();
  }, [enabled, token, close]);

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  // 片段变了 → 高亮回到第一条。
  const tokenQuery = token?.query;
  useEffect(() => {
    if (tokenQuery !== undefined) setActiveIndex(0);
  }, [tokenQuery]);

  // 开着时：光标挪走（selectionchange）或点到浮层与输入框之外 → 关。
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    function onSelectionChange() {
      const ctx = adapterRef.current.read();
      if (!ctx || ctx.composing) return;
      const next = detectSlashToken(ctx.textBefore);
      setToken((current) => {
        if (!current) return current;
        if (!next || next.start !== current.start) return null;
        return next.query === current.query && next.end === current.end ? current : next;
      });
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (target && layerRef.current?.contains(target)) return;
      const host = layerRef.current?.parentElement;
      if (target && host?.contains(target)) return; // 点在输入框里：交给 selectionchange 判断
      close();
    }
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, close]);

  const pick = useCallback(
    (name: string) => {
      const current = token;
      close();
      if (!current || !name) return;
      adapterRef.current.replace(current, name);
    },
    [token, close],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>): boolean => {
      if (!open) return false;
      const native = event.nativeEvent as KeyboardEvent | undefined;
      const items = itemsRef.current;
      const action = slashKeyAction(
        {
          key: event.key,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          isComposing: Boolean(native?.isComposing),
        },
        items.length,
      );
      if (!action) {
        // 没有可选项时回车照常发送 / 换行，浮层顺手收起。
        if (event.key === "Enter" && !native?.isComposing) close();
        return false;
      }
      event.preventDefault();
      event.stopPropagation();
      if (action === "close") close();
      else if (action === "next") setActiveIndex((i) => (i + 1) % items.length);
      else if (action === "prev") setActiveIndex((i) => (i - 1 + items.length) % items.length);
      else if (action === "pick") {
        const chosen = items[Math.min(activeIndex, items.length - 1)];
        if (chosen) pick(chosen.name);
      }
      return true;
    },
    [open, activeIndex, pick, close],
  );

  if (!optionEnabled) return { open: false, onKeyDown: NEVER, popover: null };

  const popover =
    enabled && mounted ? (
      <SkillSlashLayer
        ref={layerRef}
        open={open}
        projectId={projectId}
        query={token?.query ?? ""}
        activeIndex={activeIndex}
        onActiveChange={setActiveIndex}
        onItems={(items) => {
          itemsRef.current = items;
        }}
        onPick={pick}
        onClose={close}
      />
    ) : null;

  return { open, onKeyDown, popover };
}

// ── 浮层 ─────────────────────────────────────────────────────────────────────

interface SkillSlashLayerProps {
  open: boolean;
  projectId?: string;
  query: string;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onItems: (items: SlashSkill[]) => void;
  onPick: (name: string) => void;
  onClose: () => void;
  ref?: Ref<HTMLDivElement>;
}

/**
 * 第一次打开后一直挂着（关着时 `hidden`），所以 SkillPickerList 与数据只取一次，再开不闪。
 * 列表顺序以 SkillPickerList 经 `onItemsChange` 报上来的为准，键盘第 i 条与屏幕第 i 行永远一致。
 */
function SkillSlashLayer({
  open,
  projectId,
  query,
  activeIndex,
  onActiveChange,
  onItems,
  onPick,
  onClose,
  ref,
}: SkillSlashLayerProps) {
  const tt = useUI();
  // 只用来判断「一个技能都没有」（要给「去添加」链接）；列表本身由 SkillPickerList 取数渲染。
  const { skills, loading } = useAvailableSkills(projectId);
  const none = skills.length === 0;
  const showList = !none;
  const reported = useRef<SlashSkill[]>([]);
  // 列表藏起来（加载中 / 没有技能）时键盘没有可选项：回车照常发送。
  useEffect(() => {
    onItems(showList ? reported.current : []);
  });

  return (
    <div
      ref={ref}
      hidden={!open}
      data-composer-skill-slash={open ? "open" : "closed"}
      role="dialog"
      aria-label={tt("选择技能")}
      // 浮层不抢焦点：点它时光标留在输入框里，键盘继续可用。
      onMouseDown={(event) => event.preventDefault()}
      className="v-fade-up absolute bottom-full left-0 z-50 mb-2 w-[min(420px,100%)] overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg transition-all duration-[var(--leo-dur-2)] ease-[var(--leo-ease-standard)] dark:border-white/10 dark:bg-neutral-900"
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3 text-[12px] font-medium text-neutral-400">
        <span>{tt("技能")}</span>
        {showList && <span className="truncate font-normal">{tt("↑↓ 选择 · 回车插入 · Esc 关闭")}</span>}
      </div>
      {none && loading ? (
        <p className="px-4 pb-4 pt-2 text-[13px] text-neutral-400">{tt("加载中…")}</p>
      ) : none ? (
        <p className="px-4 pb-4 pt-2 text-[13px] text-neutral-500" data-composer-skill-slash-empty="">
          {tt("还没有技能")}
          {" · "}
          <a
            href={SKILL_SLASH_SETTINGS_HREF}
            onClick={(event) => {
              event.preventDefault();
              onClose();
              openSettingsModal("skills");
            }}
            className="font-medium text-neutral-800 underline underline-offset-2 hover:text-neutral-950 dark:text-neutral-200"
          >
            {tt("去添加")}
          </a>
        </p>
      ) : null}
      <div hidden={!showList} className="pb-1">
        <SkillPickerList
          projectId={projectId}
          query={query}
          onPick={onPick}
          activeIndex={activeIndex}
          onActiveChange={onActiveChange}
          onItemsChange={(items) => {
            reported.current = items;
            onItems(showList ? items : []);
          }}
        />
      </div>
    </div>
  );
}
