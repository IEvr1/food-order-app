import Link from "next/link";
import type { FulfillmentType, Prisma } from "@prisma/client";
import { ensureShopSeed } from "@/lib/bootstrap";
import {
  customerPhoneSearchWhere,
  formatDashboardDateRangeSummary,
  parseOrderStatus,
  resolveDashboardDateRange,
  salonLocalDateRangeBoundsUtc,
} from "@/lib/dashboard-query";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatSalonDateTimeDisplay, localeTagForLang } from "@/lib/timezone";
import { DashboardFilters } from "@/app/dashboard/dashboard-filters";
import {
  DashboardOrdersView,
  type DashboardOrderRow,
} from "@/app/dashboard/dashboard-orders-view";
import { DashboardNexalplaLogo } from "@/app/dashboard/dashboard-nexalpla-logo";
import { DashboardPwaInstall } from "@/app/dashboard/dashboard-pwa-install";
import { isDashboardLinkAuthAvailable } from "@/lib/dashboard-auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    lang?: string;
    range?: string;
    status?: string;
    phone?: string;
    fulfillment?: string;
  }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);

  const filterLabels =
    lang === "el"
      ? {
          period: "Περίοδος",
          status: "Κατάσταση",
          phone: "Τηλέφωνο",
          fulfillment: "Τύπος",
          all: "Όλα",
          apply: "Εφαρμογή",
          pickup: "Παραλαβή",
          delivery: "Delivery",
          rangeToday: "Σήμερα",
          rangeTomorrow: "Αύριο",
          rangeNext3: "Επόμενες 3 ημέρες",
          rangeWeek7: "Επόμενες 7 ημέρες",
          rangeRemainingMonth: "Υπολοιπόμενος μήνας",
          rangeCurrentMonth: "Τρέχων μήνας",
          rangeLastMonth: "Περασμένος μήνας",
        }
      : {
          period: "Period",
          status: "Status",
          phone: "Phone",
          fulfillment: "Type",
          all: "All",
          apply: "Apply",
          pickup: "Pickup",
          delivery: "Delivery",
          rangeToday: "Today",
          rangeTomorrow: "Tomorrow",
          rangeNext3: "Next 3 days",
          rangeWeek7: "Next 7 days",
          rangeRemainingMonth: "Rest of month",
          rangeCurrentMonth: "Current month",
          rangeLastMonth: "Last month",
        };

  const t =
    lang === "el"
      ? {
          title: "Παραγγελίες",
          empty: "Δεν βρέθηκαν παραγγελίες.",
          settings: "Ρυθμίσεις",
          kpis: "KPIs",
          closures: "Κλειστά",
          emergency: "Έκτακτα",
          pickup: "Παραλαβή",
          delivery: "Delivery",
          openMaps: "Άνοιγμα στο Maps",
          cancel: "Ακύρωση",
          next_PREPARING: "Έναρξη προετοιμασίας",
          next_READY: "Έτοιμη",
          next_OUT_FOR_DELIVERY: "Στο δρόμο",
          next_COMPLETED: "Ολοκληρώθηκε",
          filters: filterLabels,
        }
      : {
          title: "Orders",
          empty: "No orders found.",
          settings: "Settings",
          kpis: "KPIs",
          closures: "Closures",
          emergency: "Emergency",
          pickup: "Pickup",
          delivery: "Delivery",
          openMaps: "Open in Maps",
          cancel: "Cancel",
          next_PREPARING: "Start preparing",
          next_READY: "Ready",
          next_OUT_FOR_DELIVERY: "Out for delivery",
          next_COMPLETED: "Complete",
          filters: filterLabels,
        };

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return <p>No shop configured.</p>;
  }

  const { from, to, preset } = resolveDashboardDateRange(params, shop.timezone);
  const { start, endExclusive } = salonLocalDateRangeBoundsUtc(from, to, shop.timezone);
  const intlLocale = localeTagForLang(lang);

  const where: Prisma.OrderWhereInput = {
    shopId: shop.id,
    requestedAt: { gte: start, lt: endExclusive },
  };

  const status = parseOrderStatus(params.status);
  if (status) where.status = status;

  if (params.fulfillment === "PICKUP" || params.fulfillment === "DELIVERY") {
    where.fulfillmentType = params.fulfillment as FulfillmentType;
  }

  const phoneWhere = customerPhoneSearchWhere(params.phone);
  if (phoneWhere) {
    where.customer = phoneWhere;
  }

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, items: true },
    orderBy: { requestedAt: "asc" },
  });

  const rows: DashboardOrderRow[] = orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    requestedAtDisplay: formatSalonDateTimeDisplay(order.requestedAt, shop.timezone, intlLocale),
    customerName: order.customer.name,
    phoneE164: order.customer.phoneE164,
    fulfillmentType: order.fulfillmentType,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    deliveryDistanceMeters: order.deliveryDistanceMeters,
    status: order.status,
    totalCents: order.totalCents,
    totalDisplay: formatPriceEuros(order.totalCents, intlLocale),
    notes: order.notes,
    items: order.items.map((i) => ({
      name: i.nameSnapshot,
      quantity: i.quantity,
      lineTotalCents: i.priceCentsSnapshot * i.quantity,
    })),
  }));

  const rangeSummary = formatDashboardDateRangeSummary(from, to, lang, shop.timezone);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{shop.name}</h1>
            <p className="text-sm text-zinc-500">
              {t.title} · {rangeSummary}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href={`/dashboard/settings?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.settings}
            </Link>
            <Link href={`/dashboard/kpis?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.kpis}
            </Link>
            <Link href={`/dashboard/closures?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.closures}
            </Link>
            <Link href={`/dashboard/emergency?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.emergency}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!isDashboardLinkAuthAvailable() && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Dashboard access via signed link only.
          </p>
        )}
        <DashboardPwaInstall label={lang === "el" ? "Εγκατάσταση app" : "Install app"} />
        <DashboardFilters
          lang={lang}
          labels={t.filters}
          current={{
            range: preset,
            status: params.status ?? "all",
            phone: params.phone ?? "",
            fulfillment: params.fulfillment ?? "all",
          }}
        />
        <DashboardOrdersView
          orders={rows}
          lang={lang}
          labels={{
            empty: t.empty,
            delivery: t.delivery,
            pickup: t.pickup,
            openMaps: t.openMaps,
            cancel: t.cancel,
            next_PREPARING: t.next_PREPARING,
            next_READY: t.next_READY,
            next_OUT_FOR_DELIVERY: t.next_OUT_FOR_DELIVERY,
            next_COMPLETED: t.next_COMPLETED,
          }}
        />
      </main>
      <DashboardNexalplaLogo />
    </div>
  );
}
