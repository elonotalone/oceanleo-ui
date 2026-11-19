/** A visible text point survives a history page that adds chunks inside one bubble. */
export type TextAnchor = { text: string; fromEnd: number; offset: number };

function textNodes(element: HTMLElement): Text[] {
  const walker = element.ownerDocument.createTreeWalker(element, 4 /* SHOW_TEXT */);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return nodes;
}

function characterRect(node: Text, offset: number): DOMRect {
  const range = node.ownerDocument.createRange();
  range.setStart(node, offset);
  range.setEnd(node, offset + 1);
  return range.getBoundingClientRect();
}

export function captureTextAnchor(element: HTMLElement, top: number, bottom: number): TextAnchor | undefined {
  // Older browsers/test DOMs without Range layout retain the message anchor.
  if (typeof element.ownerDocument.createRange().getBoundingClientRect !== "function") return;
  const text = element.textContent ?? "";
  let start = 0;
  for (const node of textNodes(element)) {
    const length = node.length;
    if (node.textContent?.trim() && length) {
      const range = node.ownerDocument.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.bottom > top && rect.top < bottom) {
        // Find the first character on the visible line, even in a long paragraph/code node.
        let low = 0, high = length - 1;
        while (low < high) {
          const mid = Math.floor((low + high) / 2);
          if (characterRect(node, mid).bottom > top) high = mid;
          else low = mid + 1;
        }
        const point = characterRect(node, low);
        if (point.width && point.bottom > top && point.top < bottom) {
          const index = start + low;
          return { text: text.slice(index, index + 96), fromEnd: text.length - index, offset: point.top - top };
        }
      }
    }
    start += length;
  }
}

export function textAnchorTop(element: HTMLElement, anchor: TextAnchor): number | undefined {
  if (!anchor.text || typeof element.ownerDocument.createRange().getBoundingClientRect !== "function") return;
  const text = element.textContent ?? "";
  let match = -1, distance = Infinity;
  // Prefer the same occurrence when a repeated line appears in the message.
  for (let index = text.indexOf(anchor.text); index >= 0; index = text.indexOf(anchor.text, index + 1)) {
    const delta = Math.abs(text.length - index - anchor.fromEnd);
    if (delta < distance) { match = index; distance = delta; }
  }
  if (match < 0) return;
  for (const node of textNodes(element)) {
    if (match < node.length) return characterRect(node, match).top;
    match -= node.length;
  }
}
