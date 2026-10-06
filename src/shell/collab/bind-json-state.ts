/** B1 空壳：bindJsonState 返回空操作。 */
import type { BindJsonStateOptions, JsonStateBinding } from "./index";

export function bindJsonState<T>(_opts: BindJsonStateOptions<T>): JsonStateBinding<T> {
  return { push() {}, seed() {}, onRemote: () => () => {}, destroy() {} };
}
