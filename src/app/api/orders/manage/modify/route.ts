import { NextResponse } from "next/server";
import { FulfillmentType } from "@prisma/client";
import { z } from "zod";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import { validateDeliveryLocation } from "@/lib/delivery-zone";
import {
  canCustomerManageOrder,
  resolveCartLines,
  validateRequestedAtTime,
} from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { sendBookingSms } from "@/lib/sms";
import { buildOrderModifiedSms, createSmsManageUrl } from "@/lib/sms-templates";
import { zonedWallTimeToUtc } from "@/lib/timezone";

const cartLineSchema = z.object({
  menuItemId: z.string(),
  quantity: z.number().int().min(1).max(99),
});

const modifySchema = z
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
    notes: z.string().max(500).optional(),
    deliveryAddress: z.string().max(500).optional(),
    deliveryLat: z.number().optional(),
    deliveryLng: z.number().optional(),
    deliveryPlaceId: z.string().optional(),
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

  if (!canCustomerManageOrder(order, order.shop)) {
    return NextResponse.json({ error: "Order cannot be modified" }, { status: 409 });
  }

  const cart = await resolveCartLines(order.shopId, payload.items);
  if (!cart.ok) {
    return NextResponse.json({ error: "Invalid cart" }, { status: 400 });
  }

  let requestedAt: Date;
  if (payload.timing === "ASAP") {
    requestedAt = new Date();
  } else {
    const [hour, minute] = payload.scheduledTime!.split(":").map(Number);
    requestedAt = zonedWallTimeToUtc(
      payload.scheduledDate!,
      hour,
      minute,
      0,
      order.shop.timezone,
    );
  }

  const timeCheck = await validateRequestedAtTime({
    shop: order.shop,
    requestedAt,
    fulfillmentType: payload.fulfillmentType,
  });
  if (!timeCheck.ok) {
    return NextResponse.json({ error: timeCheck.error, code: timeCheck.error }, { status: 409 });
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
        requestedAt,
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
