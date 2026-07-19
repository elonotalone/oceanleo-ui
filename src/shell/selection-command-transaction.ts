import type { SelectionCommand } from "./selection-context";

export interface SelectionGestureHandlers {
  begin: (controlId: string) => void;
  commit: () => void;
  cancel: () => void;
}

export class SelectionCommandTransaction {
  #activeId: SelectionCommand["transactionId"] = undefined;

  continues(message: SelectionCommand): boolean {
    return (
      message.transactionId !== undefined &&
      this.#activeId === message.transactionId
    );
  }

  run(
    message: SelectionCommand,
    handlers: SelectionGestureHandlers,
    mutate: () => void,
  ): void {
    if (!message.transactionId) {
      mutate();
      return;
    }
    if (message.phase === "start") {
      this.#activeId = message.transactionId;
      handlers.begin(message.controlId);
      return;
    }
    if (message.phase === "cancel") {
      handlers.cancel();
      this.#activeId = undefined;
      return;
    }
    if (this.#activeId !== message.transactionId) {
      if (this.#activeId !== undefined) handlers.cancel();
      this.#activeId = message.transactionId;
      handlers.begin(message.controlId);
    }
    mutate();
    if (message.phase !== "commit") return;
    handlers.commit();
    this.#activeId = undefined;
  }
}
