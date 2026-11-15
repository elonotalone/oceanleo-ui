"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { type RemoteDesktopAccess, type RemoteDesktopAction, type RemoteDesktopBilling, type RemoteDesktopClient, type RemoteDesktopDataLane, type RemoteDesktopFrameData, type RemoteDesktopStream, type RemoteMediaStatus } from "../api/remote-desktop";

import { type RemoteEarlyMedia } from "./RemoteDesktopVideo";

import { remoteDesktopTicket, type RemoteDesktopTicket } from "./remote-desktop-ticket";
import { RemoteDesktopMeasurements, type RemotePictureMeasurements } from "../api/remote-desktop-measure";
import { RemoteDesktopQualityHub } from "../api/remote-desktop-quality";

import type { Phase, PanelTimingStep, RemoteDesktopAgentBanner, RemoteDesktopDiagnosticSample } from "./remote-desktop-panel-types";

export interface RemoteDesktopViewState {
  ticket: RemoteDesktopTicket | null;
  phase: Phase;
  frame: RemoteDesktopFrameData | null;
  message: string;
  handingBack: boolean;
  handoffFrozen: boolean;
  handoffDone: boolean;
  toolbar: boolean;
  measuring: boolean;
  pictureMeasurements: RemotePictureMeasurements;
  clockUncertainty: number | undefined;
  coarse: boolean;
  keyboard: boolean;
  mediaMode: "legacy" | "artc";
  mediaStatus: RemoteMediaStatus | null;
  displayId: string | undefined;
  access: RemoteDesktopAccess | null;
  billing: RemoteDesktopBilling | null;
  mediaDiagnostic: { blocked_host?: string; sdk_error?: number } | null;
  mediaNotice: string;
  mediaReady: boolean;
  reconnecting: boolean;
  reconnectDeadline: number | null;
  idleDeadline: number | null;
  clockNow: number;
  connectTiming: string;
  dock: { edge: "left" | "right" | "top" | "bottom"; offset: number };
  fullscreen: boolean;
}
/** One authoritative snapshot. Event handlers read it directly; React subscribes to the same value. */
export class RemoteDesktopPanelModel {
  private listeners = new Set<() => void>();
  constructor(private value: RemoteDesktopViewState) {}
  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  set<K extends keyof RemoteDesktopViewState>(key: K, value: RemoteDesktopViewState[K] | ((previous: RemoteDesktopViewState[K]) => RemoteDesktopViewState[K])): void {
    const next = typeof value === "function" ? (value as (previous: RemoteDesktopViewState[K]) => RemoteDesktopViewState[K])(this.value[key]) : value;
    if (Object.is(this.value[key], next)) return;
    this.value = { ...this.value, [key]: next };
    for (const listener of this.listeners) listener();
  }
}
export function useRemoteDesktopPanelContext(requested: RemoteDesktopTicket | null | undefined, baseClient: RemoteDesktopClient, agent: RemoteDesktopAgentBanner | undefined, onDiagnostics?: (value: RemoteDesktopDiagnosticSample) => void) {
  const [model] = useState(() => new RemoteDesktopPanelModel({
    ticket: requested === undefined ? remoteDesktopTicket() : requested,
    phase: requested === null || requested?.spent ? "idle" : "starting",
    frame: null,
    message: "",
    handingBack: false,
    handoffFrozen: false,
    handoffDone: false,
    toolbar: false,
    measuring: typeof window !== "undefined" && new URLSearchParams(window.location.search).get("rd_measure") === "1",
    pictureMeasurements: {},
    clockUncertainty: undefined,
    coarse: false,
    keyboard: false,
    mediaMode: "legacy",
    mediaStatus: null,
    displayId: undefined,
    access: null,
    billing: null,
    mediaDiagnostic: null,
    mediaNotice: "",
    mediaReady: false,
    reconnecting: false,
    reconnectDeadline: null,
    idleDeadline: null,
    clockNow: Date.now(),
    connectTiming: "",
    dock: { edge: "right", offset: .5 },
    fullscreen: false,
  }));
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const setters = useMemo(() => ({
    setTicket: (value: RemoteDesktopTicket | null | ((previous: RemoteDesktopTicket | null) => RemoteDesktopTicket | null)) => model.set("ticket", value),
    setPhase: (value: Phase | ((previous: Phase) => Phase)) => model.set("phase", value),
    setFrame: (value: RemoteDesktopFrameData | null | ((previous: RemoteDesktopFrameData | null) => RemoteDesktopFrameData | null)) => model.set("frame", value),
    setMessage: (value: string | ((previous: string) => string)) => model.set("message", value),
    setHandingBack: (value: boolean | ((previous: boolean) => boolean)) => model.set("handingBack", value),
    setHandoffFrozen: (value: boolean | ((previous: boolean) => boolean)) => model.set("handoffFrozen", value),
    setHandoffDone: (value: boolean | ((previous: boolean) => boolean)) => model.set("handoffDone", value),
    setToolbar: (value: boolean | ((previous: boolean) => boolean)) => model.set("toolbar", value),
    setMeasuring: (value: boolean | ((previous: boolean) => boolean)) => model.set("measuring", value),
    setPictureMeasurements: (value: RemotePictureMeasurements | ((previous: RemotePictureMeasurements) => RemotePictureMeasurements)) => model.set("pictureMeasurements", value),
    setClockUncertainty: (value: number | undefined | ((previous: number | undefined) => number | undefined)) => model.set("clockUncertainty", value),
    setCoarse: (value: boolean | ((previous: boolean) => boolean)) => model.set("coarse", value),
    setKeyboard: (value: boolean | ((previous: boolean) => boolean)) => model.set("keyboard", value),
    setMediaMode: (value: "legacy" | "artc" | ((previous: "legacy" | "artc") => "legacy" | "artc")) => model.set("mediaMode", value),
    setMediaStatus: (value: RemoteMediaStatus | null | ((previous: RemoteMediaStatus | null) => RemoteMediaStatus | null)) => model.set("mediaStatus", value),
    setDisplayId: (value: string | undefined | ((previous: string | undefined) => string | undefined)) => model.set("displayId", value),
    setAccess: (value: RemoteDesktopAccess | null | ((previous: RemoteDesktopAccess | null) => RemoteDesktopAccess | null)) => model.set("access", value),
    setBilling: (value: RemoteDesktopBilling | null | ((previous: RemoteDesktopBilling | null) => RemoteDesktopBilling | null)) => model.set("billing", value),
    setMediaDiagnostic: (value: { blocked_host?: string; sdk_error?: number } | null | ((previous: { blocked_host?: string; sdk_error?: number } | null) => { blocked_host?: string; sdk_error?: number } | null)) => model.set("mediaDiagnostic", value),
    setMediaNotice: (value: string | ((previous: string) => string)) => model.set("mediaNotice", value),
    setMediaReady: (value: boolean | ((previous: boolean) => boolean)) => model.set("mediaReady", value),
    setReconnecting: (value: boolean | ((previous: boolean) => boolean)) => model.set("reconnecting", value),
    setReconnectDeadline: (value: number | null | ((previous: number | null) => number | null)) => model.set("reconnectDeadline", value),
    setIdleDeadline: (value: number | null | ((previous: number | null) => number | null)) => model.set("idleDeadline", value),
    setClockNow: (value: number | ((previous: number) => number)) => model.set("clockNow", value),
    setConnectTiming: (value: string | ((previous: string) => string)) => model.set("connectTiming", value),
    setDock: (value: { edge: "left" | "right" | "top" | "bottom"; offset: number } | ((previous: { edge: "left" | "right" | "top" | "bottom"; offset: number }) => { edge: "left" | "right" | "top" | "bottom"; offset: number })) => model.set("dock", value),
    setFullscreen: (value: boolean | ((previous: boolean) => boolean)) => model.set("fullscreen", value),
  }), [model]);
  const qualityRef = useRef<RemoteDesktopQualityHub | null>(null);
  const sessionRef = useRef<string | null>(null);
  const diagnosticsRef = useRef(onDiagnostics); diagnosticsRef.current = onDiagnostics;
  const earlyMediaRef = useRef<RemoteEarlyMedia | null>(null);
  const sessionClientRef = useRef<RemoteDesktopClient>(baseClient);
  const completedHandoff = useRef<{key?: string; callback: RemoteDesktopAgentBanner["onHandBack"]} | null>(null);
  const handoffRef = useRef<object | null>(null);
  const agentRef = useRef(agent); agentRef.current = agent;
  const measurements = useRef<RemoteDesktopMeasurements | null>(null);
  const mediaFrameGeometry = useRef<string | null>(null);
  const laneRef = useRef<RemoteDesktopDataLane | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<RemoteDesktopStream | null>(null);
  const streamModeRef = useRef(false);
  const closedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const previousCloseRef = useRef<Promise<unknown>>(Promise.resolve());
  const reconnectAttempts = useRef(0);
  const reconnectTicket = useRef<RemoteDesktopTicket | null>(null);
  const recoveryWindow = useRef(180_000);
  const markRef = useRef<((name: PanelTimingStep) => void) | null>(null);
  const queueRef = useRef<RemoteDesktopAction[]>([]);
  const pumpingRef = useRef<AbortSignal | null>(null);
  const sequenceRef = useRef(0);
  const heldKeys = useRef(new Map<string, string>());
  const pointerRef = useRef<{ id: number; pointerType: string; x: number; y: number; button: "left" | "right" | "middle"; buttons: Set<"left" | "right" | "middle"> } | null>(null);
  const pendingClick = useRef<{ x: number; y: number } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const inputEpoch = useRef(0);
  const moveRef = useRef<RemoteDesktopAction | null>(null);
  const moveTimer = useRef<ReturnType<typeof setTimeout> | number | null>(null);
  const toolbarRoot = useRef<HTMLDivElement>(null);
  const toolbarPanel = useRef<HTMLDivElement>(null);
  const positionKey = useRef<string | null>(null);
  const dragging = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const ignoreHandleClick = useRef(false);
  const inputCleanup = useRef<(() => void) | null>(null);
  const clearLocalInput = useCallback(() => inputCleanup.current?.(), []);
  const releaseInput = useCallback(() => { clearLocalInput(); if (streamModeRef.current) streamRef.current?.send({ kind: "release_all" }); }, [clearLocalInput]);
  const updatePhase = useCallback((value: Phase) => {
    if (value !== "active") { if (clickTimer.current) clearTimeout(clickTimer.current); clickTimer.current = null; pendingClick.current = null; }
    model.set("phase", value);
  }, [model]);
  const canSend = useCallback(() => !handoffRef.current && !closedRef.current && !model.getSnapshot().reconnecting && !(model.getSnapshot().access?.input_allowed === false) && model.getSnapshot().phase === "active" && Boolean(model.getSnapshot().frame)
    && (model.getSnapshot().mediaMode !== "artc" || Boolean(model.getSnapshot().mediaReady)), [model]);

  const acceptMediaStatus = useCallback((value: RemoteMediaStatus | null) => model.set("mediaStatus", value), [model]);
  return { ...snapshot, ...setters, model, canSend, clearLocalInput, releaseInput, updatePhase, acceptMediaStatus, inputCleanup,
    qualityRef, sessionRef, diagnosticsRef, earlyMediaRef, sessionClientRef, completedHandoff, handoffRef, agentRef, measurements, mediaFrameGeometry, laneRef, videoRef, stageRef, imageRef, inputRef, streamRef, streamModeRef, closedRef, abortRef, previousCloseRef, reconnectAttempts, reconnectTicket, recoveryWindow, markRef, queueRef, pumpingRef, sequenceRef, heldKeys, pointerRef, pendingClick, clickTimer, composing, inputEpoch, moveRef, moveTimer, toolbarRoot, toolbarPanel, positionKey, dragging, ignoreHandleClick };
}
export type RemoteDesktopPanelContext = ReturnType<typeof useRemoteDesktopPanelContext>;
