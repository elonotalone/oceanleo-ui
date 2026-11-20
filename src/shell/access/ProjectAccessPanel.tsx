"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { MenuSelect } from "../menu-select";
import { SHARE_ACCESS_COPY_SOURCE as copy } from "../../i18n/ui/messages/share-access-copy-source";
import {
  projectAccessClient,
  ProjectAccessError,
  type ProjectAccess,
  type ProjectAccessClient,
  type ProjectMembers,
  type ProjectAccessRole,
} from "./project-access-client";

const managesProject = (access: ProjectAccess) => access.state === "owner" || (access.state === "member" && access.role === "admin");

export interface ProjectAccessPanelProps {
  projectId: string;
  client?: ProjectAccessClient;
  onAccessChange?: (access: ProjectAccess) => void;
}

/** Project management roles are independent of task collaboration access. */
export function ProjectAccessPanel({ projectId, client = projectAccessClient, onAccessChange }: ProjectAccessPanelProps) {
  const tt = useUI();
  const [state, setState] = useState<{ access: ProjectAccess; members: ProjectMembers } | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const onAccessRef = useRef(onAccessChange);
  onAccessRef.current = onAccessChange;
  useEffect(() => {
    const controller = new AbortController();
    setState(null);
    setError(false);
    void (async () => {
      try {
        const access = await client.getAccess(projectId, controller.signal);
        if (controller.signal.aborted) return;
        onAccessRef.current?.(access);
        // Members keep work access; owner/admin manage membership.
        if (!managesProject(access)) { setState({ access, members: { owner: { name: "", initial: "?" }, members: [] } }); return; }
        const members = await client.getMembers(projectId, controller.signal);
        if (!controller.signal.aborted) setState({ access, members });
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [projectId, client, version]);

  if (error) return <div role="alert" className="p-4 text-sm text-[var(--fg)]">
    <p>{tt("无法读取访问权限，请重试。")}</p>
    <button type="button" className="mt-2 underline" onClick={() => setVersion(value => value + 1)}>{tt("重试")}</button>
  </div>;
  if (!state) return <div role="status" aria-busy="true" className="p-4"><span className="v-spinner" aria-hidden="true" /><span className="sr-only">{tt("分享")}</span></div>;
  if (!managesProject(state.access)) return <p className="p-4 text-sm text-[var(--muted)]">{tt("仅查看")}</p>;
  return <ProjectMemberControls key={`${projectId}:${version}`} projectId={projectId} members={state.members} client={client} onSaved={() => setVersion(value => value + 1)} />;
}

function ProjectMemberControls({ projectId, members, client, onSaved }: {
  projectId: string; members: ProjectMembers; client: ProjectAccessClient; onSaved: () => void;
}) {
  const tt = useUI();
  const [contact, setContact] = useState("");
  const [role, setRole] = useState<ProjectAccessRole>("collaborate");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [failed, setFailed] = useState(false);
  const roleLabel = (value: ProjectAccessRole) => tt(value === "admin" ? "项目管理员" : value === "collaborate" ? "项目成员" : "项目查看者");
  const options = (["admin", "collaborate", "view"] as const).map(value => ({ value, label: roleLabel(value) }));
  const mutate = async (action: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setFailed(false);
    try { await action(); onSaved(); }
    catch { setFailed(true); }
    finally { busy.current = false; setSaving(false); }
  };
  return <section data-project-access-panel className="min-w-0 p-4" aria-busy={saving}>
    <form className="mb-3 flex flex-wrap gap-2" onSubmit={(event) => {
      event.preventDefault();
      if (contact.trim()) void mutate(() => client.invite(projectId, contact.trim(), role));
    }}>
      <input value={contact} onChange={(event) => setContact(event.target.value)} disabled={saving} required
        aria-label={tt(copy.email)} placeholder={tt(copy.email)} type="email"
        className="min-h-10 min-w-0 flex-1 rounded-lg border border-neutral-200/80 bg-transparent px-3 text-sm" />
      <MenuSelect name="project-invite-role" ariaLabel={tt("权限")} value={role} options={options} disabled={saving}
        onChange={(value) => setRole(value as ProjectAccessRole)} />
      <button type="submit" disabled={saving || !contact.trim()} className="min-h-10 rounded-lg bg-[var(--fg)] px-4 text-sm text-[var(--bg)] disabled:opacity-50">{tt(copy.invite)}</button>
    </form>
    {failed && <p role="alert" className="mb-2 text-sm text-rose-600">{tt(copy.saveFailed)}</p>}
    <ul className="space-y-2">
      <li data-member-owner className="flex min-w-0 items-center gap-3">
        <span className="min-w-0 flex-1 truncate">{members.owner.name}</span><span className="text-xs text-[var(--muted)]">{tt(copy.owner)}</span>
      </li>
      {members.members.filter(member => member.role !== "owner").map(member => {
        const name = member.name || member.email || tt(copy.sender);
        return <li key={member.id} data-member-id={member.id} className="flex min-w-0 flex-wrap items-center gap-2">
          {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            : <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-neutral-100 text-sm">{member.initial || "?"}</span>}
          <span className="min-w-0 flex-1"><span className="block truncate text-sm">{name}</span>
            {member.status === "invited" && <span className="block text-xs text-[var(--muted)]">{tt(copy.invited)}</span>}
          </span>
          <MenuSelect name={`project-role-${member.id}`} ariaLabel={tt(copy.memberRole, { name })}
            value={member.role} options={options} disabled={saving}
            onChange={(value) => void mutate(() => client.changeRole(projectId, member.id, value as ProjectAccessRole))} />
          <button type="button" disabled={saving} aria-label={tt(copy.removeMember, { name })}
            className="min-h-10 rounded-lg px-2 text-sm text-[var(--muted)] disabled:opacity-50"
            onClick={() => void mutate(() => client.remove(projectId, member.id))}>{tt(copy.remove)}</button>
        </li>;
      })}
    </ul>
  </section>;
}

export interface ProjectInvitationActionsProps {
  projectId: string;
  signedIn: boolean;
  onSignIn: () => void;
  onAccepted: () => void;
  onDeclined?: () => void;
  client?: ProjectAccessClient;
}

/** Place on the project page for an invited account; both responses reach the API. */
export function ProjectInvitationActions({
  projectId, signedIn, onSignIn, onAccepted, onDeclined, client = projectAccessClient,
}: ProjectInvitationActionsProps) {
  const tt = useUI();
  const [pending, setPending] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const busy = useRef(false);
  useEffect(() => { generation.current += 1; busy.current = false; setPending(null); setError(false); return () => { generation.current += 1; }; }, [projectId]);
  const respond = async (action: "accept" | "decline") => {
    if (!signedIn) { onSignIn(); return; }
    if (busy.current) return;
    busy.current = true;
    setPending(action);
    setError(false);
    const current = generation.current;
    try {
      await client[action](projectId);
      if (current !== generation.current) return;
      if (action === "accept") onAccepted();
      else onDeclined?.();
    } catch (error) {
      if (current !== generation.current) return;
      if (error instanceof ProjectAccessError && error.status === 401) onSignIn();
      else setError(true);
    } finally {
      if (current === generation.current) { busy.current = false; setPending(null); }
    }
  };
  return <div data-project-invitation-actions className="space-y-2">
    <div className="flex flex-wrap gap-2" aria-busy={pending !== null}>
      <button type="button" disabled={pending !== null} onClick={() => void respond("accept")}
        className="min-h-10 flex-1 rounded-lg bg-[var(--fg)] px-4 py-2 text-sm font-medium text-[var(--bg)] disabled:opacity-50">{tt("接受邀请")}</button>
      <button type="button" disabled={pending !== null} onClick={() => void respond("decline")}
        className="min-h-10 flex-1 rounded-lg border border-neutral-200/80 dark:border-white/10 px-4 py-2 text-sm text-[var(--fg)] disabled:opacity-50">{tt("拒绝")}</button>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--fg)]">{tt("未能保存更改，请重试。")}</p>}
  </div>;
}

export interface ProjectAccessBoundaryProps {
  projectId: string;
  signedIn: boolean;
  onSignIn: () => void;
  onDeclined?: () => void;
  /** The host clears project/sidebar caches and closes configuration panels. */
  onAccessLost?: () => void;
  onMembershipChange?: () => void;
  client?: ProjectAccessClient;
  children: ReactNode;
}

/**
 * Resolve before mounting project configuration. Access loss unmounts the entire
 * project subtree; a retained personal task must be opened through its own URL.
 */
export function ProjectAccessBoundary({
  projectId, signedIn, onSignIn, onDeclined, onAccessLost, onMembershipChange,
  client = projectAccessClient, children,
}: ProjectAccessBoundaryProps) {
  const tt = useUI();
  const [snapshot, setSnapshot] = useState<{ id: string; access: ProjectAccess } | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const callbacks = useRef({ onSignIn, onAccessLost, onDeclined, onMembershipChange });
  callbacks.current = { onSignIn, onAccessLost, onDeclined, onMembershipChange };
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    let hadAccess = false;
    setSnapshot(null);
    setError(false);
    if (!signedIn) return () => controller.abort();
    const refresh = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try {
        const access = await client.getAccess(projectId, controller.signal);
        if (controller.signal.aborted) return;
        const accepted = access.state === "owner" || access.state === "member";
        if (hadAccess && !accepted) callbacks.current.onAccessLost?.();
        hadAccess = accepted;
        setError(false);
        setSnapshot({ id: projectId, access });
      } catch (error) {
        if (controller.signal.aborted) return;
        // A failed access refresh never leaves configuration mounted.
        setSnapshot(null);
        setError(true);
        if (error instanceof ProjectAccessError && error.status === 404 && hadAccess) {
          hadAccess = false;
          callbacks.current.onAccessLost?.();
        }
        if (error instanceof ProjectAccessError && error.status === 401) callbacks.current.onSignIn();
      } finally { inFlight = false; }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, [projectId, signedIn, client, version]);

  if (!signedIn) return <button type="button" onClick={onSignIn} className="m-4 rounded-lg border border-neutral-200/80 dark:border-white/10 px-4 py-2 text-[var(--fg)]">{tt("登录")}</button>;
  if (error) return <div role="alert" className="p-4 text-sm text-[var(--fg)]">
    <p>{tt("无法读取访问权限，请重试。")}</p>
    <button type="button" onClick={() => setVersion(value => value + 1)} className="mt-2 underline">{tt("重试")}</button>
  </div>;
  const access = snapshot?.id === projectId ? snapshot.access : null;
  if (!access) return <div role="status" aria-busy="true" className="p-4"><span className="v-spinner" aria-hidden="true" /><span className="sr-only">{tt("分享")}</span></div>;
  // A role downgrade remounts host configuration/task controls with fresh rights.
  if (access.state === "owner" || access.state === "member") return <Fragment key={`${projectId}:${access.role}`}>{children}</Fragment>;
  if (access.state !== "invited") return <p className="p-4 text-[var(--fg)]">{tt("无法打开项目")}</p>;
  return <section data-project-invitation className="mx-auto w-full max-w-md space-y-4 p-6 text-[var(--fg)]">
    <h1 className="text-lg font-semibold">{access.project.name}</h1>
    <p className="text-sm text-[var(--muted)]">{tt(access.invite_role === "admin" ? "项目管理员" : access.invite_role === "collaborate" ? "项目成员" : "项目查看者")}</p>
    <ProjectInvitationActions
      projectId={projectId} signedIn={signedIn} onSignIn={onSignIn} client={client}
      onAccepted={() => { callbacks.current.onMembershipChange?.(); setVersion(value => value + 1); }}
      onDeclined={() => { setSnapshot(null); callbacks.current.onMembershipChange?.(); callbacks.current.onDeclined?.(); setVersion(value => value + 1); }}
    />
  </section>;
}
