import type { Locale } from "@/lib/locale";

/** Sunday=0 … Saturday=6 — matches `weekdayInTimeZone`. */
export const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Monday-first display order for settings UI. */
export const WEEKDAY_DISPLAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export type ShopHourEntry = {
  weekday: number;
  startHour: number;
  endHour: number;
};

export function weekdayLabels(lang: Locale): Record<number, string> {
  if (lang === "el") {
    return {
      0: "Κυριακή",
      1: "Δευτέρα",
      2: "Τρίτη",
      3: "Τετάρτη",
      4: "Πέμπτη",
      5: "Παρασκευή",
      6: "Σάββατο",
    };
  }
  return {
    0: "Sunday",
    1: "Monday",
    2: "Tuesday",
    3: "Wednesday",
    4: "Thursday",
    5: "Friday",
    6: "Saturday",
  };
}

export function formatShopHour(hour: number, lang: Locale): string {
  const h = String(hour).padStart(2, "0");
  return `${h}:00`;
}

export function defaultShopHours(): ShopHourEntry[] {
  return WEEKDAY_NUMBERS.map((weekday) => ({
    weekday,
    startHour: 11,
    endHour: 23,
  }));
}
