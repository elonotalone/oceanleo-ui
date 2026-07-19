import type {
  SelectionCommand,
  SelectionCommandPhase,
  SelectionContext,
  SelectionControlValue,
  SelectionRevision,
} from "./selection-context";

interface ActiveSelectionGesture {
  id: string;
  selectionId: string;
  selectionRevision?: SelectionRevision;
  selectionEpoch?: SelectionRevision;
  initialValue?: SelectionControlValue;
  latestValue?: SelectionControlValue;
}

interface SelectionTransactionIdentity {
  selectionId: string;
  selectionRevision?: SelectionRevision;
  selectionEpoch?: SelectionRevision;
  controlId: string;
}

function requestId(prefix: "sel" | "txn"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function sameRevision(
  left: SelectionRevision | undefined,
  right: SelectionRevision | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return String(left) === String(right);
}

function matchesTransaction(
  command: SelectionCommand,
  transaction: SelectionTransactionIdentity,
): boolean {
  return (
    command.selectionId === transaction.selectionId &&
    command.controlId === transaction.controlId &&
    sameRevision(command.selectionRevision, transaction.selectionRevision) &&
    sameRevision(command.selectionEpoch, transaction.selectionEpoch)
  );
}

export class SelectionGestureTransaction {
  readonly controlId: string;
  private gesture: ActiveSelectionGesture | null = null;

  constructor(controlId: string) {
    this.controlId = controlId;
  }

  get active(): boolean {
    return this.gesture !== null;
  }

  start(
    selection: Pick<SelectionContext, "id" | "revision" | "epoch">,
    value?: SelectionControlValue,
  ): SelectionCommand | null {
    if (this.gesture) return null;
    this.gesture = {
      id: requestId("txn"),
      selectionId: selection.id,
      selectionRevision: selection.revision,
      selectionEpoch: selection.epoch,
      initialValue: value,
      latestValue: value,
    };
    return this.command("start", value);
  }

  update(value: SelectionControlValue): SelectionCommand | null {
    if (!this.gesture) return null;
    this.gesture.latestValue = value;
    return this.command("update", value);
  }

  commit(value = this.gesture?.latestValue): SelectionCommand | null {
    if (!this.gesture) return null;
    const phase = Object.is(value, this.gesture.initialValue) ? "cancel" : "commit";
    const command = this.command(phase, value);
    this.gesture = null;
    return command;
  }

  cancel(): SelectionCommand | null {
    if (!this.gesture) return null;
    const command = this.command("cancel", this.gesture.initialValue);
    this.gesture = null;
    return command;
  }

  private command(
    phase: SelectionCommandPhase,
    value?: SelectionControlValue,
  ): SelectionCommand {
    const gesture = this.gesture!;
    return {
      requestId: requestId("sel"),
      selectionId: gesture.selectionId,
      controlId: this.controlId,
      ...(value !== undefined ? { value } : {}),
      ...(gesture.selectionRevision !== undefined
        ? { selectionRevision: gesture.selectionRevision }
        : {}),
      ...(gesture.selectionEpoch !== undefined
        ? { selectionEpoch: gesture.selectionEpoch }
        : {}),
      phase,
      transactionId: gesture.id,
    };
  }
}

export class SelectionCommandGate {
  private readonly transactions = new Map<string, SelectionTransactionIdentity>();
  private readonly settledTransactions = new Map<
    string,
    SelectionTransactionIdentity
  >();
  private readonly settledOrder: string[] = [];
  private readonly seenRequests = new Set<string>();
  private readonly requestOrder: string[] = [];

  accept(command: SelectionCommand, context: SelectionContext | null): boolean {
    if (this.seenRequests.has(command.requestId)) return false;
    const transactionId = command.transactionId;
    const transaction = transactionId
      ? this.transactions.get(transactionId)
      : undefined;
    if (transaction) {
      if (
        !matchesTransaction(command, transaction) ||
        !["update", "commit", "cancel"].includes(command.phase || "")
      ) {
        return false;
      }
      if (command.phase === "commit" || command.phase === "cancel") {
        this.settle(transactionId!, transaction);
      }
      this.remember(command.requestId);
      return true;
    }

    const settled = transactionId
      ? this.settledTransactions.get(transactionId)
      : undefined;
    if (
      settled &&
      command.phase === "cancel" &&
      matchesTransaction(command, settled)
    ) {
      this.remember(command.requestId);
      return true;
    }
    if (
      command.phase === "update" ||
      command.phase === "cancel" ||
      (command.phase === "commit" && transactionId)
    ) {
      return false;
    }
    if (command.selectionId.startsWith("host:")) {
      // Global editor commands do not target the current selected object.
    } else if (context) {
      if (
        command.selectionId !== context.id ||
        !sameRevision(command.selectionRevision, context.revision) ||
        !sameRevision(command.selectionEpoch, context.epoch)
      ) {
        return false;
      }
    } else {
      return false;
    }
    if (command.phase === "start") {
      if (!transactionId || this.settledTransactions.has(transactionId)) {
        return false;
      }
      this.transactions.set(transactionId, {
        selectionId: command.selectionId,
        selectionRevision: command.selectionRevision,
        selectionEpoch: command.selectionEpoch,
        controlId: command.controlId,
      });
    }
    this.remember(command.requestId);
    return true;
  }

  reconcile(context: SelectionContext | null): SelectionCommand[] {
    const cancellations: SelectionCommand[] = [];
    for (const [id, transaction] of this.transactions) {
      if (
        context &&
        transaction.selectionId === context.id &&
        sameRevision(transaction.selectionRevision, context.revision) &&
        sameRevision(transaction.selectionEpoch, context.epoch)
      ) {
        continue;
      }
      cancellations.push(this.cancelCommand(id, transaction));
      this.settle(id, transaction);
    }
    return cancellations;
  }

  cancelAll(): SelectionCommand[] {
    return this.reconcile(null);
  }

  clear(): void {
    this.transactions.clear();
    this.settledTransactions.clear();
    this.settledOrder.length = 0;
    this.seenRequests.clear();
    this.requestOrder.length = 0;
  }

  private cancelCommand(
    transactionId: string,
    transaction: SelectionTransactionIdentity,
  ): SelectionCommand {
    return {
      requestId: requestId("sel"),
      selectionId: transaction.selectionId,
      selectionRevision: transaction.selectionRevision,
      selectionEpoch: transaction.selectionEpoch,
      controlId: transaction.controlId,
      phase: "cancel",
      transactionId,
    };
  }

  private settle(
    transactionId: string,
    transaction: SelectionTransactionIdentity,
  ): void {
    this.transactions.delete(transactionId);
    if (!this.settledTransactions.has(transactionId)) {
      this.settledOrder.push(transactionId);
    }
    this.settledTransactions.set(transactionId, transaction);
    if (this.settledOrder.length <= 128) return;
    this.settledTransactions.delete(this.settledOrder.shift()!);
  }

  private remember(commandRequestId: string): void {
    this.seenRequests.add(commandRequestId);
    this.requestOrder.push(commandRequestId);
    if (this.requestOrder.length <= 256) return;
    this.seenRequests.delete(this.requestOrder.shift()!);
  }
}
