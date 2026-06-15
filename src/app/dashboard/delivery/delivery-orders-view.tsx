"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateOrderStatusFromDelivery } from "@/app/dashboard/order-actions";
import type { Locale } from "@/lib/locale";
import { getNextStatus, nextActionLabelKey } from "@/lib/order-status-flow";
import { orderStatusLabel } from "@/lib/order-status-label";
import { formatPhoneDisplay } from "@/lib/phone";

export type DeliveryOrderRow = {
  id: string;
  orderNumber: number;
  requestedTimeDisplay: string;
  phoneE164: string;
  fulfillmentType: "DELIVERY";
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  status: string;
  totalDisplay: string;
  notes: string | null;
  items: { name: string; quantity: number }[];
};

function mapsUrl(order: DeliveryOrderRow): string | null {
  if (order.deliveryLat == null || order.deliveryLng == null) return null;
  return `https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`;
}

function DeliveryOrderCard({
  order,
  lang,
  labels,
}: {
  order: DeliveryOrderRow;
  lang: Locale;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextStatus = getNextStatus(order, "delivery");
  const url = mapsUrl(order);

  const setStatus = () => {
    if (!nextStatus) return;
    startTransition(async () => {
      await updateOrderStatusFromDelivery({ orderId: order.id, status: nextStatus, lang });
      router.refresh();
    });
  };

  const isActive = order.status === "OUT_FOR_DELIVERY";

  return (
    <article
      className={`overflow-hidden rounded-xl border border-zinc-200 border-l-4 bg-white shadow-sm ${
        isActive ? "border-l-blue-500" : "border-l-emerald-500"
      }`}
    >
      <div className="flex">
        <div
          className={`flex w-16 shrink-0 flex-col items-center justify-center border-r border-zinc-200 px-2 py-3 ${
            isActive ? "bg-blue-50" : "bg-emerald-50"
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">#</span>
          <span className="text-3xl font-black leading-none tabular-nums text-zinc-950">
            {order.orderNumber}
          </span>
        </div>

        <div className="min-w-0 flex-1 px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-zinc-600">{order.requestedTimeDisplay}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  isActive ? "bg-blue-50 text-blue-800" : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {orderStatusLabel(order.status, lang)}
              </span>
            </div>
            <span className="text-base font-bold text-zinc-900">{order.totalDisplay}</span>
          </div>

          {order.deliveryAddress && (
            <p className="mt-2 text-base font-semibold leading-snug text-zinc-900">
              {order.deliveryAddress}
            </p>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {url && (
              <Link
                href={url}
                target="_blank"
                className="inline-flex min-h-10 items-center rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white"
              >
                {labels.openMaps}
              </Link>
            )}
            <a
              href={`tel:${order.phoneE164}`}
              className="inline-flex min-h-10 items-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800"
            >
              {formatPhoneDisplay(order.phoneE164)}
            </a>
          </div>

          <ul className="mt-3 space-y-0.5">
            {order.items.map((item, index) => (
              <li key={`${item.name}-${index}`} className="text-sm font-medium text-zinc-800">
                {item.quantity}× {item.name}
              </li>
            ))}
          </ul>

          {order.notes && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm font-semibold text-amber-950">
              {order.notes}
            </p>
          )}

          {nextStatus && (
            <button
              type="button"
              disabled={pending}
              onClick={setStatus}
              className={`mt-3 min-h-11 w-full rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                isActive ? "bg-zinc-800" : "bg-orange-600"
              }`}
            >
              {labels[nextActionLabelKey(order, nextStatus)] ?? nextStatus}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

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
              <DeliveryOrderCard key={order.id} order={order} lang={lang} labels={labels} />
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
              <DeliveryOrderCard key={order.id} order={order} lang={lang} labels={labels} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
