import Link from "next/link";
import type { FulfillmentType, Prisma } from "@prisma/client";
import { ensureShopSeed } from "@/lib/bootstrap";
import {
  parseOrderStatus,
  resolveHistoryDateRange,
  salonLocalDateRangeBoundsUtc,
} from "@/lib/dashboard-query";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatSalonDateTimeDisplay, formatSalonTime, localeTagForLang, todayIsoInTimeZone } from "@/lib/timezone";
import { DashboardFilters } from "@/app/dashboard/dashboard-filters";
import {
  DashboardOrdersView,
  type DashboardOrderRow,
} from "@/app/dashboard/dashboard-orders-view";
import { DashboardNexalplaLogo } from "@/app/dashboard/dashboard-nexalpla-logo";
import { isDashboardLinkAuthAvailable } from "@/lib/dashboard-auth";

export default async function DashboardHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    lang?: string;
    from?: string;
    to?: string;
    status?: string;
    fulfillment?: string;
  }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);

  const filterLabels =
    lang === "el"
      ? {
          fromDate: "Από",
          toDate: "Έως",
          status: "Κατάσταση",
          fulfillment: "Τρόπος Παράδοσης",
          all: "Όλα",
          pickup: "TakeAway",
          delivery: "Delivery",
        }
      : {
          fromDate: "From",
          toDate: "To",
          status: "Status",
          fulfillment: "Type",
          all: "All",
          pickup: "Pickup",
          delivery: "Delivery",
        };

  const t =
    lang === "el"
      ? {
          title: "Ιστορικό παραγγελιών",
          back: "← Παραγγελίες",
          empty: "Δεν βρέθηκαν παραγγελίες σε αυτή την περίοδο.",
          pickup: "TakeAway",
          delivery: "Delivery",
          openMaps: "Άνοιγμα στο Maps",
          filters: filterLabels,
        }
      : {
          title: "Order history",
          back: "← Orders",
          empty: "No orders found for this period.",
          pickup: "Pickup",
          delivery: "Delivery",
          openMaps: "Open in Maps",
          filters: filterLabels,
        };

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return <p>No shop configured.</p>;
  }

  const todayIso = todayIsoInTimeZone(shop.timezone);
  const historyDefaults = resolveHistoryDateRange({}, shop.timezone);
  const { from, to } = resolveHistoryDateRange(params, shop.timezone);
  const intlLocale = localeTagForLang(lang);

  const { start, endExclusive } = salonLocalDateRangeBoundsUtc(from, to, shop.timezone);

  const where: Prisma.OrderWhereInput = {
    shopId: shop.id,
    requestedAt: { gte: start, lt: endExclusive },
  };

  const status = parseOrderStatus(params.status);
  if (status) where.status = status;

  if (params.fulfillment === "PICKUP" || params.fulfillment === "DELIVERY") {
    where.fulfillmentType = params.fulfillment as FulfillmentType;
  }

  const orders = await prisma.order.findMany({
    where,
    include: { customer: true, items: true },
    orderBy: { requestedAt: "desc" },
  });

  const rows: DashboardOrderRow[] = orders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      requestedAtDisplay: formatSalonDateTimeDisplay(order.requestedAt, shop.timezone, intlLocale),
      requestedTimeDisplay: formatSalonTime(order.requestedAt, shop.timezone, intlLocale),
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

  return (
    <div className="min-h-dvh bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl pr-16">
          <Link href={`/dashboard?lang=${lang}`} className="text-sm text-orange-600 underline">
            {t.back}
          </Link>
          <div className="mt-2">
            <h1 className="text-xl font-bold text-zinc-900">{t.title}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {!isDashboardLinkAuthAvailable() && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {lang === "el"
              ? "Πρόσβαση dashboard μόνο μέσω signed link."
              : "Dashboard access via signed link only."}
          </p>
        )}
        <DashboardFilters
          lang={lang}
          labels={t.filters}
          basePath="/dashboard/history"
          showPeriod
          maxDate={todayIso}
          periodDefaults={historyDefaults}
          current={{
            from,
            to,
            status: params.status ?? "all",
            fulfillment: params.fulfillment ?? "all",
          }}
        />
        <DashboardOrdersView
          readOnly
          orders={rows}
          lang={lang}
          labels={{
            empty: t.empty,
            delivery: t.delivery,
            pickup: t.pickup,
            openMaps: t.openMaps,
            moreItems: lang === "el" ? "ακόμα" : "more",
          }}
        />
      </main>
      <DashboardNexalplaLogo />
    </div>
  );
}
