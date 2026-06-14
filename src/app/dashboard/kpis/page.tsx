import Link from "next/link";
import { ensureShopSeed } from "@/lib/bootstrap";
import { formatPriceEuros } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { salonLocalDayBoundsUtc, todayIsoInTimeZone } from "@/lib/timezone";

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  const locale = lang === "el" ? "el-GR" : "en-US";

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) return <p>No shop</p>;

  const today = todayIsoInTimeZone(shop.timezone);
  const { start, endExclusive } = salonLocalDayBoundsUtc(today, shop.timezone);

  const [todayOrders, todayRevenue, pickupCount, deliveryCount, customerCount] =
    await Promise.all([
      prisma.order.count({
        where: { shopId: shop.id, requestedAt: { gte: start, lt: endExclusive }, status: { not: "CANCELLED" } },
      }),
      prisma.order.aggregate({
        where: { shopId: shop.id, requestedAt: { gte: start, lt: endExclusive }, status: { not: "CANCELLED" } },
        _sum: { totalCents: true },
      }),
      prisma.order.count({
        where: {
          shopId: shop.id,
          requestedAt: { gte: start, lt: endExclusive },
          fulfillmentType: "PICKUP",
          status: { not: "CANCELLED" },
        },
      }),
      prisma.order.count({
        where: {
          shopId: shop.id,
          requestedAt: { gte: start, lt: endExclusive },
          fulfillmentType: "DELIVERY",
          status: { not: "CANCELLED" },
        },
      }),
      prisma.customer.count({ where: { shopId: shop.id } }),
    ]);

  const revenue = todayRevenue._sum.totalCents ?? 0;
  const avg = todayOrders > 0 ? Math.round(revenue / todayOrders) : 0;

  const t =
    lang === "el"
      ? {
          title: "KPIs",
          back: "← Dashboard",
          todayOrders: "Παραγγελίες σήμερα",
          revenue: "Έσοδα σήμερα",
          avg: "Μέση αξία",
          pickup: "Παραλαβή",
          delivery: "Delivery",
          customers: "Πελάτες",
        }
      : {
          title: "KPIs",
          back: "← Dashboard",
          todayOrders: "Orders today",
          revenue: "Revenue today",
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
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          [t.todayOrders, String(todayOrders)],
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
