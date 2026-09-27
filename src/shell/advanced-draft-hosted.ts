import type { AdvancedDraftCapture } from "./advanced-editor-adapter";
import type { AdvancedEditRevision } from "./advanced-persistence-controller";

/** The route validates frame origin, instance, request id and revision before
 * calling accept. Waiting for that receipt never promotes a stale cache. */
export class AdvancedHostedDraftChannel {
  private sequence = 0;
  private captures = new Set<{ revision: AdvancedEditRevision; finish: (value: AdvancedDraftCapture | null) => void }>();
  private restores = new Map<string, (revision: AdvancedEditRevision | null) => void>();

  capture(revision: AdvancedEditRevision, request: () => boolean): Promise<AdvancedDraftCapture | null> {
    return new Promise(resolve => {
      const entry = { revision, finish: (value: AdvancedDraftCapture | null) => { clearTimeout(timer); this.captures.delete(entry); resolve(value); } };
      const timer = setTimeout(() => entry.finish(null), 8_000);
      this.captures.add(entry);
      if (!request()) entry.finish(null);
    });
  }
  accept(revision: AdvancedEditRevision, payload: unknown): void {
    for (const entry of this.captures) if (Object.is(entry.revision, revision)) entry.finish({ revision, payload });
  }
  advance(revision: AdvancedEditRevision): void {
    for (const entry of this.captures) if (!Object.is(entry.revision, revision)) entry.finish(null);
  }
  restore(payload: unknown, revision: AdvancedEditRevision, send: (message: Record<string, unknown>) => boolean): Promise<AdvancedEditRevision | null> {
    const recoveryId = `server-draft-restore-${++this.sequence}`;
    return new Promise(resolve => {
      const finish = (value: AdvancedEditRevision | null) => { clearTimeout(timer); this.restores.delete(recoveryId); resolve(value); };
      const timer = setTimeout(() => finish(null), 8_000);
      this.restores.set(recoveryId, finish);
      if (!send({ type: "recovery-restore", recoveryId, snapshot: { revision, payload } })) finish(null);
    });
  }
  acceptRestore(message: { type: string; recoveryId?: string; ok?: boolean; revision?: AdvancedEditRevision }): boolean {
    if (message.type !== "recovery-result" || !message.recoveryId) return false;
    const finish = this.restores.get(message.recoveryId);
    if (!finish) return false;
    finish(message.ok && message.revision !== undefined ? message.revision : null);
    return true;
  }
  dispose(): void {
    for (const entry of this.captures) entry.finish(null);
    for (const finish of this.restores.values()) finish(null);
  }
}
