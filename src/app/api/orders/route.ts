import { NextResponse } from "next/server";
import { FulfillmentType, Prisma } from "@prisma/client";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { validateDeliveryLocation } from "@/lib/delivery-zone";
import {
  getNextOrderNumber,
  orderDateForInstant,
  resolveCartLines,
  validateRequestedAtTime,
} from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { normalizePhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { sendBookingSms } from "@/lib/sms";
import {
  buildOrderConfirmedSms,
  createOrderManageUrl,
  smsWhenFromInstant,
} from "@/lib/sms-templates";
import { zonedWallTimeToUtc } from "@/lib/timezone";

const cartLineSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(99),
});

const orderSchema = z
  .object({
    items: z.array(cartLineSchema).min(1),
    fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
    timing: z.enum(["ASAP", "SCHEDULED"]).default("ASAP"),
    scheduledDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    scheduledTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    name: z.string().min(2),
    phone: z.string().min(8),
    notes: z.string().max(500).optional(),
    deliveryAddress: z.string().max(500).optional(),
    deliveryLat: z.number().optional(),
    deliveryLng: z.number().optional(),
    deliveryPlaceId: z.string().optional(),
    lang: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.timing === "SCHEDULED" && (!data.scheduledDate || !data.scheduledTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scheduledDate and scheduledTime required for scheduled orders",
      });
    }
  });

export async function POST(request: Request) {
  await ensureShopSeed();

  if (process.env.NODE_ENV === "production" && !process.env.SMS_LINK_SECRET) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let payload: z.infer<typeof orderSchema>;
  try {
    payload = orderSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const lang = parseLocale(payload.lang);
  const t =
    lang === "el"
      ? {
          noShop: "Δεν υπάρχει ρυθμισμένο κατάστημα.",
          emptyCart: "Το καλάθι είναι άδειο.",
          invalidPhone:
            "Βάλτε έγκυρο κυπριακό κινητό: 8 ψηφία (π.χ. 99XXXXXX χωρίς +357).",
          shopClosed: "Το κατάστημα είναι κλειστά αυτή την ημερομηνία.",
          outsideHours: "Η ώρα είναι εκτός ωραρίου λειτουργίας.",
          tooSoon: "Η ώρα είναι πολύ σύντομα. Δοκιμάστε αργότερα.",
          pastTime: "Η ώρα έχει περάσει.",
          shopClosedNow: "Το κατάστημα είναι κλειστά αυτή τη στιγμή.",
          deliveryRequired: "Απαιτείται διεύθυνση και τοποθεσία για delivery.",
          outOfZone: "Δεν παραδίδουμε σε αυτή την περιοχή.",
          deliveryDisabled: "Το delivery δεν είναι διαθέσιμο αυτή τη στιγμή.",
          orderFailed: "Η παραγγελία απέτυχε. Δοκιμάστε ξανά.",
        }
      : {
          noShop: "No shop configured",
          emptyCart: "Cart is empty",
          invalidPhone: "Enter a valid Cyprus mobile: 8 digits without +357.",
          shopClosed: "The shop is closed on this date.",
          outsideHours: "That time is outside opening hours.",
          tooSoon: "That time is too soon. Please choose a later time.",
          pastTime: "That time has already passed.",
          shopClosedNow: "The shop is closed right now.",
          deliveryRequired: "Delivery address and location are required.",
          outOfZone: "We do not deliver to this area.",
          deliveryDisabled: "Delivery is not available right now.",
          orderFailed: "Order failed. Please try again.",
        };

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return NextResponse.json({ error: t.noShop }, { status: 500 });
  }

  const cart = await resolveCartLines(shop.id, payload.items);
  if (!cart.ok) {
    return NextResponse.json(
      { error: cart.error === "EMPTY_CART" ? t.emptyCart : "Invalid cart" },
      { status: 400 },
    );
  }

  let phoneE164: string;
  try {
    phoneE164 = normalizePhone(payload.phone);
  } catch {
    return NextResponse.json(
      { error: t.invalidPhone, code: "INVALID_PHONE" },
      { status: 400 },
    );
  }

  let requestedAt: Date;
  if (payload.timing === "ASAP") {
    requestedAt = new Date();
  } else {
    const [hour, minute] = payload.scheduledTime!.split(":").map(Number);
    requestedAt = zonedWallTimeToUtc(payload.scheduledDate!, hour, minute, 0, shop.timezone);
  }

  const timeCheck = await validateRequestedAtTime({
    shop,
    requestedAt,
    fulfillmentType: payload.fulfillmentType,
    isAsap: payload.timing === "ASAP",
  });
  if (!timeCheck.ok) {
    const msg =
      timeCheck.error === "SHOP_CLOSED"
        ? payload.timing === "ASAP"
          ? t.shopClosedNow
          : t.shopClosed
        : timeCheck.error === "OUTSIDE_HOURS"
          ? t.outsideHours
          : timeCheck.error === "TOO_SOON"
            ? t.tooSoon
            : t.pastTime;
    return NextResponse.json({ error: msg, code: timeCheck.error }, { status: 409 });
  }

  let deliveryDistanceMeters: number | null = null;
  if (payload.fulfillmentType === "DELIVERY") {
    if (
      !payload.deliveryAddress?.trim() ||
      payload.deliveryLat == null ||
      payload.deliveryLng == null
    ) {
      return NextResponse.json(
        { error: t.deliveryRequired, code: "DELIVERY_REQUIRED" },
        { status: 400 },
      );
    }
    const zone = validateDeliveryLocation(shop, {
      lat: payload.deliveryLat,
      lng: payload.deliveryLng,
    });
    if (!zone.ok) {
      const msg =
        zone.error === "DELIVERY_DISABLED"
          ? t.deliveryDisabled
          : zone.error === "OUT_OF_DELIVERY_ZONE"
            ? t.outOfZone
            : t.deliveryRequired;
      return NextResponse.json({ error: msg, code: zone.error }, { status: 422 });
    }
    deliveryDistanceMeters = zone.distanceMeters;
  }

  const orderDate = orderDateForInstant(new Date(), shop.timezone);
  const orderNumber = await getNextOrderNumber(shop.id, orderDate);
  const subtotalCents = cart.subtotalCents;
  const totalCents = subtotalCents;

  const customer = await prisma.customer.upsert({
    where: { shopId_phoneE164: { shopId: shop.id, phoneE164 } },
    create: { shopId: shop.id, name: payload.name, phoneE164 },
    update: { name: payload.name },
  });

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      customerId: customer.id,
      orderNumber,
      orderDate,
      fulfillmentType: payload.fulfillmentType as FulfillmentType,
      deliveryAddress:
        payload.fulfillmentType === "DELIVERY" ? payload.deliveryAddress!.trim() : null,
      deliveryLat: payload.fulfillmentType === "DELIVERY" ? payload.deliveryLat : null,
      deliveryLng: payload.fulfillmentType === "DELIVERY" ? payload.deliveryLng : null,
      deliveryPlaceId:
        payload.fulfillmentType === "DELIVERY" ? payload.deliveryPlaceId ?? null : null,
      deliveryDistanceMeters,
      requestedAt,
      subtotalCents,
      totalCents,
      status: "CONFIRMED",
      locale: lang,
      notes: payload.notes?.trim() || null,
      items: {
        create: cart.lines.map((line) => ({
          menuItemId: line.menuItemId,
          nameSnapshot: line.name,
          priceCentsSnapshot: line.priceCents,
          quantity: line.quantity,
        })),
      },
    },
    include: { items: true },
  });

  const manageUrl = await createOrderManageUrl({
    shopId: shop.id,
    phoneE164,
    orderId: order.id,
    order,
    shop,
    purpose: "confirm",
    request,
  });

  const when = smsWhenFromInstant(requestedAt, shop.timezone, lang);
  const message = buildOrderConfirmedSms({
    shopName: shop.name,
    orderNumber: order.orderNumber,
    when,
    manageUrl,
    lang,
    fulfillmentType: order.fulfillmentType,
    deliveryAddress: order.deliveryAddress,
  });

  try {
    await sendBookingSms({ phoneE164, body: message });
  } catch (smsError) {
    console.error("SMS failed after order created; rolling back", smsError);
    await prisma.order.delete({ where: { id: order.id } }).catch(() => {});
    return NextResponse.json({ error: t.orderFailed }, { status: 502 });
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    manageUrl,
    totalCents: order.totalCents,
  });
}
