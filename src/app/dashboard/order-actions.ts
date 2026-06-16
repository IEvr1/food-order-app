"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import {
  isDashboardMutationAuthorized,
  isDeliveryMutationAuthorized,
} from "@/lib/dashboard-auth";
import { computeDeliveryEta } from "@/lib/delivery-eta";
import { isDeliveryEnabled, validateDeliveryLocation } from "@/lib/delivery-zone";
import { parseLocale, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import {
  buildOrderStatusSms,
  messageKindFromStatusTransition,
} from "@/lib/order-messages";
import { canTransition, type DashboardScope } from "@/lib/order-status-flow";
import { sendBookingSms } from "@/lib/sms";
import { createOrderManageUrl } from "@/lib/sms-templates";

const statusSchema = z.object({
  orderId: z.string(),
  status: z.enum([
    "CONFIRMED",
    "PREPARING",
    "READY",
    "OUT_FOR_DELIVERY",
    "COMPLETED",
    "CANCELLED",
  ]),
  lang: z.string().optional(),
});

const prepMinutesSchema = z.number().int().min(5).max(180);

const shopHourEntrySchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    startHour: z.number().int().min(0).max(23),
    endHour: z.number().int().min(1).max(24),
  })
  .refine((h) => h.endHour > h.startHour, { message: "endHour must be after startHour" });

const prepTimesSchema = z.object({
  prepMinutes: prepMinutesSchema,
  deliveryPrepMinutes: prepMinutesSchema,
  lang: z.string().optional(),
});

const settingsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  deliveryRadiusKm: z.number().min(0).max(15),
  prepMinutes: prepMinutesSchema,
  deliveryPrepMinutes: prepMinutesSchema,
  hours: z.array(shopHourEntrySchema),
  deliveryHours: z.array(shopHourEntrySchema),
  lang: z.string().optional(),
});

function unauthorizedMessage(lang: Locale) {
  return lang === "el"
    ? "Η ενέργεια απαιτεί έγκυρο dashboard link."
    : "This action requires a valid dashboard link.";
}

async function requireDashboardAuth(lang: Locale) {
  const h = await headers();
  if (!(await isDashboardMutationAuthorized(h))) {
    return { ok: false as const, error: unauthorizedMessage(lang) };
  }
  return null;
}

function deliveryUnauthorizedMessage(lang: Locale) {
  return lang === "el"
    ? "Η ενέργεια απαιτεί έγκυρο delivery link."
    : "This action requires a valid delivery link.";
}

async function requireDeliveryAuth(lang: Locale) {
  const h = await headers();
  if (!(await isDeliveryMutationAuthorized(h))) {
    return { ok: false as const, error: deliveryUnauthorizedMessage(lang) };
  }
  return null;
}

function invalidTransitionMessage(lang: Locale) {
  return lang === "el" ? "Μη έγκυρη αλλαγή κατάστασης." : "Invalid status transition.";
}

function revalidateOrderPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/delivery");
  revalidatePath("/dashboard/history");
}

async function applyOrderStatusUpdate(
  orderId: string,
  newStatus: OrderStatus,
  lang: Locale,
  scope: DashboardScope,
) {
  await ensureShopSeed();

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true, shop: true },
  });
  if (!order) {
    return { ok: false as const, error: "not_found" };
  }

  if (order.status === newStatus) {
    revalidateOrderPaths();
    return { ok: true as const };
  }

  const isCancel = newStatus === "CANCELLED";
  if (isCancel) {
    if (scope !== "kitchen") {
      return { ok: false as const, error: invalidTransitionMessage(lang) };
    }
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return { ok: false as const, error: invalidTransitionMessage(lang) };
    }
  } else if (!canTransition(order.status, newStatus, order.fulfillmentType, scope)) {
    return { ok: false as const, error: invalidTransitionMessage(lang) };
  }

  let deliveryEta: Awaited<ReturnType<typeof computeDeliveryEta>> = null;
  if (newStatus === "OUT_FOR_DELIVERY" && order.fulfillmentType === "DELIVERY") {
    deliveryEta = await computeDeliveryEta({
      shop: order.shop,
      delivery: { lat: order.deliveryLat, lng: order.deliveryLng },
      distanceMeters: order.deliveryDistanceMeters,
    });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: newStatus,
      ...(deliveryEta ? { estimatedArrivalAt: deliveryEta.estimatedArrivalAt } : {}),
    },
  });

  const messageKind = messageKindFromStatusTransition(
    newStatus,
    order.fulfillmentType,
    order.status,
  );
  let message: string | null = null;
  if (messageKind) {
    const manageUrl = await createOrderManageUrl({
      shopId: order.shopId,
      phoneE164: order.customer.phoneE164,
      orderId: order.id,
      order: {
        ...order,
        estimatedArrivalAt: deliveryEta?.estimatedArrivalAt ?? order.estimatedArrivalAt,
      },
      shop: order.shop,
      purpose: "status",
    });
    message = buildOrderStatusSms(messageKind, {
      shopName: order.shop.name,
      orderNumber: order.orderNumber,
      manageUrl,
      lang,
      shopTimezone: order.shop.timezone,
      deliveryEta: deliveryEta ?? undefined,
    });
  }

  if (message) {
    try {
      await sendBookingSms({ phoneE164: order.customer.phoneE164, body: message });
    } catch (error) {
      console.error("Status SMS failed", error);
    }
  }

  revalidateOrderPaths();
  return { ok: true as const };
}

export async function updateOrderStatusFromDashboard(input: z.infer<typeof statusSchema>) {
  const data = statusSchema.parse(input);
  const lang = parseLocale(data.lang);

  const authError = await requireDashboardAuth(lang);
  if (authError) return authError;

  return applyOrderStatusUpdate(data.orderId, data.status as OrderStatus, lang, "kitchen");
}

export async function updateOrderStatusFromDelivery(input: z.infer<typeof statusSchema>) {
  const data = statusSchema.parse(input);
  const lang = parseLocale(data.lang);

  const authError = await requireDeliveryAuth(lang);
  if (authError) return authError;

  if (data.status === "CANCELLED") {
    return { ok: false as const, error: invalidTransitionMessage(lang) };
  }

  return applyOrderStatusUpdate(data.orderId, data.status as OrderStatus, lang, "delivery");
}

export async function updateShopPrepTimes(input: z.infer<typeof prepTimesSchema>) {
  const data = prepTimesSchema.parse(input);
  const lang = parseLocale(data.lang);

  const authError = await requireDashboardAuth(lang);
  if (authError) return authError;

  await ensureShopSeed();

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return { ok: false as const, error: "no_shop" };
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      prepMinutes: data.prepMinutes,
      deliveryPrepMinutes: data.deliveryPrepMinutes,
    },
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/chat");
  return { ok: true as const };
}

export async function updateShopDeliverySettings(input: z.infer<typeof settingsSchema>) {
  const data = settingsSchema.parse(input);
  const lang = parseLocale(data.lang);

  const authError = await requireDashboardAuth(lang);
  if (authError) return authError;

  await ensureShopSeed();

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return { ok: false as const, error: "no_shop" };
  }

  await prisma.$transaction([
    prisma.shop.update({
      where: { id: shop.id },
      data: {
        latitude: data.latitude,
        longitude: data.longitude,
        deliveryRadiusMeters: Math.round(data.deliveryRadiusKm * 1000),
        prepMinutes: data.prepMinutes,
        deliveryPrepMinutes: data.deliveryPrepMinutes,
      },
    }),
    prisma.shopHours.deleteMany({ where: { shopId: shop.id } }),
    prisma.shopHours.createMany({
      data: data.hours.map((h) => ({
        shopId: shop.id,
        weekday: h.weekday,
        startHour: h.startHour,
        endHour: h.endHour,
      })),
    }),
    prisma.shopDeliveryHours.deleteMany({ where: { shopId: shop.id } }),
    prisma.shopDeliveryHours.createMany({
      data: data.deliveryHours.map((h) => ({
        shopId: shop.id,
        weekday: h.weekday,
        startHour: h.startHour,
        endHour: h.endHour,
      })),
    }),
  ]);

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  revalidatePath("/chat");
  return { ok: true as const, deliveryEnabled: isDeliveryEnabled({
    latitude: data.latitude,
    longitude: data.longitude,
    deliveryRadiusMeters: Math.round(data.deliveryRadiusKm * 1000),
  }) };
}

export async function validateShopDeliveryZone(lat: number, lng: number, lang?: string) {
  const locale = parseLocale(lang);
  const authError = await requireDashboardAuth(locale);
  if (authError) return authError;

  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) return { ok: false, error: "no_shop" };
  return validateDeliveryLocation(shop, { lat, lng });
}
