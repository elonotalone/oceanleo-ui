"use client";

import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { useLocale } from "next-intl";
import { normalizeLocale, type Locale } from "../../../i18n/config";
import { useUI } from "../../../i18n/ui/useUI";
import {
  DEVICE_ZONE,
  daysInMonth,
  deadlineMs,
  deviceTimeZone,
  offsetLabel,
  readStoredZone,
  resolveZone,
  selectableZones,
  storeZone,
  wallClockText,
  zonedParts,
  zonedToInstant,
  type ZonedParts,
} from "./bay-deadline";
import { BAY_FORM_CHIP_BUTTON_CLASS, BAY_FORM_HELP_CLASS, BAY_FORM_PRIMARY_BUTTON_CLASS, BAY_FORM_SELECT_CLASS } from "./form-ui";

type Time = { hour: number; minute: number; second: number };
const END_OF_DAY: Time = { hour: 23, minute: 59, second: 59 };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function monthTitle(year: number, month: number, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  } catch {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
}

function weekdayLabels(locale: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    try {
      // 2024-01-07 是周日；从周日排起。
      out.push(new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + index))));
    } catch {
      out.push(String(index));
    }
  }
  return out;
}

function TimeBox(props: {
  label: string;
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}): ReactElement {
  const [text, setText] = useState(() => String(props.value).padStart(2, "0"));
  useEffect(() => {
    // 打字时保留「1」和空串，否则每次补零会把下一位挡在 maxLength 外。
    setText((current) => Number(current) === props.value ? current : String(props.value).padStart(2, "0"));
  }, [props.value]);
  return (
    <input
      aria-label={props.label}
      inputMode="numeric"
      maxLength={2}
      disabled={props.disabled}
      value={text}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => setText(String(props.value).padStart(2, "0"))}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, "").slice(-2);
        const next = clamp(Number(digits || 0), 0, props.max);
        setText(Number(digits) === next ? digits : String(next));
        props.onChange(next);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          const step = event.key === "ArrowUp" ? 1 : -1;
          const next = (props.value + step + props.max + 1) % (props.max + 1);
          setText(String(next).padStart(2, "0"));
          props.onChange(next);
        }
      }}
      className="h-10 w-14 rounded-md border border-neutral-300 bg-white text-center text-[14px] tabular-nums text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 disabled:opacity-50"
    />
  );
}

/**
 * 截止时间：点开是一张日历 + 时分秒 + 时区。库里只存一个绝对时刻；
 * 默认按「我设备的时间」填，面板里同时写出设备时间和 UTC，方便核对。
 */
export function BayDeadlineField(props: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}): ReactElement {
  const tt = useUI();
  let locale: Locale = "zh";
  try {
    locale = normalizeLocale(useLocale());
  } catch {
    locale = "zh";
  }
  const [open, setOpen] = useState(false);
  const [zone, setZone] = useState<string>(DEVICE_ZONE);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => setZone(readStoredZone()), []);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && boxRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tz = resolveZone(zone);
  const at = deadlineMs(props.value);
  const parts: ZonedParts | null = at == null ? null : zonedParts(at, tz);
  const [time, setTime] = useState<Time>(parts ? { hour: parts.hour, minute: parts.minute, second: parts.second } : END_OF_DAY);
  const today = zonedParts(Date.now(), tz);
  const [view, setView] = useState<{ year: number; month: number }>(() => ({
    year: (parts || today).year,
    month: (parts || today).month,
  }));

  // 值或时区从外面变了（载入草稿、换时区）：时间框和月份跟着走。
  const key = at == null ? "" : `${at}|${tz}`;
  useEffect(() => {
    if (at == null) return;
    const p = zonedParts(at, tz);
    setTime({ hour: p.hour, minute: p.minute, second: p.second });
    setView({ year: p.year, month: p.month });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const zones = useMemo(() => (open ? Array.from(new Set([tz, ...selectableZones()])) : []), [open, tz]);
  const weekdays = useMemo(() => weekdayLabels(locale), [locale]);

  function emit(next: ZonedParts) {
    if (props.disabled) return;
    const instant = zonedToInstant(next, tz);
    if (Number.isFinite(instant)) props.onChange(new Date(instant).toISOString());
  }

  function pickDay(day: number) {
    emit({ year: view.year, month: view.month, day, ...time });
  }

  function changeTime(next: Time) {
    setTime(next);
    if (parts) emit({ year: parts.year, month: parts.month, day: parts.day, ...next });
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const index = current.year * 12 + (current.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }

  function changeZone(next: string) {
    if (props.disabled) return;
    setZone(next);
    storeZone(next);
  }

  const firstWeekday = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay();
  const total = daysInMonth(view.year, view.month);
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const summaryText = at == null ? "" : `${wallClockText(at, tz)} ${offsetLabel(at, tz)}`;
  const device = deviceTimeZone();

  return (
    <div ref={boxRef} data-bay-deadline-field="" data-bay-deadline-open={open ? "" : undefined} className={`${open ? "relative z-30" : "relative"} ${props.disabled ? "opacity-50" : ""}`}>
      <button
        type="button"
        disabled={props.disabled}
        aria-expanded={open}
        data-bay-deadline-trigger=""
        data-bay-field="deadline"
        onClick={() => setOpen((current) => !current)}
        className={`${BAY_FORM_SELECT_CLASS} max-w-sm tabular-nums`}
      >
        <svg className="h-4 w-4 shrink-0 text-neutral-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <rect x="4" y="6" width="16" height="14" rx="2" />
          <path d="M8 4v4M16 4v4M4 10h16" />
        </svg>
        <span className={`min-w-0 flex-1 truncate ${at == null ? "text-neutral-400" : "text-neutral-900"}`}>
          {at == null ? tt("选日期和时间") : summaryText}
        </span>
        <svg className={`h-4 w-4 shrink-0 text-neutral-600 ${open ? "rotate-180" : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {open ? (
        <fieldset disabled={props.disabled} data-bay-deadline-panel="" className="absolute left-0 top-full z-30 mt-1 w-full max-w-sm rounded-md border border-neutral-300 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <button type="button" aria-label={tt("上个月")} onClick={() => shiftMonth(-1)} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m10 3-5 5 5 5" />
              </svg>
            </button>
            <p className="text-[14px] font-semibold text-neutral-900" data-bay-deadline-month="">
              {monthTitle(view.year, view.month, locale)}
            </p>
            <button type="button" aria-label={tt("下个月")} onClick={() => shiftMonth(1)} className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100">
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 3 5 5-5 5" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid gap-1 text-center" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {weekdays.map((name, index) => (
              <span key={index} className="text-[12px] text-neutral-500">
                {name}
              </span>
            ))}
            {cells.map((day, index) => {
              if (day == null) return <span key={`blank-${index}`} />;
              const selected = parts != null && parts.year === view.year && parts.month === view.month && parts.day === day;
              const isToday = today.year === view.year && today.month === view.month && today.day === day;
              return (
                <button
                  key={day}
                  type="button"
                  data-bay-deadline-day={day}
                  aria-pressed={selected}
                  onClick={() => pickDay(day)}
                  className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[13px] tabular-nums ${
                    selected
                      ? "bg-neutral-900 font-semibold text-white"
                      : isToday
                        ? "border border-neutral-900 text-neutral-900"
                        : "text-neutral-800 hover:bg-neutral-100"
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-center gap-2" data-bay-deadline-time="">
            <TimeBox label={tt("时")} value={time.hour} max={23} onChange={(hour) => changeTime({ ...time, hour })} />
            <span className="text-[14px] text-neutral-500">:</span>
            <TimeBox label={tt("分")} value={time.minute} max={59} onChange={(minute) => changeTime({ ...time, minute })} />
            <span className="text-[14px] text-neutral-500">:</span>
            <TimeBox label={tt("秒")} value={time.second} max={59} onChange={(second) => changeTime({ ...time, second })} />
          </div>

          <label className="mt-4 block">
            <span className="mb-1 block text-[13px] font-medium text-neutral-900">{tt("时区")}</span>
            <select
              data-bay-deadline-zone=""
              value={zone}
              onChange={(event) => changeZone(event.target.value)}
              className="h-11 w-full rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-300"
            >
              <option value={DEVICE_ZONE}>{`${tt("按我设备的时间")} · ${device} (${offsetLabel(at ?? Date.now(), device)})`}</option>
              {zones
                .map((name) => (
                  <option key={name} value={name}>
                    {`${name} (${offsetLabel(at ?? Date.now(), name)})`}
                  </option>
                ))}
            </select>
          </label>

          {at != null ? (
            <div className={`mt-4 space-y-1 tabular-nums ${BAY_FORM_HELP_CLASS}`} data-bay-deadline-check="">
              <p>
                {tt("你设备的时间")}：{wallClockText(at, device)} {offsetLabel(at, device)}
              </p>
              <p>UTC：{wallClockText(at, "UTC")}</p>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              data-bay-deadline-clear=""
              disabled={at == null}
              onClick={() => props.onChange("")}
              className={BAY_FORM_CHIP_BUTTON_CLASS}
            >
              {tt("清除")}
            </button>
            <button type="button" data-bay-deadline-done="" onClick={() => setOpen(false)} className={BAY_FORM_PRIMARY_BUTTON_CLASS}>
              {tt("完成")}
            </button>
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
