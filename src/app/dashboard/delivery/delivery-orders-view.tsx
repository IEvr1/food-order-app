"use client";

import {
  DashboardOrderCard,
  type DashboardOrderRow,
} from "@/app/dashboard/dashboard-orders-view";
import type { Locale } from "@/lib/locale";

export type DeliveryOrderRow = DashboardOrderRow;

export function DeliveryOrdersView({
  readyOrders,
  activeOrders,
  lang,
  labels,
}: {
  readyOrders: DeliveryOrderRow[];
  activeOrders: DeliveryOrderRow[];
  lang: Locale;
  labels: Record<string, string>;
}) {
  const empty = readyOrders.length === 0 && activeOrders.length === 0;

  if (empty) {
    return <p className="text-sm text-zinc-500">{labels.empty}</p>;
  }

  return (
    <div className="space-y-6">
      {activeOrders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-blue-700">
            {labels.sectionActive}
          </h2>
          <div className="space-y-2">
            {activeOrders.map((order) => (
              <DashboardOrderCard
                key={order.id}
                order={order}
                lang={lang}
                labels={labels}
                scope="delivery"
                deliveryExtras
              />
            ))}
          </div>
        </section>
      )}

      {readyOrders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            {labels.sectionReady}
          </h2>
          <div className="space-y-2">
            {readyOrders.map((order) => (
              <DashboardOrderCard
                key={order.id}
                order={order}
                lang={lang}
                labels={labels}
                scope="delivery"
                deliveryExtras
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
