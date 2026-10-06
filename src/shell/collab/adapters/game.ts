/**
 * 游戏代码的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 代码 = 逐字合并：每一页代码一个 `Y.Text`，名字 `oceanleo:game:<pageId>`，由 `bindTextarea` 绑定。
 * 页的增删与顺序 = 实体型状态（实体 = 页，id 就是页 id），根名 `oceanleo:game`。
 *
 * 现有游戏文档的事实（读码）：一份游戏 = 一个信封，`source` 是一整份 HTML，Code 页就是它的
 * 一个文本框。所以今天只有一页（`main`）；页表和多文本的结构按契约留着，将来游戏拆成多文件时
 * 不用改协同层。
 *
 * 只读代码快照给回放画：不运行任何代码。
 */
import { readEntityRoot, type EntityDoc } from "./video";

export const GAME_ROOT = "oceanleo:game";
export const GAME_MAIN_PAGE = "main";

export interface GameCollabPage {
  id: string;
  label: string;
  /** 代码文本。页表实体里不存它（它在 Y.Text 里），快照里才有。 */
  code?: string;
}

export interface GameCollabState {
  pages: GameCollabPage[];
  /** 游戏产物的来路等不随代码变的信息，原样透传。 */
  origin?: string;
  paramDeclarations?: unknown;
}

const PAGE = "page:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function gameTextName(pageId: string): string {
  return `${GAME_ROOT}:${pageId}`;
}

export function gameToEntities(state: GameCollabState): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  for (const page of state.pages) {
    const key = `${PAGE}${page.id}`;
    order.push(key);
    entities[key] = { label: page.label };
  }
  return {
    order,
    entities,
    meta: {
      ...(state.origin !== undefined ? { origin: state.origin } : {}),
      ...(state.paramDeclarations !== undefined ? { paramDeclarations: state.paramDeclarations } : {}),
    },
  };
}

export function gameFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  prev: GameCollabState | null,
): GameCollabState {
  const pages: GameCollabPage[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (!key.startsWith(PAGE) || seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    pages.push({ id: key.slice(PAGE.length), label: typeof entity.label === "string" ? entity.label : key.slice(PAGE.length) });
  }
  const meta = input.meta ?? {};
  return {
    pages,
    ...(meta.origin !== undefined ? { origin: String(meta.origin) } : prev?.origin !== undefined ? { origin: prev.origin } : {}),
    ...(meta.paramDeclarations !== undefined
      ? { paramDeclarations: meta.paramDeclarations }
      : prev?.paramDeclarations !== undefined
        ? { paramDeclarations: prev.paramDeclarations }
        : {}),
  };
}

/** 单页游戏的初始状态。 */
export function gameInitialState(origin?: string, paramDeclarations?: unknown): GameCollabState {
  return {
    pages: [{ id: GAME_MAIN_PAGE, label: "main" }],
    ...(origin !== undefined ? { origin } : {}),
    ...(paramDeclarations !== undefined ? { paramDeclarations } : {}),
  };
}

type YLike = { getText(name: string): { toString(): string } };

/** 从 Y.Doc 取出所有页的代码快照（鸭子类型，不 import yjs）。 */
export function gameFromYDoc(doc: unknown): GameCollabState {
  const state = gameFromEntities(readEntityRoot(doc, GAME_ROOT), null);
  const texts = doc as YLike;
  const pages = state.pages.length ? state.pages : [{ id: GAME_MAIN_PAGE, label: "main" }];
  return { ...state, pages: pages.map((page) => ({ ...page, code: texts.getText(gameTextName(page.id)).toString() })) };
}

/** 版本 JSON：游戏信封 `{ source, origin, manifest }`（或带 source 的工作文档）→ 单页快照。 */
export function gameFromRevisionJson(json: unknown): GameCollabState {
  const record = isRecord(json) ? json : {};
  const manifest = isRecord(record.manifest) ? record.manifest : {};
  return {
    pages: [{ id: GAME_MAIN_PAGE, label: "main", code: typeof record.source === "string" ? record.source : "" }],
    ...(typeof record.origin === "string" ? { origin: record.origin } : {}),
    ...(manifest.paramDeclarations !== undefined ? { paramDeclarations: manifest.paramDeclarations } : {}),
  };
}

export function gameCodeLines(code: string | undefined): string[] {
  return (code ?? "").split("\n");
}

/**
 * 逐行对比，返回新版里「新增或被改过」的行号（1 起）。用最长公共子序列，
 * 代码插入一行时不会把后面所有行都算成改动。超大文件退化为按行号对齐。
 */
export function gameChangedLines(prev: string | undefined, next: string | undefined): number[] {
  const a = gameCodeLines(prev);
  const b = gameCodeLines(next);
  if (prev === undefined) return b.map((_, index) => index + 1);
  if (a.length * b.length > 4_000_000) {
    return b.flatMap((line, index) => (a[index] === line ? [] : [index + 1]));
  }
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1 : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  const kept = new Set<number>();
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      kept.add(j);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) i += 1;
    else j += 1;
  }
  return b.flatMap((_, index) => (kept.has(index) ? [] : [index + 1]));
}

export function gameDescribeChange(prev: unknown, next: unknown): string | null {
  if (!isRecord(next) || !Array.isArray(next.pages)) return null;
  const nextState = next as unknown as GameCollabState;
  const prevState = isRecord(prev) && Array.isArray(prev.pages) ? (prev as unknown as GameCollabState) : null;
  const prevPages = new Map((prevState?.pages ?? []).map((page) => [page.id, page]));
  let lines = 0;
  let removedLines = 0;
  let pagesAdded = 0;
  for (const page of nextState.pages) {
    const old = prevPages.get(page.id);
    if (!old) pagesAdded += 1;
    lines += gameChangedLines(old?.code, page.code).length;
    if (old) removedLines += Math.max(0, gameCodeLines(old.code).length - gameCodeLines(page.code).length);
  }
  const parts: string[] = [];
  if (pagesAdded && prevState) parts.push(`新增了 ${pagesAdded} 页`);
  if (lines) parts.push(`改了 ${lines} 行代码`);
  if (removedLines) parts.push(`少了 ${removedLines} 行`);
  return parts.length ? parts.join("，") : null;
}

/** 「从这一步接手」：还原成游戏信封的最小形状（source + origin + manifest）。 */
export function gameToArtifactJson(snapshot: unknown): unknown {
  const state = isRecord(snapshot) && Array.isArray(snapshot.pages) ? (snapshot as unknown as GameCollabState) : gameFromRevisionJson(snapshot);
  const main = state.pages.find((page) => page.id === GAME_MAIN_PAGE) ?? state.pages[0];
  return {
    source: main?.code ?? "",
    origin: state.origin ?? "ai",
    ...(state.paramDeclarations !== undefined ? { manifest: { paramDeclarations: state.paramDeclarations } } : {}),
  };
}
