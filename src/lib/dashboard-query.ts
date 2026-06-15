import type { OrderStatus, Prisma } from "@prisma/client";
import { normalizePhone } from "@/lib/phone";
import {
  formatSalonDate,
  isoDateInTimeZone,
  salonLocalDayBoundsUtc,
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

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export function parseIsoDateParam(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v || !ISO_DATE_RE.test(v)) {
    return undefined;
  }
  const [y, m, d] = v.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return undefined;
  }
  return v;
}

/** Salon-local today bounds for the operational dashboard. */
export function resolveTodayDashboardDateRange(timeZone: string): {
  from: string;
  to: string;
} {
  const todayIso = todayIsoInTimeZone(timeZone);
  return { from: todayIso, to: todayIso };
}

export function resolveDashboardDateRange(
  input: { from?: string; to?: string },
  timeZone: string,
  options: {
    defaultFrom: string;
    defaultTo: string;
    maxDate?: string;
  },
): {
  from: string;
  to: string;
  dayCount: number;
  empty: boolean;
} {
  const maxDate = options.maxDate ?? todayIsoInTimeZone(timeZone);
  let from = parseIsoDateParam(input.from) ?? options.defaultFrom;
  let to = parseIsoDateParam(input.to) ?? options.defaultTo;

  if (from > maxDate) {
    from = maxDate;
  }
  if (to > maxDate) {
    to = maxDate;
  }
  if (from > to) {
    [from, to] = [to, from];
  }

  return {
    from,
    to,
    dayCount: dashboardRangeDayCount(from, to, timeZone),
    empty: false,
  };
}

/** KPI date range: defaults to salon-local today. */
export function resolveKpiDateRange(
  input: { from?: string; to?: string },
  timeZone: string,
): {
  from: string;
  to: string;
  dayCount: number;
  empty: boolean;
} {
  const { from, to } = resolveTodayDashboardDateRange(timeZone);
  return resolveDashboardDateRange(input, timeZone, {
    defaultFrom: from,
    defaultTo: to,
    maxDate: to,
  });
}

/** Order history date range: defaults to salon-local yesterday. */
export function resolveHistoryDateRange(
  input: { from?: string; to?: string },
  timeZone: string,
): {
  from: string;
  to: string;
  dayCount: number;
  empty: boolean;
} {
  const todayIso = todayIsoInTimeZone(timeZone);
  const yesterdayIso = addSalonLocalDays(todayIso, -1, timeZone);
  return resolveDashboardDateRange(input, timeZone, {
    defaultFrom: yesterdayIso,
    defaultTo: yesterdayIso,
    maxDate: todayIso,
  });
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

export function deliveryQueueWhere(
  shopId: string,
  start: Date,
  endExclusive: Date,
): Prisma.OrderWhereInput {
  return {
    shopId,
    fulfillmentType: "DELIVERY",
    status: { in: ["READY", "OUT_FOR_DELIVERY"] },
    requestedAt: { gte: start, lt: endExclusive },
  };
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
