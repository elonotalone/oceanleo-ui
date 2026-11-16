/** Roles shared by task and Project member controls. Project's stored `edit` maps to `collaborate`. */
export type AccessRole = "view" | "collaborate";

export interface AccessMember {
  id: string;
  user_id?: string | null;
  name?: string | null;
  initial?: string | null;
  email?: string;
  role: AccessRole | "owner";
  status: "accepted" | "invited" | "removed" | "declined";
}

export interface AccessOwner {
  name: string;
  initial: string;
  email?: string;
}
