export class Model3DCommandHistory {
  #past = [];
  #future = [];
  #limit;
  #onChange;

  constructor({ limit = 100, onChange } = {}) {
    this.#limit = Math.max(1, Number(limit) || 100);
    this.#onChange = typeof onChange === "function" ? onChange : null;
  }

  get canUndo() {
    return this.#past.length > 0;
  }

  get canRedo() {
    return this.#future.length > 0;
  }

  get snapshot() {
    return {
      canUndo: this.canUndo,
      canRedo: this.canRedo,
      undoLabel: this.#past.at(-1)?.label || "",
      redoLabel: this.#future.at(-1)?.label || "",
    };
  }

  clear() {
    this.#past = [];
    this.#future = [];
    this.#emit();
  }

  execute(label, redo, undo) {
    redo();
    this.record(label, undo, redo);
  }

  record(label, undo, redo) {
    if (typeof undo !== "function" || typeof redo !== "function") return;
    this.#past.push({
      label: String(label || "编辑"),
      undo,
      redo,
    });
    if (this.#past.length > this.#limit) this.#past.shift();
    this.#future = [];
    this.#emit();
  }

  undo() {
    const command = this.#past.pop();
    if (!command) return false;
    command.undo();
    this.#future.push(command);
    this.#emit();
    return true;
  }

  redo() {
    const command = this.#future.pop();
    if (!command) return false;
    command.redo();
    this.#past.push(command);
    this.#emit();
    return true;
  }

  #emit() {
    this.#onChange?.(this.snapshot);
  }
}
