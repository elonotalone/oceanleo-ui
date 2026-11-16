import type { AccessMember, AccessRole } from "../../src/shell/access/access-types";
import type { GeneralAccess, TaskAccess, TaskAccessClient } from "../../src/shell/access/task-access-client";

export const ownerAccess = (): TaskAccess => ({ role: "owner", state: "owner", general_access: "private", can_send: true, can_manage: true, can_fork: true, owner: { name: "Owner", initial: "O" } });

/** Typed contract fixture shared by component tests and the real AgentChat harness. */
export class TaskAccessMock implements TaskAccessClient {
  access: TaskAccess = ownerAccess();
  rows: AccessMember[] = [];
  authenticated = true;
  calls: Array<{ action: string; body?: unknown }> = [];
  fail: string | null = null;
  private check(action: string, body?: unknown) {
    this.calls.push({ action, body });
    if (this.fail === action) throw new Error("request failed");
  }
  async getAccess(_id: string, _signal?: AbortSignal) { this.check("getAccess"); return { ...this.access }; }
  async setAccess(_id: string, value: Exclude<GeneralAccess, "private">) { this.check("setAccess", value); this.access = { ...this.access, general_access: value }; return this.access; }
  async members(_id: string) { this.check("members"); return [...this.rows]; }
  async invite(_id: string, email: string, role: AccessRole): Promise<AccessMember> {
    this.check("invite", { email, role });
    const row: AccessMember = { id: `m${this.rows.length + 1}`, email, role, status: "invited" };
    this.rows.push(row); return row;
  }
  async changeRole(_id: string, id: string, role: AccessRole) { this.check("changeRole", { id, role }); this.rows = this.rows.map(row => row.id === id ? { ...row, role } : row); }
  async remove(_id: string, id: string) { this.check("remove", id); this.rows = this.rows.map(row => row.id === id ? { ...row, status: "removed" } : row); }
  async accept(_id: string) { this.check("accept"); this.access = { ...this.access, state: "member", role: this.access.invite_role ?? "view", can_send: this.access.invite_role === "collaborate", can_fork: true }; }
  async decline(_id: string) { this.check("decline"); this.access = { ...this.access, state: this.access.general_access === "public_view" ? "public" : "none", role: this.access.general_access === "public_view" ? "view" : "none", can_send: false }; }
  async fork(_id: string) { this.check("fork"); return { task_id: "forked-task" }; }
  async signedIn() { return this.authenticated; }
}
