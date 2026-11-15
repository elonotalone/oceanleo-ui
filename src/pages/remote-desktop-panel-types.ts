"use client";

import { type RemoteDesktopClient } from "../api/remote-desktop";

import { type RemoteConsent } from "../lib/local-agent-task";
import { type RemoteDesktopTicket } from "./remote-desktop-ticket";

import type { RemoteDesktopTransportDiagnostics, RemoteInputDiagnostics } from "../api/remote-desktop-diagnostics";
import type { RemoteMediaDiagnosticSnapshot, RemoteMediaStartupTimings } from "./remote-desktop-media";

export type PanelTimingStep = "effect" | "request" | "session" | "consented" | "active" | "stream" | "stream_failed" | "gateway" | "first_frame" | "frame_accepted" | "frame_ready_commit";
export type RemoteDesktopPanelTiming = { v: 1; kind: 5; at_ms: number; click_ms: number } & Partial<Record<`${PanelTimingStep}_ms`, number>>;
export type RemoteDesktopDiagnosticSample = RemoteDesktopTransportDiagnostics | RemoteMediaDiagnosticSnapshot | RemoteMediaStartupTimings
  | ({ v: 1; kind: 4; at_ms: number } & RemoteInputDiagnostics) | RemoteDesktopPanelTiming;

export interface RemoteDesktopPanelProps {
  deviceId: string;
  deviceName: string;
  client?: RemoteDesktopClient;
  onClose: () => void;
  /** Compatibility for an older HTTP-only target. New targets stream frames. */
  frameIntervalMs?: number;
  doubleClickWindowMs?: number;
  backpressureMs?: number;
  /**
   * The cloud assistant working on this computer (device-link protocol §13,
   * bridge doc §17.6): from the task the panel was opened from, or from the
   * computer's live session when opened from 我的设备 (C11 contract §4).
   * Banner and hand back only: the media and input paths are unchanged.
   */
  agent?: RemoteDesktopAgentBanner;
  /** True when this panel was opened as an agent takeover; those requests remain consent-gated. */
  agentRequest?: boolean;
  /**
   * What to expect while the request waits (C11 contract §2): `direct` = the
   * computer approves this owner's request without a dialog; `ask` = someone
   * at the computer must click 同意本次. Absent: today's wording.
   */
  consent?: RemoteConsent;
  /**
   * The person's explicit request to connect (`remoteDesktopTicket()` in a
   * click handler). The panel sends one session request per fresh ticket.
   * Spent or null (a reload, back/forward, a remount, a dev hot reload): it
   * shows 连接 and asks nothing of the computer until that click. Omitted:
   * the panel was mounted by a click and connects once for this mount.
   */
  ticket?: RemoteDesktopTicket | null;
  /** Optional selector-free profiling hook. Fixed numeric fields only; exceptions are swallowed. */
  onDiagnostics?(value: RemoteDesktopDiagnosticSample): void;
}

export interface RemoteDesktopAgentBanner {
  /** Chinese source sentence from `CLOUD_AGENT_COPY`, rendered through `tt`. */
  text: string;
  /** A second sentence, e.g. that the last hand back got no confirmed answer. */
  note?: string;
  /** Offer 交还给 AI (the AI is paused and the owner may resume it). */
  handBack: boolean;
  busy: boolean;
  /** One revision-fenced `resume`; the computer re-observes before acting. */
  handoffKey?: string;
  onHandBack: () => void | Promise<boolean | void>;
}

/** `idle`: no session requested; only a click on 连接 sends one. */
export type Phase = "idle" | "starting" | "waiting" | "connecting" | "reconnecting" | "active" | "closed" | "error" | "denied" | "timed_out" | "revoked" | "signed_out";
