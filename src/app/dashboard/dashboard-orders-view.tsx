"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  updateOrderStatusFromDashboard,
  updateOrderStatusFromDelivery,
} from "@/app/dashboard/order-actions";
import type { Locale } from "@/lib/locale";
import { orderStatusLabel } from "@/lib/order-status-label";
import {
  getAvailableActions,
  getNextStatus,
  isWaitingForDriver,
  nextActionLabelKey,
  type ActionStatus,
  type DashboardScope,
} from "@/lib/order-status-flow";
import { formatPhoneDisplay } from "@/lib/phone";

export type DashboardOrderRow = {
  id: string;
  orderNumber: number;
  requestedAtDisplay: string;
  requestedTimeDisplay: string;
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

function statusAccent(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "PENDING":
      return "border-l-orange-500";
    case "PREPARING":
      return "border-l-amber-400";
    case "READY":
      return "border-l-emerald-500";
    case "OUT_FOR_DELIVERY":
      return "border-l-blue-500";
    case "COMPLETED":
      return "border-l-zinc-300";
    case "CANCELLED":
      return "border-l-red-300";
    default:
      return "border-l-zinc-200";
  }
}

function isInactiveStatus(status: string): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
    case "PENDING":
      return "bg-orange-50 text-orange-800";
    case "PREPARING":
      return "bg-amber-50 text-amber-900";
    case "READY":
      return "bg-emerald-50 text-emerald-800";
    case "OUT_FOR_DELIVERY":
      return "bg-blue-50 text-blue-800";
    case "COMPLETED":
      return "bg-zinc-100 text-zinc-600";
    case "CANCELLED":
      return "bg-red-50 text-red-700";
    default:
      return "bg-zinc-100 text-zinc-700";
  }
}

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
    <div className="space-y-2">
      {orders.map((order) => (
        <DashboardOrderCard
          key={order.id}
          order={order}
          lang={lang}
          labels={labels}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

function deliveryActionButtonClass(action: ActionStatus): string {
  switch (action) {
    case "OUT_FOR_DELIVERY":
      return "bg-blue-600 hover:bg-blue-700";
    case "COMPLETED":
      return "bg-emerald-600 hover:bg-emerald-700";
    default:
      return "bg-orange-600 hover:bg-orange-700";
  }
}

export function DashboardOrderCard({
  order,
  lang,
  labels,
  readOnly = false,
  scope = "kitchen",
  deliveryExtras = false,
}: {
  order: DashboardOrderRow;
  lang: Locale;
  labels: Record<string, string>;
  readOnly?: boolean;
  scope?: DashboardScope;
  deliveryExtras?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const actions = readOnly ? [] : getAvailableActions(order, scope);
  const nextStatus = scope === "kitchen" ? getNextStatus(order, scope) : null;

  const setStatus = (status: ActionStatus) => {
    startTransition(async () => {
      if (scope === "delivery") {
        await updateOrderStatusFromDelivery({ orderId: order.id, status, lang });
      } else {
        await updateOrderStatusFromDashboard({ orderId: order.id, status, lang });
      }
      router.refresh();
    });
  };

  const handleCancel = () => {
    const message =
      labels.cancelConfirm?.replace("#{n}", String(order.orderNumber)) ??
      `Cancel order #${order.orderNumber}?`;
    if (!window.confirm(message)) return;
    setStatus("CANCELLED");
  };

  const mapsUrl =
    order.deliveryLat != null && order.deliveryLng != null
      ? `https://www.google.com/maps?q=${order.deliveryLat},${order.deliveryLng}`
      : null;

  const isDelivery = order.fulfillmentType === "DELIVERY";
  const timeLabel = readOnly ? order.requestedAtDisplay : order.requestedTimeDisplay;
  const inactive = isInactiveStatus(order.status);
  const waitingForDriver = scope === "kitchen" && isWaitingForDriver(order);

  return (
    <article
      className={`flex overflow-hidden rounded-xl border border-zinc-200 border-l-4 bg-white shadow-sm ${statusAccent(order.status)} ${inactive ? "bg-zinc-50/80" : ""}`}
    >
      <div
        className={`flex w-16 shrink-0 flex-col items-center justify-center border-r border-zinc-200 px-2 py-3 sm:w-20 ${
          inactive ? "bg-zinc-100" : "bg-orange-50"
        }`}
        aria-label={`${labels.orderNumber ?? "Order"} ${order.orderNumber}`}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">#</span>
        <span
          className={`text-3xl font-black leading-none tabular-nums sm:text-4xl ${
            inactive ? "text-zinc-500" : "text-zinc-950"
          }`}
        >
          {order.orderNumber}
        </span>
      </div>

      <div className="min-w-0 flex-1 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm text-zinc-500">{timeLabel}</span>
            <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800">
              {isDelivery ? labels.delivery : labels.pickup}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(order.status)}`}
            >
              {orderStatusLabel(order.status, lang)}
            </span>
            {waitingForDriver && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                {labels.onDeliveryBoard}
              </span>
            )}
          </div>
          <span className="shrink-0 text-sm font-bold text-zinc-900">{order.totalDisplay}</span>
        </div>

        <p className="mt-1.5 truncate text-sm">
          <span className="font-medium text-zinc-600">{order.customerName}</span>
          <span className="text-zinc-400"> · </span>
          <span className="font-medium text-zinc-600">{formatPhoneDisplay(order.phoneE164)}</span>
        </p>

        <ul className="mt-2 space-y-0.5">
          {order.items.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className={`text-base font-bold leading-snug ${inactive ? "text-zinc-600" : "text-zinc-950"}`}
            >
              {item.quantity}× {item.name}
            </li>
          ))}
        </ul>

        {order.notes && (
          <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-sm font-semibold text-amber-950">
            {order.notes}
          </p>
        )}

        {isDelivery && order.deliveryAddress && (
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-zinc-600">
            <span className={deliveryExtras ? "text-sm font-semibold text-zinc-900" : "truncate"}>
              {order.deliveryAddress}
            </span>
            {order.deliveryDistanceMeters != null && (
              <span className="shrink-0 text-zinc-400">
                {(order.deliveryDistanceMeters / 1000).toFixed(1)} km
              </span>
            )}
            {mapsUrl && !deliveryExtras && (
              <Link href={mapsUrl} target="_blank" className="shrink-0 text-orange-600 underline">
                {labels.openMaps}
              </Link>
            )}
          </div>
        )}

        {deliveryExtras && isDelivery && (
          <div className="mt-2 flex flex-wrap gap-2">
            {mapsUrl && (
              <Link
                href={mapsUrl}
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
        )}

        {scope === "delivery" && actions.length > 0 && (
          <div className={`mt-2 flex gap-2 ${actions.length === 1 ? "" : "flex-col sm:flex-row"}`}>
            {actions.map((action) => (
              <button
                key={action}
                type="button"
                disabled={pending}
                onClick={() => setStatus(action)}
                className={`min-h-9 flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 ${deliveryActionButtonClass(action)}`}
              >
                {labels[nextActionLabelKey(order, action)] ?? action}
              </button>
            ))}
          </div>
        )}

        {scope === "kitchen" && !readOnly && nextStatus && (
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus(nextStatus)}
              className="min-h-9 flex-1 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {labels[nextActionLabelKey(order, nextStatus)] ?? nextStatus}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleCancel}
              className="min-h-9 shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-500 hover:border-red-200 hover:text-red-600 disabled:opacity-50"
            >
              {labels.cancel}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
