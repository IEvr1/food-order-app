import { ensureShopSeed } from "@/lib/bootstrap";
import { isDashboardLinkAuthAvailable } from "@/lib/dashboard-auth";
import {
  deliveryQueueWhere,
  resolveTodayDashboardDateRange,
  salonLocalDateRangeBoundsUtc,
} from "@/lib/dashboard-query";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatSalonDateTimeDisplay, formatSalonTime, localeTagForLang } from "@/lib/timezone";
import { DashboardAutoRefresh } from "@/app/dashboard/dashboard-auto-refresh";
import { DashboardPwaInstall } from "@/app/dashboard/dashboard-pwa-install";
import type { DashboardOrderRow } from "@/app/dashboard/dashboard-orders-view";
import { DeliveryOrdersView } from "@/app/dashboard/delivery/delivery-orders-view";

export default async function DeliveryDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);

  const t =
    lang === "el"
      ? {
          title: "Delivery",
          today: "Σήμερα",
          empty: "Δεν υπάρχουν παραγγελίες για delivery.",
          delivery: "Delivery",
          pickup: "Pickup",
          openMaps: "Άνοιγμα στο Maps",
          sectionReady: "Έτοιμα για delivery",
          sectionActive: "Στο δρόμο",
          next_OUT_FOR_DELIVERY: "Στο δρόμο",
          next_COMPLETED: "Ολοκληρώθηκε",
          install: "Εγκατάσταση app",
          authHint: "Πρόσβαση delivery μόνο μέσω signed link.",
        }
      : {
          title: "Delivery",
          today: "Today",
          empty: "No delivery orders in the queue.",
          delivery: "Delivery",
          pickup: "Pickup",
          openMaps: "Open in Maps",
          sectionReady: "Ready for delivery",
          sectionActive: "On the way",
          next_OUT_FOR_DELIVERY: "On the way",
          next_COMPLETED: "Done",
          install: "Install app",
          authHint: "Delivery access via signed link only.",
        };

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return <p>No shop configured.</p>;
  }

  const { from, to } = resolveTodayDashboardDateRange(shop.timezone);
  const { start, endExclusive } = salonLocalDateRangeBoundsUtc(from, to, shop.timezone);
  const intlLocale = localeTagForLang(lang);

  const orders = await prisma.order.findMany({
    where: deliveryQueueWhere(shop.id, start, endExclusive),
    include: { customer: true, items: true },
    orderBy: { requestedAt: "asc" },
  });

  const fullRows: DashboardOrderRow[] = orders
    .filter((order) => order.status === "READY" || order.status === "OUT_FOR_DELIVERY")
    .map((order) => ({
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

  const activeOrders = fullRows
    .filter((o) => o.status === "OUT_FOR_DELIVERY")
    .sort((a, b) => a.orderNumber - b.orderNumber);
  const readyOrders = fullRows
    .filter((o) => o.status === "READY")
    .sort((a, b) => a.orderNumber - b.orderNumber);

  return (
    <div className="min-h-dvh bg-zinc-50">
      <DashboardAutoRefresh />
      <header className="border-b border-zinc-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-bold text-zinc-900">{shop.name}</h1>
          <p className="text-sm text-zinc-500">
            {t.title} · {t.today}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {!isDashboardLinkAuthAvailable() && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.authHint}</p>
        )}
        <DashboardPwaInstall label={t.install} />
        <DeliveryOrdersView
          readyOrders={readyOrders}
          activeOrders={activeOrders}
          lang={lang}
          labels={{
            empty: t.empty,
            delivery: t.delivery,
            pickup: t.pickup,
            openMaps: t.openMaps,
            sectionReady: t.sectionReady,
            sectionActive: t.sectionActive,
            next_OUT_FOR_DELIVERY: t.next_OUT_FOR_DELIVERY,
            next_COMPLETED: t.next_COMPLETED,
          }}
        />
      </main>
    </div>
  );
}
