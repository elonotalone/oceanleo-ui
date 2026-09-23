"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  cloudComputerApi,
  type CloudComputerClient,
  type Computer,
  type NodeInfo,
} from "../../../lib/cloud-computer-api";
import { currentDomainFamily } from "../../../contracts/domain-family";
import { useUI } from "../../../i18n/ui/useUI";
import { ConfirmDialog } from "../../../ui";
import { AcpCard } from "../agent-dialog/AcpCard";
import {
  computerDisplayState,
  isConnectedComputer,
  type ComputerDisplayState,
} from "../computer-state";
import { CliCard } from "../terminal-card/CliCard";
import { TerminalCard } from "../terminal-card/TerminalCard";
import { useCloudComputers } from "../useCloudComputers";
import {
  serverPageHref,
  type ServerPageCard,
} from "./href";
import {
  IconBack,
  IconChat,
  IconCli,
  IconTerminal,
} from "./chrome-icons";
import { tone } from "./tone";

const CARD_ORDER: readonly ServerPageCard[] = ["acp", "cli", "terminal"];

const CARD_COPY: Record<
  ServerPageCard,
  { title: string; description: string }
> = {
  acp: {
    title: "AI 对话",
    description: "聊天代理",
  },
  cli: {
    title: "AI 命令行",
    description: "原版 AI 命令行",
  },
  terminal: {
    title: "终端",
    description: "Shell 终端",
  },
};

function CardGlyph({ card }: { card: ServerPageCard }) {
  if (card === "acp") return <IconChat />;
  if (card === "cli") return <IconCli />;
  return <IconTerminal />;
}

type UpgradeState = "idle" | "running" | "complete" | "failed";
type StartState = "idle" | "running" | "requested" | "failed";

export type ServerPageProps = {
  computerId: string;
  client?: CloudComputerClient;
  computers?: Computer[];
  upgradePollIntervalMs?: number;
  upgradePollAttempts?: number;
};

function cardFromQuery(value: string | null): ServerPageCard | undefined {
  return CARD_ORDER.find((card) => card === value);
}

function statusWord(
  state: ComputerDisplayState,
  tt: (zh: string, values?: Record<string, string | number>) => string,
): string {
  if (state === "ready") return tt("在线");
  if (state === "offline") return tt("离线");
  if (state === "stopped") return tt("已停机");
  if (state === "unpaid") return tt("欠费");
  return tt("未接入");
}

function statusDotTone(state: ComputerDisplayState): string {
  if (state === "ready") return "bg-emerald-500";
  if (state === "offline") return "bg-amber-500";
  if (state === "stopped" || state === "unpaid") return "bg-rose-500";
  return "bg-zinc-400 dark:bg-neutral-600";
}

function unavailableReason(
  state: ComputerDisplayState,
  tt: (zh: string, values?: Record<string, string | number>) => string,
): string {
  if (state === "offline") {
    return tt("这台服务器离线，等它重新上线后就能继续。");
  }
  if (state === "stopped") {
    return tt("这台服务器已停机，开机后就能继续。");
  }
  if (state === "unpaid") {
    return tt("这台服务器因欠费暂停使用，请先充值。");
  }
  return tt("这台服务器还没有接入，请到我的设备完成接入。");
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForNodeUpgrade(
  client: CloudComputerClient,
  computerId: string,
  previousVersion: string | null,
  attempts: number,
  intervalMs: number,
): Promise<NodeInfo> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const info = await client.getNodeInfo(computerId);
      if (
        info.online &&
        Boolean(info.version) &&
        info.version !== previousVersion
      ) {
        return info;
      }
    } catch {
      // 节点重启的短窗口里网关可能暂时读不到它；继续等，不把令牌或原始异常显示给用户。
    }
    if (attempt + 1 < attempts) await delay(intervalMs);
  }
  throw new Error("node_upgrade_timeout");
}

export function ServerPage(props: ServerPageProps) {
  const router = useRouter();
  const hidden = currentDomainFamily() === "cn";

  useEffect(() => {
    if (hidden) router.replace("/");
  }, [hidden, router]);

  if (hidden) return null;
  return <ServerPageContent {...props} />;
}

function ServerPageContent({
  computerId,
  client = cloudComputerApi,
  computers: computersProp,
  upgradePollIntervalMs = 2_000,
  upgradePollAttempts = 60,
}: ServerPageProps) {
  const tt = useUI();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    computers,
    loading,
    refresh,
    setMountedId,
  } = useCloudComputers({ client, computers: computersProp });
  const computer = useMemo(
    () => computers.find((item) => item.id === computerId) ?? null,
    [computerId, computers],
  );
  const connected = useMemo(
    () => computers.filter(isConnectedComputer),
    [computers],
  );
  const card = cardFromQuery(searchParams.get("card"));
  const initialProgram = searchParams.get("program") || undefined;
  const initialSessionId = searchParams.get("session") || undefined;
  const state = computer ? computerDisplayState(computer) : null;
  const available = state === "ready";
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [upgradeState, setUpgradeState] = useState<UpgradeState>("idle");
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);
  const [startState, setStartState] = useState<StartState>("idle");

  useEffect(() => {
    if (!computer || !isConnectedComputer(computer)) return;
    setMountedId(computer.id);
  }, [computer, setMountedId]);

  useEffect(() => {
    setUpgradeState("idle");
    setStartState("idle");
  }, [computerId]);

  useEffect(() => {
    if (!computer || !isConnectedComputer(computer)) {
      setNodeInfo(null);
      return;
    }
    let active = true;
    void client
      .getNodeInfo(computer.id)
      .then((info) => {
        if (active) setNodeInfo(info);
      })
      .catch(() => {
        if (active) setNodeInfo(null);
      });
    return () => {
      active = false;
    };
  }, [client, computer]);

  const openCard = useCallback(
    (next: ServerPageCard, replace = false) => {
      if (!computer || !available) return;
      const href = serverPageHref(computer.id, { card: next });
      if (replace) router.replace(href);
      else router.push(href);
    },
    [available, computer, router],
  );

  const start = useCallback(async () => {
    if (!computer || state !== "stopped" || computer.source !== "aliyun") {
      return;
    }
    setStartState("running");
    try {
      await client.startComputer(computer.id);
      setStartState("requested");
      await refresh();
    } catch {
      setStartState("failed");
    }
  }, [client, computer, refresh, state]);

  const upgrade = useCallback(async () => {
    if (!computer || !nodeInfo?.update_available || upgradeState === "running") {
      return;
    }
    setConfirmUpgrade(false);
    setUpgradeState("running");
    const previousVersion = nodeInfo.version;
    try {
      const request = await client.upgradeNode(computer.id);
      const next = await waitForNodeUpgrade(
        client,
        computer.id,
        request.from ?? previousVersion,
        upgradePollAttempts,
        upgradePollIntervalMs,
      );
      setNodeInfo(next);
      setUpgradeState("complete");
      await refresh();
    } catch {
      setUpgradeState("failed");
    }
  }, [
    client,
    computer,
    nodeInfo,
    refresh,
    tt,
    upgradePollAttempts,
    upgradePollIntervalMs,
    upgradeState,
  ]);

  if (loading) {
    return (
      <main
        className={`grid min-h-screen place-items-center p-6 ${tone.page}`}
        data-oceanleo-server-page-loading
      >
        <p className={tone.muted}>{tt("正在读取服务器…")}</p>
      </main>
    );
  }

  if (!computer || !state) {
    return (
      <main
        className={`grid min-h-screen place-items-center p-6 ${tone.page}`}
        data-oceanleo-server-page-missing
      >
        <div className="max-w-lg text-center">
          <p>{tt("找不到这台服务器，或它还没有接入。")}</p>
          <a
            href="/"
            className={`mt-4 inline-flex rounded-lg px-3 py-2 text-sm ${tone.primary}`}
          >
            {tt("返回首页")}
          </a>
        </div>
      </main>
    );
  }

  const showUpgrade = nodeInfo?.update_available || upgradeState !== "idle";

  return (
    <main
      className={`min-h-screen px-4 py-3 sm:px-6 lg:px-8 ${tone.page}`}
      data-oceanleo-server-page={computer.id}
      data-oceanleo-server-state={state}
    >
      <div className="mx-auto flex min-h-[calc(100vh-1.5rem)] max-w-[96rem] flex-col">
        <header
          className={`flex h-12 items-center gap-2 border-b ${tone.border}`}
        >
          <a
            href="/"
            aria-label={tt("返回首页")}
            title={tt("返回首页")}
            className={tone.iconBtn}
          >
            <IconBack />
          </a>
          <h1 className="min-w-0 truncate text-sm font-medium">
            {computer.name}
          </h1>
          <span
            className="inline-flex items-center"
            data-oceanleo-server-status={state}
            title={statusWord(state, tt)}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${statusDotTone(state)}`}
            />
            <span className="sr-only">{statusWord(state, tt)}</span>
          </span>
          <div className="min-w-0 flex-1" />
          {showUpgrade ? (
            <div
              className={`flex shrink-0 items-center gap-2 text-xs ${
                upgradeState === "failed"
                  ? "text-rose-700 dark:text-rose-300"
                  : upgradeState === "complete"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : tone.muted
              }`}
              data-oceanleo-node-upgrade={upgradeState}
              role={upgradeState === "failed" ? "alert" : "status"}
            >
              <span className="sr-only sm:not-sr-only">
                {upgradeState === "running"
                  ? tt("正在更新节点…")
                  : upgradeState === "complete"
                    ? tt("节点更新完成")
                    : upgradeState === "failed"
                      ? tt("更新失败，请稍后重试。")
                      : tt("节点有可用更新")}
              </span>
              {nodeInfo?.update_available && upgradeState !== "complete" ? (
                <button
                  type="button"
                  className="text-xs underline-offset-2 hover:underline disabled:opacity-50"
                  disabled={upgradeState === "running"}
                  onClick={() => setConfirmUpgrade(true)}
                  data-oceanleo-node-upgrade-action
                >
                  {tt("更新")}
                </button>
              ) : null}
            </div>
          ) : null}
          {connected.length > 1 ? (
            <label className="shrink-0">
              <span className="sr-only">{tt("切换服务器")}</span>
              <select
                className={`max-w-[12rem] border-0 bg-transparent py-1 text-sm ${tone.input}`}
                aria-label={tt("切换服务器")}
                value={
                  connected.some((item) => item.id === computer.id)
                    ? computer.id
                    : ""
                }
                onChange={(event) => {
                  const nextId = event.currentTarget.value;
                  if (!nextId || nextId === computer.id) return;
                  setMountedId(nextId);
                  router.push(
                    serverPageHref(nextId, card ? { card } : undefined),
                  );
                }}
                data-oceanleo-server-switch
              >
                {!connected.some((item) => item.id === computer.id) ? (
                  <option value="" disabled>
                    {tt("切换服务器")}
                  </option>
                ) : null}
                {connected.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {statusWord(computerDisplayState(item), tt)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {card ? (
            <>
              <nav
                className={`flex items-center gap-5 border-b ${tone.border}`}
                aria-label={tt("选择工作方式")}
                data-oceanleo-server-card-tabs
              >
                {CARD_ORDER.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={!available}
                    className={card === item ? tone.tabActive : tone.tab}
                    onClick={() => openCard(item, true)}
                    data-oceanleo-server-tab={item}
                  >
                    <CardGlyph card={item} />
                    {tt(CARD_COPY[item].title)}
                  </button>
                ))}
              </nav>
              {available ? (
                <div className="min-h-0 flex-1 pt-3" data-oceanleo-server-card={card}>
                  {card === "acp" ? (
                    <AcpCard
                      computer={computer}
                      initialProgram={initialProgram}
                      initialSessionId={initialSessionId}
                    />
                  ) : card === "cli" ? (
                    <CliCard
                      computer={computer}
                      initialProgram={initialProgram}
                      initialSessionId={initialSessionId}
                    />
                  ) : (
                    <TerminalCard
                      computer={computer}
                      initialSessionId={initialSessionId}
                    />
                  )}
                </div>
              ) : (
                <UnavailablePanel
                  computer={computer}
                  state={state}
                  startState={startState}
                  onStart={start}
                  tt={tt}
                />
              )}
            </>
          ) : (
            <section
              aria-labelledby="server-page-title"
              className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center"
            >
              <h2 id="server-page-title" className="sr-only">
                {tt("选择工作方式")}
              </h2>
              <div
                className={`divide-y ${tone.divide}`}
                data-oceanleo-server-card-picker
              >
                {CARD_ORDER.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={!available}
                    title={tt(CARD_COPY[item].description)}
                    className={`flex h-12 w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-40 ${tone.hover}`}
                    onClick={() => openCard(item)}
                    data-oceanleo-server-card-choice={item}
                  >
                    <span className={tone.muted}>
                      <CardGlyph card={item} />
                    </span>
                    <span className="text-sm">{tt(CARD_COPY[item].title)}</span>
                  </button>
                ))}
              </div>
              {!available ? (
                <div className="mt-6">
                  <UnavailablePanel
                    computer={computer}
                    state={state}
                    startState={startState}
                    onStart={start}
                    tt={tt}
                  />
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
      {confirmUpgrade ? (
        <ConfirmDialog
          title="更新节点程序？"
          body="更新时这台服务器上正在运行的终端会被关掉，过去的记录会保留"
          confirmLabel="更新"
          onConfirm={() => void upgrade()}
          onCancel={() => setConfirmUpgrade(false)}
        />
      ) : null}
    </main>
  );
}

function UnavailablePanel({
  computer,
  state,
  startState,
  onStart,
  tt,
}: {
  computer: Computer;
  state: ComputerDisplayState;
  startState: StartState;
  onStart: () => Promise<void>;
  tt: (zh: string, values?: Record<string, string | number>) => string;
}) {
  const canStart = state === "stopped" && computer.source === "aliyun";
  return (
    <section
      className="px-1 py-4 text-sm"
      data-oceanleo-server-unavailable={state}
    >
      <p className={tone.muted}>{unavailableReason(state, tt)}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {canStart ? (
          <button
            type="button"
            disabled={startState === "running"}
            className="text-sm underline-offset-2 hover:underline"
            onClick={() => void onStart()}
            data-oceanleo-server-start
          >
            {startState === "running" ? tt("正在开机…") : tt("开机")}
          </button>
        ) : state !== "unpaid" ? (
          <a
            href="/devices?tab=cloud"
            className={`text-sm underline-offset-2 hover:underline ${tone.muted}`}
          >
            {tt("查看我的设备")}
          </a>
        ) : null}
        {startState === "requested" ? (
          <span className={tone.muted} data-oceanleo-server-start-result="requested">
            {tt("开机请求已发送，正在等待服务器上线。")}
          </span>
        ) : startState === "failed" ? (
          <span className={tone.danger} data-oceanleo-server-start-result="failed">
            {tt("开机失败，请稍后重试。")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
