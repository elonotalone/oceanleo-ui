import type { ProjectAccess, ProjectAccessClient } from "../../src/shell/access/project-access-client";

export const ownerProjectAccess: ProjectAccess = {
  state: "owner", role: "owner", invite_role: null, project: { id: "p", name: "Project" },
};

/** A typed replacement for every route the Project member/invitation UI calls. */
export function createMockProjectAccessClient(overrides: Partial<ProjectAccessClient> = {}): ProjectAccessClient {
  return {
    async getAccess() { return ownerProjectAccess; },
    async getMembers() {
      return {
        owner: { name: "Owner", initial: "O" },
        members: [{ id: "invite:1", email: "pending@example.test", role: "view", status: "invited" }],
      };
    },
    async invite(_id, email, role = "view") { return { id: "invite:new", email, role, status: "invited" }; },
    async changeRole() {},
    async remove() {},
    async accept() {},
    async decline() {},
    ...overrides,
  };
}
