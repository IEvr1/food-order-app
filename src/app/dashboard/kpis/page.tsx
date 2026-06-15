import Link from "next/link";
import { ensureShopSeed } from "@/lib/bootstrap";
import {
  resolveKpiDateRange,
  resolveTodayDashboardDateRange,
  salonLocalDateRangeBoundsUtc,
} from "@/lib/dashboard-query";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { DashboardFilters } from "@/app/dashboard/dashboard-filters";

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  const locale = lang === "el" ? "el-GR" : "en-US";

  const filterLabels =
    lang === "el"
      ? {
          fromDate: "Από",
          toDate: "Έως",
          status: "Κατάσταση",
          fulfillment: "Τύπος",
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

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) return <p>No shop</p>;

  const periodDefaults = resolveTodayDashboardDateRange(shop.timezone);
  const { from, to } = resolveKpiDateRange(params, shop.timezone);

  const orderWhere = {
    shopId: shop.id,
    status: { not: "CANCELLED" as const },
  };

  const { start, endExclusive } = salonLocalDateRangeBoundsUtc(from, to, shop.timezone);
  const periodWhere = { ...orderWhere, requestedAt: { gte: start, lt: endExclusive } };

  const [orderCount, revenueAgg, pickupCount, deliveryCount, customerCount] = await Promise.all([
    prisma.order.count({ where: periodWhere }),
    prisma.order.aggregate({ where: periodWhere, _sum: { totalCents: true } }),
    prisma.order.count({ where: { ...periodWhere, fulfillmentType: "PICKUP" } }),
    prisma.order.count({ where: { ...periodWhere, fulfillmentType: "DELIVERY" } }),
    prisma.customer.count({ where: { shopId: shop.id } }),
  ]);

  const revenue = revenueAgg._sum.totalCents ?? 0;
  const avg = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

  const t =
    lang === "el"
      ? {
          title: "KPIs",
          back: "← Dashboard",
          orders: "Παραγγελίες",
          revenue: "Έσοδα",
          avg: "Μέση αξία",
          pickup: "TakeAway",
          delivery: "Delivery",
          customers: "Πελάτες",
        }
      : {
          title: "KPIs",
          back: "← Dashboard",
          orders: "Orders",
          revenue: "Revenue",
          avg: "Average order",
          pickup: "Pickup",
          delivery: "Delivery",
          customers: "Customers",
        };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href={`/dashboard?lang=${lang}`} className="text-sm text-orange-600 underline">
        {t.back}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t.title}</h1>
      <DashboardFilters
        lang={lang}
        labels={filterLabels}
        basePath="/dashboard/kpis"
        showPeriod
        periodOnly
        maxDate={periodDefaults.to}
        periodDefaults={periodDefaults}
        current={{
          from,
          to,
          status: "all",
          fulfillment: "all",
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          [t.orders, String(orderCount)],
          [t.revenue, formatPriceEuros(revenue, locale)],
          [t.avg, formatPriceEuros(avg, locale)],
          [t.pickup, String(pickupCount)],
          [t.delivery, String(deliveryCount)],
          [t.customers, String(customerCount)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold text-orange-600">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
