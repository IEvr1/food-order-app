import { NextResponse } from "next/server";
import { FulfillmentType } from "@prisma/client";
import { z } from "zod";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import { validateDeliveryLocation } from "@/lib/delivery-zone";
import {
  canCustomerManageOrder,
  listOrderTimeSlots,
  resolveCartLines,
} from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { isShopClosedOnLocalDate } from "@/lib/shop-closure";
import { sendBookingSms } from "@/lib/sms";
import { buildOrderModifiedSms, createSmsManageUrl } from "@/lib/sms-templates";
import { isoDateInTimeZone } from "@/lib/timezone";

const cartLineSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(99),
});

const modifySchema = z.object({
  items: z.array(cartLineSchema).min(1),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]),
  requestedAt: z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()))
    .transform((s) => new Date(s)),
  notes: z.string().max(500).optional(),
  deliveryAddress: z.string().max(500).optional(),
  deliveryLat: z.number().optional(),
  deliveryLng: z.number().optional(),
  deliveryPlaceId: z.string().optional(),
});

export async function POST(request: Request) {
  const lang = parseLocale(new URL(request.url).searchParams.get("lang"));
  const session = await getManageSessionPayload();
  if (!session?.orderId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: z.infer<typeof modifySchema>;
  try {
    payload = modifySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const order = await prisma.order.findFirst({
    where: { id: session.orderId, shopId: session.shopId },
    include: { customer: true, shop: true },
  });

  if (!order || order.customer.phoneE164 !== session.phoneE164) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canCustomerManageOrder(order.status)) {
    return NextResponse.json({ error: "Order cannot be modified" }, { status: 409 });
  }

  const cart = await resolveCartLines(order.shopId, payload.items);
  if (!cart.ok) {
    return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  }

  const localDate = isoDateInTimeZone(payload.requestedAt, order.shop.timezone);
  if (await isShopClosedOnLocalDate(order.shopId, localDate)) {
    return NextResponse.json({ error: "Shop closed" }, { status: 409 });
  }

  const slots = await listOrderTimeSlots({ shop: order.shop, dateIso: localDate });
  if (!slots.some((s) => s.iso === payload.requestedAt.toISOString())) {
    return NextResponse.json({ error: "Slot unavailable", code: "SLOT_UNAVAILABLE" }, { status: 409 });
  }

  let deliveryDistanceMeters: number | null = null;
  if (payload.fulfillmentType === "DELIVERY") {
    if (
      !payload.deliveryAddress?.trim() ||
      payload.deliveryLat == null ||
      payload.deliveryLng == null
    ) {
      return NextResponse.json({ error: "Delivery required" }, { status: 400 });
    }
    const zone = validateDeliveryLocation(order.shop, {
      lat: payload.deliveryLat,
      lng: payload.deliveryLng,
    });
    if (!zone.ok) {
      return NextResponse.json({ error: zone.error, code: zone.error }, { status: 422 });
    }
    deliveryDistanceMeters = zone.distanceMeters;
  }

  await prisma.$transaction([
    prisma.orderItem.deleteMany({ where: { orderId: order.id } }),
    prisma.order.update({
      where: { id: order.id },
      data: {
        fulfillmentType: payload.fulfillmentType as FulfillmentType,
        deliveryAddress:
          payload.fulfillmentType === "DELIVERY" ? payload.deliveryAddress!.trim() : null,
        deliveryLat: payload.fulfillmentType === "DELIVERY" ? payload.deliveryLat : null,
        deliveryLng: payload.fulfillmentType === "DELIVERY" ? payload.deliveryLng : null,
        deliveryPlaceId:
          payload.fulfillmentType === "DELIVERY" ? payload.deliveryPlaceId ?? null : null,
        deliveryDistanceMeters,
        requestedAt: payload.requestedAt,
        subtotalCents: cart.subtotalCents,
        totalCents: cart.subtotalCents,
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
    }),
  ]);

  const manageUrl = await createSmsManageUrl({
    shopId: order.shopId,
    phoneE164: order.customer.phoneE164,
    orderId: order.id,
    request,
  });

  const message = buildOrderModifiedSms({
    shopName: order.shop.name,
    orderNumber: order.orderNumber,
    manageUrl,
    lang,
  });

  try {
    await sendBookingSms({ phoneE164: order.customer.phoneE164, body: message });
  } catch (error) {
    console.error("Modify SMS failed", error);
  }

  return NextResponse.json({ ok: true });
}
