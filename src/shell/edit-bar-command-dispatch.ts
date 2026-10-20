import {
  normalizeSelectionCommand,
  type SelectionCommand,
  type SelectionContext,
} from "./selection-context";
import { SelectionCommandGate } from "./selection-transactions";

export interface EditBarCommandHandlerInfo {
  generation: number;
  isCurrent(): boolean;
}

export type EditBarCommandHandler = (
  command: SelectionCommand,
  info: EditBarCommandHandlerInfo,
) => unknown;

export type EditBarCommandDispatchResult =
  | { ok: true; queued?: boolean; requestId: string }
  | { ok: false; reason: "invalid-command" | "stale-selection"; requestId?: string };

/**
 * Shared edit-bar command bus.
 *
 * Routes already pass `onCommand` into SelectionToolbar. This helper is the
 * lifecycle that was missing: one active handler, queue until it registers,
 * forget in-flight work when that handler unmounts, and run every command
 * through the same selection gate the hosted iframe already uses.
 */
export class EditBarCommandDispatcher {
  readonly gate = new SelectionCommandGate();
  #handler: EditBarCommandHandler | null = null;
  #generation = 0;
  #queue: SelectionCommand[] = [];
  readonly #inflight = new Map<string, Promise<unknown>>();

  register(handler: EditBarCommandHandler): () => void {
    this.#generation += 1;
    const generation = this.#generation;
    this.#handler = handler;
    const queued = this.#queue.splice(0);
    for (const command of queued) this.#invoke(command, generation);
    return () => {
      if (this.#generation !== generation) return;
      this.#handler = null;
      this.#queue = [];
      this.#inflight.clear();
    };
  }

  dispatch(
    command: SelectionCommand,
    context: SelectionContext | null,
  ): EditBarCommandDispatchResult {
    const normalized = normalizeSelectionCommand(command);
    if (!normalized) return { ok: false, reason: "invalid-command" };
    if (!this.gate.accept(normalized, context)) {
      return {
        ok: false,
        reason: "stale-selection",
        requestId: normalized.requestId,
      };
    }
    if (!this.#handler) {
      this.#queue.push(normalized);
      return { ok: true, queued: true, requestId: normalized.requestId };
    }
    this.#invoke(normalized, this.#generation);
    return { ok: true, requestId: normalized.requestId };
  }

  get pendingRequestIds(): string[] {
    return [
      ...this.#queue.map((command) => command.requestId),
      ...this.#inflight.keys(),
    ];
  }

  #invoke(command: SelectionCommand, generation: number): void {
    const handler = this.#handler;
    if (!handler) return;
    const info: EditBarCommandHandlerInfo = {
      generation,
      isCurrent: () =>
        this.#generation === generation && this.#handler === handler,
    };
    try {
      const result = handler(command, info);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        const tracked = Promise.resolve(result).finally(() => {
          if (this.#generation === generation) {
            this.#inflight.delete(command.requestId);
          }
        });
        this.#inflight.set(command.requestId, tracked);
      }
    } catch {
      // Handler exceptions stay with the adapter. The bus does not invent a
      // document mutation or disable the selection gate.
    }
  }
}
