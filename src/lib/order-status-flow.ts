import type { FulfillmentType, OrderStatus } from "@prisma/client";

export type DashboardScope = "kitchen" | "delivery";

export type ActionStatus = "PREPARING" | "READY" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELLED";

type OrderForStatusFlow = {
  fulfillmentType: FulfillmentType | string;
  status: string;
};

export function getNextStatus(
  order: OrderForStatusFlow,
  scope: DashboardScope,
): ActionStatus | null {
  if (order.status === "CANCELLED" || order.status === "COMPLETED") {
    return null;
  }

  const isDelivery = order.fulfillmentType === "DELIVERY";

  if (scope === "delivery") {
    if (!isDelivery) return null;
    if (order.status === "READY") return "OUT_FOR_DELIVERY";
    if (order.status === "OUT_FOR_DELIVERY") return "COMPLETED";
    return null;
  }

  if (isDelivery) {
    if (order.status === "CONFIRMED" || order.status === "PENDING") return "PREPARING";
    if (order.status === "PREPARING") return "READY";
    if (order.status === "OUT_FOR_DELIVERY") return "COMPLETED";
    return null;
  }

  if (order.status === "CONFIRMED" || order.status === "PENDING") return "PREPARING";
  if (order.status === "PREPARING" || order.status === "READY") return "COMPLETED";
  return null;
}

export function canTransition(
  from: OrderStatus | string,
  to: OrderStatus | string,
  fulfillmentType: FulfillmentType | string,
  scope: DashboardScope,
): boolean {
  return getNextStatus({ fulfillmentType, status: from }, scope) === to;
}

export function nextActionLabelKey(
  order: OrderForStatusFlow,
  nextStatus: ActionStatus,
): string {
  if (nextStatus === "PREPARING") return "next_PREPARING";
  if (nextStatus === "READY") return "next_READY_delivery";
  if (nextStatus === "OUT_FOR_DELIVERY") return "next_OUT_FOR_DELIVERY";
  if (nextStatus === "COMPLETED") {
    return order.fulfillmentType === "PICKUP" ? "next_ready_pickup" : "next_COMPLETED";
  }
  return nextStatus;
}

export function isWaitingForDriver(order: OrderForStatusFlow): boolean {
  return order.fulfillmentType === "DELIVERY" && order.status === "READY";
}
