import type { Locale } from "@/lib/locale";

const STATUS_LABELS: Record<string, Record<Locale, string>> = {
  PENDING: { el: "Εκκρεμεί", en: "Pending" },
  CONFIRMED: { el: "Επιβεβαιωμένη", en: "Confirmed" },
  PREPARING: { el: "Σε προετοιμασία", en: "Preparing" },
  READY: { el: "Έτοιμη", en: "Ready" },
  OUT_FOR_DELIVERY: { el: "Στο δρόμο", en: "On the way" },
  COMPLETED: { el: "Ολοκληρώθηκε", en: "Completed" },
  CANCELLED: { el: "Ακυρώθηκε", en: "Cancelled" },
};

export const DASHBOARD_ORDER_STATUSES = [
  "CONFIRMED",
  "PREPARING",
  "READY",
  "OUT_FOR_DELIVERY",
  "COMPLETED",
  "CANCELLED",
] as const;

export function orderStatusLabel(status: string, lang: Locale): string {
  return STATUS_LABELS[status]?.[lang] ?? status;
}
