"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateOrderStatusFromDashboard } from "@/app/dashboard/order-actions";
import type { Locale } from "@/lib/locale";
import { orderStatusLabel } from "@/lib/order-status-label";

export type DashboardOrderRow = {
  id: string;
  orderNumber: number;
  requestedAtDisplay: string;
  customerName: string;
  phoneE164: string;
  fulfillmentType: string;
  deliveryAddress: string | null;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryDistanceMeters: number | null;
  status: string;
  totalCents: number;
  totalDisplay: string;
  notes: string | null;
  items: { name: string; quantity: number; lineTotalCents: number }[];
};

const STATUS_FLOW: Record<string, string[]> = {
  PICKUP: ["CONFIRMED", "PREPARING", "READY", "COMPLETED"],
  DELIVERY: ["CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "COMPLETED"],
};

export function DashboardOrdersView({
  orders,
  lang,
  labels,
  readOnly = false,
}: {
  orders: DashboardOrderRow[];
  lang: Locale;
  labels: Record<string, string>;
  readOnly?: boolean;
}) {
  if (orders.length === 0) {
    return <p className="text-sm text-zinc-500">{labels.empty}</p>;
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} lang={lang} labels={labels} readOnly={readOnly} />
      ))}
    </div>
  );
}

function OrderCard({
  order,
  lang,
  labels,
  readOnly,
}: {
  order: DashboardOrderRow;
  lang: Locale;
  labels: Record<string, string>;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const flow = STATUS_FLOW[order.fulfillmentType] ?? STATUS_FLOW.PICKUP;
  const currentIdx = flow.indexOf(order.status);
  const nextStatus = currentIdx >= 0 && currentIdx < flow.length - 1
    ? (flow[currentIdx + 1] as "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED")
    : null;

  const setStatus = (status: "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED") => {
    startTransition(async () => {
      await updateOrderStatusFromDashboard({ orderId: order.id, status, lang });
      router.refresh();
    });
  };

  const mapsUrl =
    order.deliveryLat != null && order.deliveryLng != null
      ? `https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`
      : null;

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-zinc-900">#{order.orderNumber}</p>
          <p className="text-sm text-zinc-500">{order.requestedAtDisplay}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800">
            {order.fulfillmentType === "DELIVERY" ? labels.delivery : labels.pickup}
          </span>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            {orderStatusLabel(order.status, lang)}
          </span>
        </div>
      </div>

      <div className="mt-3 text-sm">
        <p className="font-medium text-zinc-900">{order.customerName}</p>
        <p className="text-zinc-600">{order.phoneE164}</p>
        {order.deliveryAddress && (
          <p className="mt-1 text-zinc-600">{order.deliveryAddress}</p>
        )}
        {mapsUrl && (
          <Link href={mapsUrl} target="_blank" className="mt-1 inline-block text-sm text-orange-600 underline">
            {labels.openMaps}
          </Link>
        )}
        {order.deliveryDistanceMeters != null && (
          <p className="text-xs text-zinc-500">
            {(order.deliveryDistanceMeters / 1000).toFixed(1)} km
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3 text-sm text-zinc-700">
        {order.items.map((item, i) => (
          <li key={i}>
            {item.quantity}× {item.name}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {order.notes}
        </p>
      )}

      <p className="mt-3 font-bold text-orange-600">{order.totalDisplay}</p>

      {!readOnly && (
        <div className="mt-4 flex flex-wrap gap-2">
          {nextStatus && order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus(nextStatus)}
              className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {labels[`next_${nextStatus}`] ?? nextStatus}
            </button>
          )}
          {order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus("CANCELLED")}
              className="rounded-xl border border-red-200 px-4 py-2 text-sm text-red-700 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
