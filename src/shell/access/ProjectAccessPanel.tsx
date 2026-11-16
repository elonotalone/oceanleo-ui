"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { MemberPanel } from "./MemberPanel";
import {
  projectAccessClient,
  ProjectAccessError,
  type ProjectAccess,
  type ProjectAccessClient,
  type ProjectMembers,
} from "./project-access-client";

export interface ProjectAccessPanelProps {
  projectId: string;
  client?: ProjectAccessClient;
  onAccessChange?: (access: ProjectAccess) => void;
}

/** The same member body as Task Share, deliberately without public access. */
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
        // Only owners manage/invite; accepted collaborators cannot invite.
        if (access.state !== "owner") { setState({ access, members: { owner: { name: "", initial: "?" }, members: [] } }); return; }
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
  if (state.access.state !== "owner") return <p className="p-4 text-sm text-[var(--muted)]">{tt("仅查看")}</p>;
  return <div data-project-access-panel>
    <MemberPanel
      owner={state.members.owner}
      members={state.members.members}
      canManage
      onInvite={(email, role) => client.invite(projectId, email, role)}
      onChangeRole={(id, role) => client.changeRole(projectId, id, role)}
      onRemove={id => client.remove(projectId, id)}
    />
  </div>;
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
        className="min-h-10 flex-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] disabled:opacity-50">{tt("拒绝")}</button>
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

  if (!signedIn) return <button type="button" onClick={onSignIn} className="m-4 rounded-lg border border-[var(--border)] px-4 py-2 text-[var(--fg)]">{tt("登录")}</button>;
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
    <p className="text-sm text-[var(--muted)]">{tt(access.invite_role === "collaborate" ? "协作" : "仅查看")}</p>
    <ProjectInvitationActions
      projectId={projectId} signedIn={signedIn} onSignIn={onSignIn} client={client}
      onAccepted={() => { callbacks.current.onMembershipChange?.(); setVersion(value => value + 1); }}
      onDeclined={() => { setSnapshot(null); callbacks.current.onMembershipChange?.(); callbacks.current.onDeclined?.(); setVersion(value => value + 1); }}
    />
  </section>;
}
