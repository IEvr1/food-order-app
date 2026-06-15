"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { isDashboardMutationAuthorized } from "@/lib/dashboard-auth";
import { isDeliveryEnabled, validateDeliveryLocation } from "@/lib/delivery-zone";
import { parseLocale, type Locale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import {
  buildOrderStatusSms,
  messageKindFromStatusTransition,
} from "@/lib/order-messages";
import { sendBookingSms } from "@/lib/sms";
import { createSmsManageUrl } from "@/lib/sms-templates";

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

export async function updateOrderStatusFromDashboard(input: z.infer<typeof statusSchema>) {
  const data = statusSchema.parse(input);
  const lang = parseLocale(data.lang);

  const authError = await requireDashboardAuth(lang);
  if (authError) return authError;

  await ensureShopSeed();

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { customer: true, shop: true },
  });
  if (!order) {
    return { ok: false as const, error: "not_found" };
  }

  const newStatus = data.status as OrderStatus;
  if (order.status === newStatus) {
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/history");
    return { ok: true as const };
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: newStatus },
  });

  const messageKind = messageKindFromStatusTransition(
    newStatus,
    order.fulfillmentType,
    order.status,
  );
  let message: string | null = null;
  if (messageKind) {
    const manageUrl = await createSmsManageUrl({
      shopId: order.shopId,
      phoneE164: order.customer.phoneE164,
      orderId: order.id,
    });
    message = buildOrderStatusSms(messageKind, {
      shopName: order.shop.name,
      orderNumber: order.orderNumber,
      manageUrl,
      lang,
    });
  }

  if (message) {
    try {
      await sendBookingSms({ phoneE164: order.customer.phoneE164, body: message });
    } catch (error) {
      console.error("Status SMS failed", error);
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/history");
  return { ok: true as const };
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
