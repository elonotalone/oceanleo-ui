/** B1 空壳：bindTextarea 空操作。 */
import type { CollabRoom } from "./index";

export function bindTextarea(_room: CollabRoom, _textName: string, _el: HTMLTextAreaElement): { destroy(): void } {
  return { destroy() {} };
}
