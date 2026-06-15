import Link from "next/link";
import type { FulfillmentType, Prisma } from "@prisma/client";
import { ensureShopSeed } from "@/lib/bootstrap";
import {
  customerPhoneSearchWhere,
  parseOrderStatus,
  resolveTodayDashboardDateRange,
  salonLocalDateRangeBoundsUtc,
} from "@/lib/dashboard-query";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatSalonDateTimeDisplay, formatSalonTime, localeTagForLang } from "@/lib/timezone";
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
          fromDate: "Από",
          toDate: "Έως",
          status: "Κατάσταση",
          phone: "Τηλέφωνο",
          fulfillment: "Τύπος",
          all: "Όλα",
          apply: "Εφαρμογή",
          pickup: "TakeAway",
          delivery: "Delivery",
        }
      : {
          fromDate: "From",
          toDate: "To",
          status: "Status",
          phone: "Phone",
          fulfillment: "Type",
          all: "All",
          apply: "Apply",
          pickup: "Pickup",
          delivery: "Delivery",
        };

  const t =
    lang === "el"
      ? {
          title: "Παραγγελίες",
          today: "Σήμερα",
          empty: "Δεν βρέθηκαν παραγγελίες.",
          settings: "Ρυθμίσεις",
          kpis: "KPIs",
          closures: "Κλειστά",
          history: "Ιστορικό",
          pickup: "TakeAway",
          delivery: "Delivery",
          openMaps: "Άνοιγμα στο Maps",
          cancel: "Ακύρωση",
          cancelConfirm: "Ακύρωση παραγγελίας #{n}; Θα σταλεί SMS στον πελάτη.",
          moreItems: "ακόμα",
          next_PREPARING: "Προετοιμασία",
          next_ready_pickup: "Έτοιμη",
          next_OUT_FOR_DELIVERY: "Στο δρόμο",
          next_COMPLETED: "Ολοκληρώθηκε",
          filters: filterLabels,
        }
      : {
          title: "Orders",
          today: "Today",
          empty: "No orders found.",
          settings: "Settings",
          kpis: "KPIs",
          closures: "Closures",
          history: "History",
          pickup: "Pickup",
          delivery: "Delivery",
          openMaps: "Open in Maps",
          cancel: "Cancel",
          cancelConfirm: "Cancel order #{n}? An SMS will be sent to the customer.",
          moreItems: "more",
          next_PREPARING: "Prepare",
          next_ready_pickup: "Ready",
          next_OUT_FOR_DELIVERY: "On the way",
          next_COMPLETED: "Done",
          filters: filterLabels,
        };

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return <p>No shop configured.</p>;
  }

  const { from, to } = resolveTodayDashboardDateRange(shop.timezone);
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
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 pr-16">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{shop.name}</h1>
            <p className="text-sm text-zinc-500">
              {t.title} · {t.today}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href={`/dashboard/settings?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.settings}
            </Link>
            <Link href={`/dashboard/kpis?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.kpis}
            </Link>
            <Link href={`/dashboard/history?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.history}
            </Link>
            <Link href={`/dashboard/closures?lang=${lang}`} className="rounded-lg px-3 py-1.5 ring-1 ring-zinc-200">
              {t.closures}
            </Link>
          </nav>
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
        <DashboardPwaInstall label={lang === "el" ? "Εγκατάσταση app" : "Install app"} />
        <DashboardFilters
          lang={lang}
          labels={t.filters}
          basePath="/dashboard"
          current={{
            from: "",
            to: "",
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
            cancelConfirm: t.cancelConfirm,
            moreItems: t.moreItems,
            next_PREPARING: t.next_PREPARING,
            next_ready_pickup: t.next_ready_pickup,
            next_OUT_FOR_DELIVERY: t.next_OUT_FOR_DELIVERY,
            next_COMPLETED: t.next_COMPLETED,
          }}
        />
      </main>
      <DashboardNexalplaLogo />
    </div>
  );
}
