import { addMinutes } from "date-fns";
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

export const PREP_BUFFER_MINUTES = 25;
export const SLOT_INTERVAL_MINUTES = 15;

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
  shop: Pick<Shop, "id" | "timezone">;
  dateIso: string;
  now?: Date;
}): Promise<SlotOption[]> {
  const { shop, dateIso } = params;
  const now = params.now ?? new Date();
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
      const earliest = addMinutes(now, PREP_BUFFER_MINUTES);
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

export function canCustomerManageOrder(status: string): boolean {
  return status === "PENDING" || status === "CONFIRMED";
}

export function orderUiPhase(
  order: { status: string; requestedAt: Date },
  now: Date,
): "manageable" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled" {
  if (order.status === "CANCELLED") return "cancelled";
  if (order.status === "COMPLETED") return "completed";
  if (order.status === "OUT_FOR_DELIVERY") return "out_for_delivery";
  if (order.status === "READY") return "ready";
  if (order.status === "PREPARING") return "preparing";
  if (canCustomerManageOrder(order.status)) return "manageable";
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
