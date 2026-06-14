/**
 * Convert a calendar date + wall clock time in a given IANA timezone to a UTC Date.
 * Uses Intl iteration (no extra deps) so server TZ does not affect salon-local days.
 */
export function zonedWallTimeToUtc(
  isoDate: string,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v));
  if (!y || !m || !d || Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) {
    throw new Error("Invalid date string (expected YYYY-MM-DD)");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  function readParts(instant: Date) {
    const parts = formatter.formatToParts(instant);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        map[p.type] = Number(p.value);
      }
    }
    return map;
  }

  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second, 0));

  for (let i = 0; i < 24; i += 1) {
    const got = readParts(guess);
    const targetUtc = Date.UTC(y, m - 1, d, hour, minute, second);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const drift = targetUtc - gotUtc;
    if (drift === 0) {
      return guess;
    }
    guess = new Date(guess.getTime() + drift);
  }

  throw new Error(`Could not resolve wall time in timezone ${timeZone}`);
}

/** Weekday 0–6 (Sunday–Saturday) for the given calendar date in the timezone. */
export function weekdayInTimeZone(isoDate: string, timeZone: string): number {
  const noon = zonedWallTimeToUtc(isoDate, 12, 0, 0, timeZone);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(noon);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const n = map[wd as keyof typeof map];
  if (n === undefined) {
    throw new Error("Unexpected weekday from Intl");
  }
  return n;
}

/**
 * Inclusive UTC start and exclusive UTC end for a salon-local calendar day.
 * Uses local noon as an anchor when stepping to the next calendar day to reduce DST edge issues.
 */
export function salonLocalDayBoundsUtc(isoDate: string, timeZone: string): { start: Date; endExclusive: Date } {
  const start = zonedWallTimeToUtc(isoDate, 0, 0, 0, timeZone);
  const noon = zonedWallTimeToUtc(isoDate, 12, 0, 0, timeZone);
  const nextDayIso = todayIsoInTimeZone(timeZone, new Date(noon.getTime() + 25 * 60 * 60 * 1000));
  const endExclusive = zonedWallTimeToUtc(nextDayIso, 0, 0, 0, timeZone);
  return { start, endExclusive };
}

/**
 * Inclusive UTC start (first instant of month) and exclusive UTC end (first instant of next month)
 * in the salon-local calendar (`month` is 1–12).
 */
export function salonLocalMonthBoundsUtc(
  year: number,
  month: number,
  timeZone: string,
): { start: Date; endExclusive: Date } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12");
  }
  const firstDayIso = `${year}-${pad(month)}-01`;
  const start = zonedWallTimeToUtc(firstDayIso, 0, 0, 0, timeZone);
  let nextYear = year;
  let nextMonth = month + 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }
  const nextFirstIso = `${nextYear}-${pad(nextMonth)}-01`;
  const endExclusive = zonedWallTimeToUtc(nextFirstIso, 0, 0, 0, timeZone);
  return { start, endExclusive };
}

/** Calendar `YYYY-MM-DD` for `instant` in the given IANA timezone (salon-local "today"). */
export function todayIsoInTimeZone(timeZone: string, instant: Date = new Date()): string {
  return isoDateInTimeZone(instant, timeZone);
}

/** Salon-local calendar date `YYYY-MM-DD` for a UTC instant in `timeZone`. */
export function isoDateInTimeZone(instant: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  if (!y || !m || !d) {
    throw new Error("Could not resolve calendar date in timezone");
  }
  return `${y}-${m}-${d}`;
}

function dateTimeParts(instant: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value;
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/** Salon-local datetime for SMS: `2026-05-15 14:30` (independent of server TZ). */
export function formatSalonDateTime(instant: Date, timeZone: string): string {
  const { year, month, day, hour, minute } = dateTimeParts(instant, timeZone);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error("Could not format datetime in timezone");
  }
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/** Salon-local hour 0–23 for grouping slots (morning / afternoon). */
export function hourInTimeZone(instant: Date, timeZone: string): number {
  const { hour } = dateTimeParts(instant, timeZone);
  if (hour === undefined) {
    throw new Error("Could not resolve hour in timezone");
  }
  // ICU may emit "24" at midnight when hour12 is false.
  return Number(hour) % 24;
}

/**
 * Wall-clock `YYYY-MM-DDTHH:mm:ss` for Google Calendar (no UTC offset).
 * Use with the matching `timeZone` field — do not combine with `.toISOString()` (Z).
 */
export function toSalonWallClockIso(instant: Date, timeZone: string): string {
  const { year, month, day, hour, minute } = dateTimeParts(instant, timeZone);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error("Could not format wall clock time in timezone");
  }
  const h = String(Number(hour) % 24).padStart(2, "0");
  return `${year}-${month}-${day}T${h}:${minute}:00`;
}

export function localeTagForLang(lang: "el" | "en"): string {
  return lang === "el" ? "el-CY" : "en-GB";
}

export function formatSalonDate(
  instant: Date,
  timeZone: string,
  locale = "el-CY",
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "long" }).format(instant);
}

export function formatSalonTime(
  instant: Date,
  timeZone: string,
  locale = "el-CY",
): string {
  return new Intl.DateTimeFormat(locale, { timeZone, timeStyle: "short" }).format(instant);
}

export function formatSalonDateTimeDisplay(
  instant: Date,
  timeZone: string,
  locale = "el-CY",
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(instant);
}

export type SalonSmsWhen = {
  day: string;
  date: string;
  time: string;
};

/** Friendly salon-local parts for SMS: e.g. Τρίτη / Tuesday, 30/05/26, 14:30 */
export function formatSalonSmsWhen(
  instant: Date,
  timeZone: string,
  lang: "el" | "en",
): SalonSmsWhen {
  const locale = localeTagForLang(lang);
  const { year, month, day, hour, minute } = dateTimeParts(instant, timeZone);
  if (!year || !month || !day || hour === undefined || minute === undefined) {
    throw new Error("Could not format datetime in timezone");
  }

  const dayName = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "long",
  }).format(instant);

  return {
    day: dayName.charAt(0).toLocaleUpperCase(locale) + dayName.slice(1),
    date: `${day}/${month}/${year.slice(-2)}`,
    time: `${String(Number(hour) % 24).padStart(2, "0")}:${minute}`,
  };
}
