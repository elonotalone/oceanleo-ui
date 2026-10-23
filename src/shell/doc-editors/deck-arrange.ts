import type { DeckElement } from "./deck-schema";

export type DeckArrangeMode = "front" | "forward" | "backward" | "back";

export function deckArrangeMode(value: unknown): DeckArrangeMode | null {
  return value === "front" ||
    value === "forward" ||
    value === "backward" ||
    value === "back"
    ? value
    : null;
}

/**
 * 统一栏「层级」（置顶 / 上移 / 下移 / 置底）。按当前叠放顺序挪动选中元素，
 * 再把整页的 `order` 重排成 1…n 的整数（画布与缩略图都按取整后的 order 叠放，
 * 小数会让两层并列）。挪不动（已在顶 / 底）时原样返回同一个数组。
 */
export function deckArrangedElements(
  elements: readonly DeckElement[],
  id: string,
  mode: DeckArrangeMode,
): DeckElement[] {
  const stack = [...elements].sort((left, right) => left.order - right.order);
  const index = stack.findIndex((element) => element.id === id);
  if (index < 0) return [...elements];
  const target =
    mode === "front"
      ? stack.length - 1
      : mode === "back"
        ? 0
        : Math.max(0, Math.min(stack.length - 1, index + (mode === "forward" ? 1 : -1)));
  if (target === index) return [...elements];
  const [moved] = stack.splice(index, 1);
  stack.splice(target, 0, moved);
  const orderOf = new Map(stack.map((element, position) => [element.id, position + 1]));
  return elements.map((element) => ({
    ...element,
    order: orderOf.get(element.id) ?? element.order,
  }));
}
