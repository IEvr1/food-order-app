import { addHours, addMinutes } from "date-fns";
import type { Shop } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isShopClosedOnLocalDate } from "@/lib/shop-closure";
import {
  formatSalonTime,
  hourInTimeZone,
  isoDateInTimeZone,
  todayIsoInTimeZone,
  weekdayInTimeZone,
  zonedWallTimeToUtc,
} from "@/lib/timezone";

export const DEFAULT_PREP_BUFFER_MINUTES = 25;
export const DEFAULT_DELIVERY_PREP_BUFFER_MINUTES = 45;
export const CUSTOMER_MODIFY_GRACE_MINUTES = 4;
export const MANAGE_LINK_VIEW_BUFFER_MINUTES = 120;
export const MANAGE_LINK_ACTIVE_STATUS_HOURS = 24;
export const MANAGE_LINK_TERMINAL_SECONDS = 30 * 60;
export const MANAGE_LINK_MIN_SECONDS = 60;
export const MANAGE_LINK_MAX_SECONDS = 7 * 24 * 60 * 60;
/** ASAP orders set requestedAt at submit; scheduled slots are at least prepMinutes ahead. */
const ASAP_ORDER_THRESHOLD_MS = 2 * 60 * 1000;
/** @deprecated Use shop.prepMinutes or prepBufferMinutes(shop, type) */
export const PREP_BUFFER_MINUTES = DEFAULT_PREP_BUFFER_MINUTES;
/** @deprecated Use shop.deliveryPrepMinutes or prepBufferMinutes(shop, type) */
export const DELIVERY_PREP_BUFFER_MINUTES = DEFAULT_DELIVERY_PREP_BUFFER_MINUTES;
export const SLOT_INTERVAL_MINUTES = 15;

export type ShopPrepTimes = Pick<Shop, "prepMinutes" | "deliveryPrepMinutes">;

export function prepBufferMinutes(
  shop: ShopPrepTimes,
  fulfillmentType: "PICKUP" | "DELIVERY",
): number {
  return fulfillmentType === "DELIVERY" ? shop.deliveryPrepMinutes : shop.prepMinutes;
}

export type CartLineInput = {
  menuItemId: string;
  quantity: number;
};

export type ResolvedCartLine = {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
};

export function formatPriceEuros(cents: number, locale = "el-GR"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

export async function resolveCartLines(
  shopId: string,
  lines: CartLineInput[],
): Promise<{ ok: true; lines: ResolvedCartLine[]; subtotalCents: number } | { ok: false; error: string }> {
  if (lines.length === 0) {
    return { ok: false, error: "EMPTY_CART" };
  }

  const ids = [...new Set(lines.map((l) => l.menuItemId))];
  const items = await prisma.menuItem.findMany({
    where: { id: { in: ids }, active: true, category: { shopId, active: true } },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const resolved: ResolvedCartLine[] = [];
  for (const line of lines) {
    if (line.quantity < 1 || line.quantity > 99) {
      return { ok: false, error: "INVALID_QUANTITY" };
    }
    const item = itemMap.get(line.menuItemId);
    if (!item) {
      return { ok: false, error: "ITEM_NOT_FOUND" };
    }
    resolved.push({
      menuItemId: item.id,
      name: item.name,
      priceCents: item.priceCents,
      quantity: line.quantity,
      lineTotalCents: item.priceCents * line.quantity,
    });
  }

  const subtotalCents = resolved.reduce((sum, l) => sum + l.lineTotalCents, 0);
  return { ok: true, lines: resolved, subtotalCents };
}

export async function getNextOrderNumber(shopId: string, orderDate: string): Promise<number> {
  const last = await prisma.order.findFirst({
    where: { shopId, orderDate },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

export type SlotOption = { iso: string; label: string };

export async function listOrderTimeSlots(params: {
  shop: Pick<Shop, "id" | "timezone" | "prepMinutes" | "deliveryPrepMinutes">;
  dateIso: string;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  now?: Date;
}): Promise<SlotOption[]> {
  const { shop, dateIso } = params;
  const now = params.now ?? new Date();
  const prepMinutes = prepBufferMinutes(shop, params.fulfillmentType ?? "PICKUP");
  const timeZone = shop.timezone;

  if (await isShopClosedOnLocalDate(shop.id, dateIso)) {
    return [];
  }

  const weekday = weekdayInTimeZone(dateIso, timeZone);
  const hours = await prisma.shopHours.findFirst({
    where: { shopId: shop.id, weekday },
  });
  if (!hours) {
    return [];
  }

  const todayIso = todayIsoInTimeZone(timeZone, now);
  const slots: SlotOption[] = [];
  const locale = "el-GR";

  for (let hour = hours.startHour; hour < hours.endHour; hour += 1) {
    for (let minute = 0; minute < 60; minute += SLOT_INTERVAL_MINUTES) {
      if (hour === hours.endHour - 1 && minute + SLOT_INTERVAL_MINUTES > 60) {
        continue;
      }
      const slotStart = zonedWallTimeToUtc(dateIso, hour, minute, 0, timeZone);
      const earliest = addMinutes(now, prepMinutes);
      if (dateIso === todayIso && slotStart < earliest) {
        continue;
      }
      if (slotStart < now) {
        continue;
      }
      const endHour = minute + SLOT_INTERVAL_MINUTES >= 60 ? hour + 1 : hour;
      const endMinute = (minute + SLOT_INTERVAL_MINUTES) % 60;
      if (endHour >= hours.endHour) {
        continue;
      }
      slots.push({
        iso: slotStart.toISOString(),
        label: formatSalonTime(slotStart, timeZone, locale),
      });
    }
  }

  return slots;
}

function salonLocalMinutesSinceMidnight(instant: Date, timeZone: string): number {
  const hour = hourInTimeZone(instant, timeZone);
  const minute = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, minute: "2-digit" })
      .formatToParts(instant)
      .find((p) => p.type === "minute")?.value ?? 0,
  );
  return hour * 60 + minute;
}

export type RequestedAtValidationError = "SHOP_CLOSED" | "OUTSIDE_HOURS" | "TOO_SOON" | "PAST";

export async function validateRequestedAtTime(params: {
  shop: Pick<Shop, "id" | "timezone" | "prepMinutes" | "deliveryPrepMinutes">;
  requestedAt: Date;
  fulfillmentType?: "PICKUP" | "DELIVERY";
  now?: Date;
}): Promise<{ ok: true } | { ok: false; error: RequestedAtValidationError }> {
  const { shop, requestedAt } = params;
  const now = params.now ?? new Date();
  const prepMinutes = prepBufferMinutes(shop, params.fulfillmentType ?? "PICKUP");
  const timeZone = shop.timezone;
  const localDate = isoDateInTimeZone(requestedAt, timeZone);

  if (await isShopClosedOnLocalDate(shop.id, localDate)) {
    return { ok: false, error: "SHOP_CLOSED" };
  }

  if (requestedAt < now) {
    return { ok: false, error: "PAST" };
  }

  const todayIso = todayIsoInTimeZone(timeZone, now);
  const earliest = addMinutes(now, prepMinutes);
  if (localDate === todayIso && requestedAt < earliest) {
    return { ok: false, error: "TOO_SOON" };
  }

  const weekday = weekdayInTimeZone(localDate, timeZone);
  const hours = await prisma.shopHours.findFirst({
    where: { shopId: shop.id, weekday },
  });
  if (!hours) {
    return { ok: false, error: "OUTSIDE_HOURS" };
  }

  const requestMinutes = salonLocalMinutesSinceMidnight(requestedAt, timeZone);
  const startMinutes = hours.startHour * 60;
  const endMinutes = hours.endHour * 60;
  if (requestMinutes < startMinutes || requestMinutes >= endMinutes) {
    return { ok: false, error: "OUTSIDE_HOURS" };
  }

  return { ok: true };
}

export type CustomerManageOrder = {
  status: string;
  requestedAt: Date;
  createdAt: Date;
  fulfillmentType: string;
};

export function isAsapOrder(order: Pick<CustomerManageOrder, "requestedAt" | "createdAt">): boolean {
  return order.requestedAt.getTime() - order.createdAt.getTime() < ASAP_ORDER_THRESHOLD_MS;
}

export function getCustomerManageUntil(
  order: Pick<CustomerManageOrder, "requestedAt" | "createdAt" | "fulfillmentType">,
  shop: ShopPrepTimes,
): Date {
  if (isAsapOrder(order)) {
    return addMinutes(order.createdAt, CUSTOMER_MODIFY_GRACE_MINUTES);
  }
  const prep = prepBufferMinutes(shop, order.fulfillmentType as "PICKUP" | "DELIVERY");
  return addMinutes(order.requestedAt, -prep);
}

export function canCustomerManageOrder(
  order: CustomerManageOrder,
  shop: ShopPrepTimes,
  now: Date = new Date(),
): boolean {
  if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
    return false;
  }
  return now < getCustomerManageUntil(order, shop);
}

export type ManageLinkPurpose = "confirm" | "modify" | "status" | "reorder";

export type ManageLinkIntent = "manage" | "view" | "reorder";

export function getManageLinkIntent(
  order: Pick<CustomerManageOrder, "status"> | null,
  shop: ShopPrepTimes,
  now: Date = new Date(),
  canManage?: boolean,
): ManageLinkIntent {
  if (!order) return "reorder";
  if (order.status === "CANCELLED" || order.status === "COMPLETED") return "reorder";
  if (canManage ?? canCustomerManageOrder(order as CustomerManageOrder, shop, now)) {
    return "manage";
  }
  if (
    order.status === "PENDING" ||
    order.status === "CONFIRMED" ||
    order.status === "PREPARING" ||
    order.status === "READY" ||
    order.status === "OUT_FOR_DELIVERY"
  ) {
    return "view";
  }
  return "reorder";
}

export type ManageLinkOrder = CustomerManageOrder & {
  status: string;
  estimatedArrivalAt?: Date | null;
};

function clampManageLinkTtlSeconds(seconds: number): number {
  return Math.min(
    MANAGE_LINK_MAX_SECONDS,
    Math.max(MANAGE_LINK_MIN_SECONDS, Math.floor(seconds)),
  );
}

/** SMS manage-link TTL aligned with edit window and post-edit status viewing. */
export function getManageLinkTtlSeconds(
  order: ManageLinkOrder,
  shop: ShopPrepTimes,
  purpose: ManageLinkPurpose = "confirm",
  now: Date = new Date(),
): number {
  if (purpose === "reorder" || order.status === "CANCELLED" || order.status === "COMPLETED") {
    return MANAGE_LINK_TERMINAL_SECONDS;
  }

  if (order.status === "PENDING" || order.status === "CONFIRMED") {
    const expiresAt = addMinutes(
      getCustomerManageUntil(order, shop),
      MANAGE_LINK_VIEW_BUFFER_MINUTES,
    );
    return clampManageLinkTtlSeconds((expiresAt.getTime() - now.getTime()) / 1000);
  }

  let expiresAt: Date;
  if (order.status === "OUT_FOR_DELIVERY" && order.estimatedArrivalAt) {
    expiresAt = addMinutes(order.estimatedArrivalAt, MANAGE_LINK_VIEW_BUFFER_MINUTES);
  } else {
    expiresAt = addHours(now, MANAGE_LINK_ACTIVE_STATUS_HOURS);
  }
  return clampManageLinkTtlSeconds((expiresAt.getTime() - now.getTime()) / 1000);
}

export function orderUiPhase(
  order: CustomerManageOrder,
  shop: ShopPrepTimes,
  now: Date,
): "manageable" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled" {
  if (order.status === "CANCELLED") return "cancelled";
  if (order.status === "COMPLETED") return "completed";
  if (order.status === "OUT_FOR_DELIVERY") return "out_for_delivery";
  if (order.status === "READY") return "ready";
  if (order.status === "PREPARING") return "preparing";
  if (order.status === "PENDING" || order.status === "CONFIRMED") {
    return canCustomerManageOrder(order, shop, now) ? "manageable" : "confirmed";
  }
  return "completed";
}

export function serializeOrderItems(
  items: { nameSnapshot: string; priceCentsSnapshot: number; quantity: number }[],
) {
  return items.map((i) => ({
    name: i.nameSnapshot,
    priceCents: i.priceCentsSnapshot,
    quantity: i.quantity,
    lineTotalCents: i.priceCentsSnapshot * i.quantity,
  }));
}

export function orderDateForInstant(instant: Date, timeZone: string): string {
  return isoDateInTimeZone(instant, timeZone);
}

export function hourInShopTimeZone(instant: Date, timeZone: string): number {
  return hourInTimeZone(instant, timeZone);
}
