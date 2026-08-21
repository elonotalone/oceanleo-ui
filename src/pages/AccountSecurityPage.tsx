"use client";

// ============================================================================
// @oceanleo/ui — 账号安全中心（W4，2026-08-21）
// ----------------------------------------------------------------------------
// 在这一页之前，一个 OceanLeo 用户能对自己账号做的事只有两件：登录，和退出所有
// 设备。看不到自己什么时候在哪台设备上登过，改不了密码，开不了两步验证，也没有
// 任何办法给「万一被盗号」封顶。
//
// 这一页把四件事摆到用户面前：
//   1 修改密码（先证明你是你：原密码，或者发到邮箱的一次性码）
//   2 两步验证（开 / 再加一个 / 移除，移除前先验一次）
//   3 最近活动 + 登录中的设备（踢掉某一台，当前那台不给踢自己的键）
//   4 每日消费上限（保护自己：一天最多损失这么多）
//
// 取数全部走 `lib/auth/account-security.ts`（契约 §2 的四个端点），失败**只拿到
// 一个码**，句子在这里由 `tt()` 取——所以接口挂了也是一句人话，不是英文原文、
// 不是整页白屏。W3 的端点还没上线时返回的是 `not_available`，这一页照常渲染，
// 只是那一块显示「还没上线」。
// ============================================================================

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  challengeAndVerify,
  currentAal,
  enrollTotp,
  listMfaFactors,
  reauthenticate,
  signOutEverywhere,
  unenrollFactor,
  updatePassword,
  type MfaFactor,
  type TotpEnrollment,
} from "../lib/auth/client";
import {
  fenToYuan,
  getSecurityEvents,
  getSecuritySessions,
  getWalletLimit,
  revokeSecuritySession,
  setWalletLimit,
  yuanToFen,
  type SecurityApiCode,
  type SecurityEvent,
  type SecurityEventKind,
  type SecuritySession,
} from "../lib/auth/account-security";
import { oceanleoConfigured, loginUnavailableNotice } from "../lib/auth";
import { ButtonSpinner, ConfirmDialog } from "../ui";
import { useUI, type UITranslate } from "../i18n/ui/useUI";

/** 取数失败的码 → 中文原文（词典 key）。渲染处 `tt()` 一下就是当前语言。 */
export function securityErrorCopy(code: SecurityApiCode | undefined): string {
  switch (code) {
    case "signed_out":
      return "登录状态失效了，请重新登录。";
    case "offline":
      return "连不上服务器，检查一下网络再试。";
    case "not_available":
      return "这一块还没上线，过些天再来看。";
    case "not_found":
      return "这条记录已经不在了。";
    case "rate_limited":
      return "操作太频繁了，缓一会儿再试。";
    case "server_error":
      return "服务器出了点问题，稍后再试。";
    default:
      return "这一步没有完成，请稍后重试。";
  }
}

/** 契约 §2 的 kind → 用户看得懂的一句话。认不出来的落到「其它账号操作」。 */
export function securityEventCopy(kind: SecurityEventKind): string {
  switch (kind) {
    case "login":
      return "登录";
    case "password_changed":
      return "修改了密码";
    case "mfa_enrolled":
      return "开启了两步验证";
    case "mfa_unenrolled":
      return "关闭了两步验证";
    case "key_added":
      return "新增了一个 API key";
    case "key_revoked":
      return "撤销了一个 API key";
    case "spend_blocked":
      return "消费被每日上限拦下";
    case "logout_all":
      return "退出了所有设备";
    default:
      return "其它账号操作";
  }
}

/** ISO 时间 → 当前语言的可读串。解析不出来就原样返回（宁可难看也不要空白）。 */
function formatTime(iso: string, locale?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString(locale || undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return d.toISOString().slice(0, 16).replace("T", " ");
  }
}

// ---------------------------------------------------------------------------
// 小零件
// ---------------------------------------------------------------------------

const CARD = "rounded-2xl border border-neutral-200 p-5";
const FIELD =
  "w-full rounded-lg border border-neutral-200 px-3 py-2 text-[14px] outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100";
const PRIMARY =
  "rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-neutral-800 active:scale-[0.99] disabled:opacity-60";
const QUIET =
  "rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-600 transition hover:bg-neutral-50 disabled:opacity-50";

function Section({
  title,
  desc,
  children,
  slot,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  slot: string;
}) {
  return (
    <section className={`${CARD} mt-4`} data-security-section={slot}>
      <h2 className="text-[15px] font-semibold text-neutral-900">{title}</h2>
      {desc && <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Note({ kind, text }: { kind: "error" | "ok"; text: string }) {
  const className =
    kind === "error"
      ? "bg-red-50 text-red-700"
      : "bg-emerald-50 text-emerald-700";
  return (
    <div
      data-security-note={kind}
      role={kind === "error" ? "alert" : "status"}
      className={`v-fade-in rounded-lg px-3 py-2 text-[13px] ${className}`}
    >
      {text}
    </div>
  );
}

/** 一行「设备 · 脱敏 IP」。IP 空串时说「地址未知」，绝不把空白或原始串摆出来。 */
function WhereLine({
  tt,
  device,
  ipMasked,
}: {
  tt: UITranslate;
  device: string;
  ipMasked: string;
}) {
  return (
    <span className="text-[12px] text-neutral-500" data-security-where>
      {device || tt("未知设备")}
      {" · "}
      {ipMasked || tt("地址未知")}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1 修改密码
// ---------------------------------------------------------------------------

function ChangePasswordBlock({ tt }: { tt: UITranslate }) {
  const [current, setCurrent] = useState("");
  const [nonce, setNonce] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  async function sendCode() {
    setError("");
    setOk("");
    setSending(true);
    const result = await reauthenticate();
    setSending(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setOk(tt("验证码已经发到你的邮箱，可能要等几分钟。"));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (next.length < 6) {
      setError(tt("密码至少 6 位。"));
      return;
    }
    if (next !== again) {
      setError(tt("两次输入的密码不一样。"));
      return;
    }
    setLoading(true);
    const result = await updatePassword(next, {
      ...(current ? { currentPassword: current } : {}),
      ...(nonce ? { nonce: nonce.trim() } : {}),
    });
    setLoading(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setCurrent("");
    setNonce("");
    setNext("");
    setAgain("");
    setOk(tt("新密码已经生效"));
  }

  return (
    <Section
      slot="password"
      title={tt("修改密码")}
      desc={tt("改密码要先证明你是你：填一次原密码，或者用发到邮箱的验证码。")}
    >
      <form onSubmit={submit} className="space-y-3" data-security-form="password">
        <div>
          <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-current">
            {tt("当前密码")}
          </label>
          <input
            id="sec-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={FIELD}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-nonce">
            {tt("邮箱验证码")}
          </label>
          <div className="flex gap-2">
            <input
              id="sec-nonce"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={nonce}
              onChange={(e) => setNonce(e.target.value)}
              className={FIELD}
            />
            <button
              type="button"
              data-security-send-code
              onClick={() => void sendCode()}
              disabled={sending}
              className={`${QUIET} shrink-0 whitespace-nowrap`}
            >
              {tt("发送邮箱验证码")}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-new">
            {tt("新密码")}
          </label>
          <input
            id="sec-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
            minLength={6}
            className={FIELD}
            placeholder={tt("至少 6 位")}
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-new-again">
            {tt("再输一遍")}
          </label>
          <input
            id="sec-new-again"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            required
            minLength={6}
            className={FIELD}
          />
        </div>
        {error && <Note kind="error" text={error} />}
        {!error && ok && <Note kind="ok" text={ok} />}
        <button type="submit" disabled={loading} data-security-submit="password" className={PRIMARY}>
          {loading ? <ButtonSpinner label={tt("处理中...")} /> : tt("保存")}
        </button>
      </form>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 2 两步验证
// ---------------------------------------------------------------------------

function TwoStepBlock({ tt }: { tt: UITranslate }) {
  const [factors, setFactors] = useState<MfaFactor[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [removing, setRemoving] = useState<MfaFactor | null>(null);
  const [removeCode, setRemoveCode] = useState("");

  const reload = useCallback(async () => {
    const { factors: list } = await listMfaFactors();
    setFactors(list);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const verified = factors.filter((f) => f.status === "verified");

  async function startEnroll() {
    setError("");
    setOk("");
    setBusy(true);
    const result = await enrollTotp();
    setBusy(false);
    if (result.error || !result.enrollment) {
      setError(tt(result.error || "两步验证现在开不了，稍后再试。"));
      return;
    }
    setEnrollment(result.enrollment);
    setCode("");
  }

  async function confirmEnroll(e: FormEvent) {
    e.preventDefault();
    if (!enrollment) return;
    setError("");
    setBusy(true);
    const result = await challengeAndVerify(enrollment.factorId, code);
    setBusy(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setEnrollment(null);
    setCode("");
    setOk(tt("两步验证已开启。"));
    await reload();
  }

  async function confirmRemove() {
    if (!removing) return;
    setError("");
    setOk("");
    setBusy(true);
    // 先验一次再移除：光有会话就能一键关掉 2FA 的话，这道锁等于没上。
    const check = await challengeAndVerify(removing.id, removeCode);
    if (check.error) {
      setBusy(false);
      setError(tt(check.error));
      return;
    }
    const result = await unenrollFactor(removing.id);
    setBusy(false);
    if (result.error) {
      setError(tt(result.error));
      return;
    }
    setRemoving(null);
    setRemoveCode("");
    setOk(tt("两步验证已移除。"));
    await reload();
  }

  async function copySecret() {
    if (!enrollment) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setOk(tt("密钥已复制。"));
    } catch {
      // 剪贴板被拒也没关系：明文串本来就摆在屏幕上，用户可以自己抄。
    }
  }

  return (
    <Section
      slot="two-step"
      title={tt("两步验证")}
      desc={verified.length > 0 ? tt("已开启。登录时除了密码，还要输一次验证器上的 6 位码。") : tt("还没开启。开启之后，别人光有你的密码也登不进来。")}
    >
      {removing && (
        <ConfirmDialog
          title={tt("移除")}
          body={tt("移除之后，只要有你的密码就能登进这个账号。确定要移除吗？")}
          confirmLabel={tt("移除")}
          danger
          onConfirm={() => void confirmRemove()}
          onCancel={() => {
            setRemoving(null);
            setRemoveCode("");
          }}
        />
      )}

      {!loaded && <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>}

      {loaded && verified.length > 0 && (
        <ul className="mb-4 divide-y divide-neutral-100" data-security-factors>
          {verified.map((f) => (
            <li key={f.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] text-neutral-900">
                  {f.friendlyName || tt("未命名的验证器")}
                </p>
                {f.createdAt && (
                  <p className="text-[12px] text-neutral-500">
                    {tt("添加于 {date}", { date: formatTime(f.createdAt) })}
                  </p>
                )}
              </div>
              <button
                type="button"
                data-security-remove-factor={f.id}
                onClick={() => {
                  setRemoving(f);
                  setRemoveCode("");
                }}
                className={`${QUIET} shrink-0 text-red-600 hover:bg-red-50`}
              >
                {tt("移除")}
              </button>
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <div className="mb-4">
          <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-remove-code">
            {tt("移除前先输一次验证器上的 6 位码。")}
          </label>
          <input
            id="sec-remove-code"
            type="text"
            inputMode="numeric"
            value={removeCode}
            onChange={(e) => setRemoveCode(e.target.value)}
            className={FIELD}
            placeholder={tt("6 位数字")}
          />
        </div>
      )}

      {enrollment ? (
        <form onSubmit={confirmEnroll} className="space-y-3" data-security-form="enroll">
          <p className="text-[13px] text-neutral-700">{tt("用验证器 App 扫这个二维码")}</p>
          {enrollment.qrCode && (
            // 上游给的是 data: URI 的二维码，不是外链，不会把账号信息发给第三方。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enrollment.qrCode}
              alt={tt("用验证器 App 扫这个二维码")}
              data-security-qr
              className="h-40 w-40 rounded-lg border border-neutral-200 bg-white p-2"
            />
          )}
          <p className="text-[12px] text-neutral-500">{tt("扫不了就手动输入这串密钥：")}</p>
          <div className="flex items-center gap-2">
            <code
              data-security-secret
              className="flex-1 select-all break-all rounded-lg bg-neutral-50 px-3 py-2 text-[13px] tracking-wider text-neutral-800"
            >
              {enrollment.secret}
            </code>
            <button type="button" onClick={() => void copySecret()} className={`${QUIET} shrink-0`}>
              {tt("复制密钥")}
            </button>
          </div>
          <div>
            <label className="mb-1 block text-[12px] text-neutral-600" htmlFor="sec-enroll-code">
              {tt("输入验证器上正在显示的 6 位码")}
            </label>
            <input
              id="sec-enroll-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              className={FIELD}
              placeholder={tt("6 位数字")}
            />
          </div>
          {error && <Note kind="error" text={error} />}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} data-security-submit="enroll" className={PRIMARY}>
              {busy ? <ButtonSpinner label={tt("处理中...")} /> : tt("确认并开启")}
            </button>
            <button
              type="button"
              onClick={() => {
                setEnrollment(null);
                setError("");
              }}
              className={QUIET}
            >
              {tt("取消")}
            </button>
          </div>
        </form>
      ) : (
        <>
          {error && <Note kind="error" text={error} />}
          {!error && ok && <Note kind="ok" text={ok} />}
          <button
            type="button"
            data-security-enroll
            onClick={() => void startEnroll()}
            disabled={busy || !loaded}
            className={`${PRIMARY} mt-2`}
          >
            {verified.length > 0 ? tt("再加一个验证器") : tt("开启两步验证")}
          </button>
        </>
      )}

      {/* 丢了验证器怎么办：现在的真实答案就是人工核实，写清楚，别让用户临场猜。 */}
      <div className="mt-5 rounded-lg bg-neutral-50 p-3" data-security-lost>
        <p className="text-[12px] font-medium text-neutral-700">{tt("验证器丢了怎么办")}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
          {tt(
            "我们暂时不发备用恢复码。手机丢了或者换了机器，写信到 support@oceanleo.com，我们人工核实身份之后帮你移除，你再重新开一次。",
          )}
        </p>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 3 最近活动
// ---------------------------------------------------------------------------

function RecentActivityBlock({ tt }: { tt: UITranslate }) {
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      const result = await getSecurityEvents(before ? { before } : {});
      setLoading(false);
      if (!result.ok || !result.data) {
        setError(tt(securityErrorCopy(result.code)));
        return;
      }
      setError("");
      setEvents((prev) => (before ? [...prev, ...result.data!.events] : result.data!.events));
      setNextBefore(result.data.nextBefore);
    },
    [tt],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Section slot="activity" title={tt("最近活动")}>
      {error && <Note kind="error" text={error} />}
      {!error && loading && events.length === 0 && (
        <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>
      )}
      {!error && !loading && events.length === 0 && (
        <p className="text-[13px] text-neutral-500">{tt("还没有任何记录。")}</p>
      )}
      {events.length > 0 && (
        <ul className="divide-y divide-neutral-100" data-security-events>
          {events.map((ev) => (
            <li key={ev.id} className="py-2.5" data-security-event={ev.kind}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] text-neutral-900">
                  {tt(securityEventCopy(ev.kind))}
                  {ev.result === "denied" && (
                    <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-600">
                      {tt("被拒绝")}
                    </span>
                  )}
                </p>
                <span className="shrink-0 text-[12px] tabular-nums text-neutral-400">
                  {formatTime(ev.at)}
                </span>
              </div>
              <WhereLine tt={tt} device={ev.deviceLabel} ipMasked={ev.ipMasked} />
            </li>
          ))}
        </ul>
      )}
      {events.length > 0 && (
        <div className="mt-3">
          {nextBefore ? (
            <button
              type="button"
              data-security-load-more
              onClick={() => void load(nextBefore)}
              disabled={loading}
              className={QUIET}
            >
              {loading ? tt("加载中…") : tt("加载更多")}
            </button>
          ) : (
            <p className="text-[12px] text-neutral-400">{tt("没有更多了。")}</p>
          )}
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 4 登录中的设备
// ---------------------------------------------------------------------------

function ActiveDevicesBlock({ tt, onSignedOutAll }: { tt: UITranslate; onSignedOutAll?: () => void }) {
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [pending, setPending] = useState<SecuritySession | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getSecuritySessions();
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(tt(securityErrorCopy(result.code)));
      return;
    }
    setError("");
    setSessions(result.data);
  }, [tt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke() {
    if (!pending) return;
    const target = pending;
    setPending(null);
    const result = await revokeSecuritySession(target.id);
    if (!result.ok) {
      setError(tt(securityErrorCopy(result.code)));
      return;
    }
    setError("");
    setOk(tt("那台设备已经退出。"));
    setSessions((prev) => prev.filter((s) => s.id !== target.id));
  }

  const others = sessions.filter((s) => !s.current);

  return (
    <Section slot="devices" title={tt("登录中的设备")}>
      {pending && (
        <ConfirmDialog
          title={tt("退出这台设备")}
          body={tt("这台设备会被立刻退出，下次要重新登录。当前设备不受影响。")}
          confirmLabel={tt("退出这台设备")}
          danger
          onConfirm={() => void revoke()}
          onCancel={() => setPending(null)}
        />
      )}
      {confirmAll && (
        <ConfirmDialog
          title={tt("退出登录")}
          body={tt("退出后需要重新登录才能使用。这将退出全部 OceanLeo 站点。")}
          confirmLabel={tt("退出登录")}
          danger
          onConfirm={async () => {
            await signOutEverywhere();
            setConfirmAll(false);
            if (onSignedOutAll) onSignedOutAll();
            else if (typeof window !== "undefined") window.location.reload();
          }}
          onCancel={() => setConfirmAll(false)}
        />
      )}

      {error && <Note kind="error" text={error} />}
      {!error && ok && <Note kind="ok" text={ok} />}
      {!error && loading && sessions.length === 0 && (
        <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>
      )}
      {!error && !loading && sessions.length === 0 && (
        <p className="text-[13px] text-neutral-500">{tt("现在没有别的设备登录。")}</p>
      )}
      {!error && !loading && sessions.length > 0 && others.length === 0 && (
        <p className="mb-2 text-[13px] text-neutral-500">{tt("现在没有别的设备登录。")}</p>
      )}

      {sessions.length > 0 && (
        <ul className="divide-y divide-neutral-100" data-security-sessions>
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 py-2.5"
              data-security-session={s.id}
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] text-neutral-900">
                  {s.deviceLabel || tt("未知设备")}
                  {s.current && (
                    <span
                      data-security-current
                      className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700"
                    >
                      {tt("当前设备")}
                    </span>
                  )}
                </p>
                <WhereLine tt={tt} device={formatTime(s.lastSeenAt)} ipMasked={s.ipMasked} />
              </div>
              {/* 当前这台**不给**踢自己的键：要退就用下面的「退出所有设备」。 */}
              {!s.current && (
                <button
                  type="button"
                  data-security-revoke={s.id}
                  onClick={() => setPending(s)}
                  className={`${QUIET} shrink-0 text-red-600 hover:bg-red-50`}
                >
                  {tt("退出这台设备")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        data-security-signout-all
        onClick={() => setConfirmAll(true)}
        className={`${QUIET} mt-4 w-full py-2.5 text-[13px] text-red-600 hover:bg-red-50`}
      >
        {tt("退出登录")}
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 5 每日消费上限
// ---------------------------------------------------------------------------

function DailyLimitBlock({ tt }: { tt: UITranslate }) {
  const [dailyFen, setDailyFen] = useState<number | null>(null);
  const [spentFen, setSpentFen] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await getWalletLimit();
    setLoading(false);
    if (!result.ok || !result.data) {
      setError(tt(securityErrorCopy(result.code)));
      return;
    }
    setError("");
    setDailyFen(result.data.dailyFen);
    setSpentFen(result.data.spentTodayFen);
    setInput(result.data.dailyFen === null ? "" : fenToYuan(result.data.dailyFen));
  }, [tt]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(value: number | null) {
    setError("");
    setOk("");
    setBusy(true);
    const result = await setWalletLimit(value);
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(tt(securityErrorCopy(result.code)));
      return;
    }
    setDailyFen(result.data.dailyFen);
    setInput(result.data.dailyFen === null ? "" : fenToYuan(result.data.dailyFen));
    setOk(tt("上限已保存。"));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const fen = yuanToFen(input);
    if (input.trim() && fen === null) {
      setError(tt("请填一个不小于 0 的金额。"));
      return;
    }
    void save(fen);
  }

  return (
    <Section
      slot="limit"
      title={tt("每日消费上限")}
      desc={tt("这是给自己上的保险：万一账号被别人拿到，一天最多损失这么多。")}
    >
      {error && <Note kind="error" text={error} />}
      {!error && loading && <p className="text-[13px] text-neutral-500">{tt("加载中…")}</p>}
      {!error && !loading && (
        <form onSubmit={submit} className="space-y-3" data-security-form="limit">
          <p className="text-[13px] text-neutral-700" data-security-limit-state>
            {dailyFen === null
              ? tt("现在不限。")
              : tt("现在是每天 {yuan} 元。", { yuan: fenToYuan(dailyFen) })}{" "}
            {tt("今天已经花了 {yuan} 元。", { yuan: fenToYuan(spentFen) })}
          </p>
          <div className="flex items-center gap-2">
            <input
              id="sec-limit"
              type="text"
              inputMode="decimal"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className={FIELD}
              placeholder={tt("例如 50")}
              aria-label={tt("每日消费上限")}
            />
            <span className="shrink-0 text-[12px] text-neutral-500">{tt("元 / 天")}</span>
          </div>
          {ok && <Note kind="ok" text={ok} />}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} data-security-submit="limit" className={PRIMARY}>
              {busy ? <ButtonSpinner label={tt("处理中...")} /> : tt("保存上限")}
            </button>
            {dailyFen !== null && (
              <button
                type="button"
                data-security-clear-limit
                onClick={() => void save(null)}
                disabled={busy}
                className={QUIET}
              >
                {tt("取消上限")}
              </button>
            )}
          </div>
        </form>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

export interface AccountSecurityPageProps {
  /** 「退出所有设备」之后去哪。默认刷新当前页。 */
  onSignedOutAll?: () => void;
}

export function AccountSecurityPage({ onSignedOutAll }: AccountSecurityPageProps) {
  const tt = useUI();
  const configured = oceanleoConfigured();
  const [aalChecked, setAalChecked] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    // 只为让「两步验证」那一块知道当前会话的等级；取不到不影响任何渲染。
    currentAal().then(() => {
      if (alive) setAalChecked(true);
    });
    return () => {
      alive = false;
    };
  }, [configured]);

  if (!configured) {
    const notice = loginUnavailableNotice();
    return (
      <div className="px-8 py-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
          {tt("账号安全")}
        </h1>
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          <p className="text-[14px] font-medium">{tt(notice?.title || "登录服务尚未配置")}</p>
          {notice?.detail && <p className="mt-1.5 text-[13px]">{tt(notice.detail)}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-6" data-security-page data-security-aal-checked={String(aalChecked)}>
      <h1 className="text-[22px] font-semibold tracking-tight text-neutral-900">
        {tt("账号安全")}
      </h1>
      <p className="mt-1 text-[13px] text-neutral-500">
        {tt("最近的登录与改动、还在登录状态的设备、每天最多能花多少")}
      </p>
      <div className="v-fade-up mx-auto mt-6 max-w-lg pb-10">
        <TwoStepBlock tt={tt} />
        <ChangePasswordBlock tt={tt} />
        <ActiveDevicesBlock tt={tt} onSignedOutAll={onSignedOutAll} />
        <RecentActivityBlock tt={tt} />
        <DailyLimitBlock tt={tt} />
      </div>
    </div>
  );
}
