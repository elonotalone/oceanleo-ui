import type { Model3DRouteSnapshot } from "./Model3DRouteHistory";

/** Saving changes the checkpoint representation, not the authored document.
 * Do not turn those receipt-only changes into an extra collaboration Undo step.
 */
export class Model3DCollabSnapshotPolicy {
  private document = "";
  private revision: string | number | null = null;
  private ready = false;
  private snapshot: Model3DRouteSnapshot | null = null;

  project(document: string, revision: string | number, ready: boolean, snapshot: Model3DRouteSnapshot): Model3DRouteSnapshot | null {
    const changedDocument = this.document !== document;
    if (changedDocument) {
      this.document = document;
      this.snapshot = null;
      this.revision = null;
      this.ready = false;
    }
    if (ready && (!this.ready || revision !== this.revision || !this.snapshot)) {
      this.snapshot = snapshot;
      this.revision = revision;
    }
    this.ready = ready;
    return ready ? this.snapshot : null;
  }

  acceptRemote(snapshot: Model3DRouteSnapshot, revision: string | number): void {
    this.snapshot = snapshot;
    this.revision = revision;
  }
}
