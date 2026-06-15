import type { FulfillmentType, OrderStatus } from "@prisma/client";
import type { Locale } from "@/lib/locale";
import type { SalonSmsWhen } from "@/lib/timezone";
import {
  buildOrderCancelledSms,
  buildOrderOutForDeliverySms,
  buildOrderReadySms,
} from "@/lib/sms-templates";

/** Customer-facing notification kinds — maps status transitions to SMS templates. */
export type CustomerMessageKind =
  | "ORDER_RECEIVED"
  | "ORDER_READY_PICKUP"
  | "ORDER_ON_THE_WAY"
  | "ORDER_CANCELLED"
  | "ORDER_UPDATED";

type StatusSmsBase = {
  shopName: string;
  orderNumber: number;
  manageUrl: string;
  lang: Locale;
  when?: SalonSmsWhen;
};

/**
 * Pick SMS kind after a dashboard status change.
 * ORDER_RECEIVED is sent at order creation; ORDER_UPDATED on item edits.
 */
export function messageKindFromStatusTransition(
  newStatus: OrderStatus,
  fulfillmentType: FulfillmentType,
): CustomerMessageKind | null {
  switch (newStatus) {
    case "READY":
      return fulfillmentType === "PICKUP" ? "ORDER_READY_PICKUP" : null;
    case "OUT_FOR_DELIVERY":
      return "ORDER_ON_THE_WAY";
    case "CANCELLED":
      return "ORDER_CANCELLED";
    default:
      return null;
  }
}

export function buildOrderStatusSms(
  kind: CustomerMessageKind,
  params: StatusSmsBase,
): string | null {
  const base = {
    shopName: params.shopName,
    orderNumber: params.orderNumber,
    manageUrl: params.manageUrl,
    lang: params.lang,
  };

  switch (kind) {
    case "ORDER_READY_PICKUP":
      return buildOrderReadySms(base);
    case "ORDER_ON_THE_WAY":
      return buildOrderOutForDeliverySms(base);
    case "ORDER_CANCELLED":
      return buildOrderCancelledSms({ ...base, when: params.when });
  }

  return null;
}
