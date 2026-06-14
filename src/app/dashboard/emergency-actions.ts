"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import type { Locale } from "@/lib/locale";
import { isDashboardMutationAuthorized } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/prisma";
import { sendBookingSms } from "@/lib/sms";
import {
  buildOrderCancelledSms,
  createSmsManageUrl,
  resolveOrderLocale,
} from "@/lib/sms-templates";
import { salonLocalDayBoundsUtc } from "@/lib/timezone";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function unauthorizedMessage(lang: Locale) {
  return lang === "el"
    ? "Η ενέργεια απαιτεί έγκυρο dashboard link."
    : "This action requires a valid dashboard link.";
}

export async function emergencyCancelDayAndNotify(isoDate: string, lang: Locale) {
  const h = await headers();
  if (!(await isDashboardMutationAuthorized(h))) {
    return { ok: false as const, error: unauthorizedMessage(lang) };
  }

  try {
    dateSchema.parse(isoDate);
  } catch {
    return { ok: false as const, error: lang === "el" ? "Μη έγκυρη ημερομηνία." : "Invalid date." };
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return { ok: false as const, error: lang === "el" ? "Δεν υπάρχει κατάστημα." : "No shop configured." };
  }

  const { start, endExclusive } = salonLocalDayBoundsUtc(isoDate, shop.timezone);

  const orders = await prisma.order.findMany({
    where: {
      shopId: shop.id,
      requestedAt: { gte: start, lt: endExclusive },
      status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
    },
    include: { customer: true },
    orderBy: { requestedAt: "asc" },
  });

  let smsFailures = 0;
  const cancelledIds: string[] = [];

  for (const order of orders) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });
    cancelledIds.push(order.id);

    const orderLang = resolveOrderLocale(order.locale);
    const manageUrl = await createSmsManageUrl({
      shopId: shop.id,
      phoneE164: order.customer.phoneE164,
      orderId: order.id,
    });
    const message = buildOrderCancelledSms({
      shopName: shop.name,
      orderNumber: order.orderNumber,
      manageUrl,
      lang: orderLang,
    });

    try {
      await sendBookingSms({ phoneE164: order.customer.phoneE164, body: message });
    } catch {
      smsFailures += 1;
    }
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/emergency");

  return {
    ok: true as const,
    cancelled: cancelledIds.length,
    attempted: orders.length,
    smsSent: cancelledIds.length - smsFailures,
    smsFailures,
    calendarFailures: 0,
  };
}
