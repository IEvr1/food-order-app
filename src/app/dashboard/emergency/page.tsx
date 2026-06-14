import Link from "next/link";
import { ensureShopSeed } from "@/lib/bootstrap";
import { isDashboardLinkAuthAvailable } from "@/lib/dashboard-auth";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { salonLocalDayBoundsUtc, todayIsoInTimeZone } from "@/lib/timezone";
import { DashboardEmergencyPanel } from "@/app/dashboard/dashboard-emergency-panel";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DashboardEmergencyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; date?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  const t =
    lang === "el"
      ? {
          title: "Έκτακτη ακύρωση ημέρας",
          subtitle: "Ακυρώστε μαζικά όλες τις ενεργές παραγγελίες μιας ημέρας και στείλτε SMS.",
          back: "← Dashboard",
          noShop: "Δεν υπάρχει κατάστημα.",
          day: "Ημέρα",
          refresh: "Ενημέρωση",
          mutationsOff: "Απενεργοποιημένο μέχρι να οριστεί DASHBOARD_LINK_SECRET.",
          emergency: {
            button: "Έκτακτη ακύρωση ημέρας…",
            dayExplanation: "Ενεργές παραγγελίες την επιλεγμένη ημέρα.",
            step1Title: "Έκτακτη ακύρωση όλων των παραγγελιών της ημέρας",
            step1Continue: "Συνέχεια",
            step1Back: "Άκυρο",
            step2Title: "Οριστική επιβεβαίωση",
            step2Checkbox:
              "Καταλαβαίνω ότι όλες οι ενεργές παραγγελίες της επιλεγμένης ημέρας θα ακυρωθούν και θα σταλεί SMS.",
            step2Placeholder: "ΑΚΥΡΩΣΗ",
            step2Hint: "Πληκτρολογήστε ΑΚΥΡΩΣΗ για επιβεβαίωση:",
            step2Execute: "Εκτέλεση",
            step2Back: "Πίσω",
            working: "Περιμένετε…",
            resultTitle: "Αποτέλεσμα",
            resultCancelled: "Επιτυχείς ακυρώσεις",
            resultAttempted: "Σύνολο που βρέθηκαν",
            resultSmsSent: "SMS που στάλθηκαν",
            resultSmsFailures: "Αποτυχίες SMS",
            resultCalendarFailures: "Άλλες αποτυχίες",
            close: "Κλείσιμο",
          },
        }
      : {
          title: "Emergency cancel day",
          subtitle: "Bulk-cancel active orders for a day and send SMS.",
          back: "← Dashboard",
          noShop: "No shop configured.",
          day: "Day",
          refresh: "Refresh",
          mutationsOff: "Disabled until DASHBOARD_LINK_SECRET is set.",
          emergency: {
            button: "Emergency cancel day…",
            dayExplanation: "Active orders on the selected day.",
            step1Title: "Emergency cancel all orders for this day",
            step1Continue: "Continue",
            step1Back: "Cancel",
            step2Title: "Final confirmation",
            step2Checkbox:
              "I understand all active orders on the selected day will be cancelled and customers will receive SMS.",
            step2Placeholder: "CANCEL",
            step2Hint: "Type CANCEL to confirm:",
            step2Execute: "Execute",
            step2Back: "Back",
            working: "Please wait…",
            resultTitle: "Result",
            resultCancelled: "Successful cancellations",
            resultAttempted: "Orders found",
            resultSmsSent: "SMS sent",
            resultSmsFailures: "SMS failures",
            resultCalendarFailures: "Other failures",
            close: "Close",
          },
        };

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-sm text-red-600">{t.noShop}</p>
      </div>
    );
  }

  const todayStr = todayIsoInTimeZone(shop.timezone);
  const dateParam = params.date?.trim();
  const dateStr = dateParam && ISO_DATE.test(dateParam) ? dateParam : todayStr;
  const { start, endExclusive } = salonLocalDayBoundsUtc(dateStr, shop.timezone);
  const activeDayCount = await prisma.order.count({
    where: {
      shopId: shop.id,
      requestedAt: { gte: start, lt: endExclusive },
      status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/dashboard?lang=${lang}`} className="text-sm text-orange-600 underline">
        {t.back}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-sm text-zinc-600">{t.subtitle}</p>
      <DashboardEmergencyPanel
        lang={lang}
        filterDate={dateStr}
        activeDayCount={activeDayCount}
        mutationsAllowed={isDashboardLinkAuthAvailable()}
        labels={t.emergency}
      />
    </div>
  );
}
