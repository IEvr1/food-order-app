import type { OrderStatus, Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/phone";
import {
  formatSalonDate,
  isoDateInTimeZone,
  salonLocalDayBoundsUtc,
  salonLocalMonthBoundsUtc,
  todayIsoInTimeZone,
  zonedWallTimeToUtc,
} from "@/lib/timezone";

const ORDER_STATUSES: readonly OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Short forward-looking presets (next 3 / 7 days). */
const MAX_SHORT_RANGE_DAYS = 15;

export const DASHBOARD_RANGE_PRESETS = [
  "today",
  "tomorrow",
  "next3",
  "week7",
  "remainingMonth",
  "currentMonth",
  "lastMonth",
] as const;

export type DashboardRangePreset = (typeof DASHBOARD_RANGE_PRESETS)[number];

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** Step calendar days in salon-local timezone (DST-safe via noon anchor). */
export function addSalonLocalDays(isoDate: string, days: number, timeZone: string): string {
  const noon = zonedWallTimeToUtc(isoDate, 12, 0, 0, timeZone);
  return isoDateInTimeZone(new Date(noon.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
}

export function salonLocalDateRangeBoundsUtc(
  fromIso: string,
  toIso: string,
  timeZone: string,
): { start: Date; endExclusive: Date } {
  const { start } = salonLocalDayBoundsUtc(fromIso, timeZone);
  const { endExclusive } = salonLocalDayBoundsUtc(toIso, timeZone);
  return { start, endExclusive };
}

function clampShortDashboardDateRange(
  from: string,
  to: string,
  timeZone: string,
): { from: string; to: string } {
  let f = from;
  let t = to;
  if (f > t) {
    [f, t] = [t, f];
  }
  const maxTo = addSalonLocalDays(f, MAX_SHORT_RANGE_DAYS - 1, timeZone);
  if (t > maxTo) {
    t = maxTo;
  }
  return { from: f, to: t };
}

function salonLocalMonthLastDayIso(year: number, month: number, timeZone: string): string {
  const { endExclusive } = salonLocalMonthBoundsUtc(year, month, timeZone);
  return isoDateInTimeZone(new Date(endExclusive.getTime() - 60_000), timeZone);
}

function salonLocalMonthRange(
  year: number,
  month: number,
  timeZone: string,
): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    from: `${year}-${pad(month)}-01`,
    to: salonLocalMonthLastDayIso(year, month, timeZone),
  };
}

function previousCalendarMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

export function computeDashboardPresetRange(
  preset: DashboardRangePreset,
  timeZone: string,
  todayIso = todayIsoInTimeZone(timeZone),
): { from: string; to: string } {
  const [y, m] = todayIso.split("-").map((v) => Number(v));

  switch (preset) {
    case "today":
      return { from: todayIso, to: todayIso };
    case "tomorrow": {
      const day = addSalonLocalDays(todayIso, 1, timeZone);
      return { from: day, to: day };
    }
    case "next3":
      return clampShortDashboardDateRange(todayIso, addSalonLocalDays(todayIso, 2, timeZone), timeZone);
    case "week7":
      return clampShortDashboardDateRange(todayIso, addSalonLocalDays(todayIso, 6, timeZone), timeZone);
    case "remainingMonth":
      return {
        from: todayIso,
        to: salonLocalMonthLastDayIso(y, m, timeZone),
      };
    case "currentMonth":
      return salonLocalMonthRange(y, m, timeZone);
    case "lastMonth": {
      const prev = previousCalendarMonth(y, m);
      return salonLocalMonthRange(prev.year, prev.month, timeZone);
    }
    default:
      return { from: todayIso, to: todayIso };
  }
}

export function dashboardRangeDayCount(from: string, to: string, timeZone: string): number {
  let count = 0;
  let cur = from;
  while (cur <= to) {
    count += 1;
    if (cur === to) {
      break;
    }
    cur = addSalonLocalDays(cur, 1, timeZone);
  }
  return count;
}

function normalizeRangePreset(value: string | undefined): DashboardRangePreset | undefined {
  if (!value?.trim()) {
    return undefined;
  }
  if (value === "month") {
    return "currentMonth";
  }
  if (DASHBOARD_RANGE_PRESETS.includes(value as DashboardRangePreset)) {
    return value as DashboardRangePreset;
  }
  return undefined;
}

function parseDashboardRangePreset(value: string | undefined): DashboardRangePreset {
  return normalizeRangePreset(value) ?? "today";
}

export function resolveDashboardDateRange(
  input: {
    range?: string;
    from?: string;
    to?: string;
    date?: string;
  },
  timeZone: string,
): {
  from: string;
  to: string;
  preset: DashboardRangePreset;
  dayCount: number;
} {
  const todayIso = todayIsoInTimeZone(timeZone);
  const legacyDate = input.date?.trim() ?? "";

  let preset = parseDashboardRangePreset(input.range?.trim());

  if (!input.range?.trim() && legacyDate && isIsoDate(legacyDate)) {
    preset = "today";
    const { from, to } = { from: legacyDate, to: legacyDate };
    return {
      from,
      to,
      preset,
      dayCount: dashboardRangeDayCount(from, to, timeZone),
    };
  }

  const { from, to } = computeDashboardPresetRange(preset, timeZone, todayIso);

  return {
    from,
    to,
    preset,
    dayCount: dashboardRangeDayCount(from, to, timeZone),
  };
}

export function formatDashboardDateRangeSummary(
  from: string,
  to: string,
  lang: "el" | "en",
  timeZone: string,
): string {
  if (from === to) {
    return from;
  }
  const locale = lang === "el" ? "el-CY" : "en-GB";
  const fmt = (iso: string) =>
    formatSalonDate(zonedWallTimeToUtc(iso, 12, 0, 0, timeZone), timeZone, locale);
  return `${fmt(from)} – ${fmt(to)}`;
}

/** Customer `where` fragment for booking list phone search. */
export function customerPhoneSearchWhere(
  phoneQuery: string | undefined,
): Prisma.CustomerWhereInput | undefined {
  if (!phoneQuery?.trim()) {
    return undefined;
  }
  const trimmed = phoneQuery.trim();
  try {
    return { phoneE164: normalizePhone(trimmed) };
  } catch {
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 3) {
      return { phoneE164: { contains: digits } };
    }
    return undefined;
  }
}

export function parseOrderStatus(value: string | undefined): OrderStatus | undefined {
  if (!value || value === "all") {
    return undefined;
  }
  return ORDER_STATUSES.includes(value as OrderStatus) ? (value as OrderStatus) : undefined;
}

/** @deprecated */
export function parseBookingStatus(value: string | undefined): OrderStatus | undefined {
  return parseOrderStatus(value);
}
