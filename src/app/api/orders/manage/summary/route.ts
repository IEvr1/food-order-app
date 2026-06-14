import { NextResponse } from "next/server";
import type { Order, OrderItem } from "@prisma/client";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import {
  canCustomerManageOrder,
  formatPriceEuros,
  orderUiPhase,
  serializeOrderItems,
} from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { formatSalonDateTimeDisplay, localeTagForLang } from "@/lib/timezone";

type OrderWithItems = Order & { items: OrderItem[] };

function serializeOrderSummary(
  order: OrderWithItems,
  now: Date,
  shopTimezone: string,
  locale: string,
) {
  const uiPhase = orderUiPhase(order, now);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    requestedAt: order.requestedAt.toISOString(),
    requestedAtDisplay: formatSalonDateTimeDisplay(order.requestedAt, shopTimezone, locale),
    status: order.status,
    fulfillmentType: order.fulfillmentType,
    deliveryAddress: order.deliveryAddress,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    subtotalCents: order.subtotalCents,
    totalCents: order.totalCents,
    totalDisplay: formatPriceEuros(order.totalCents, locale),
    notes: order.notes,
    items: serializeOrderItems(order.items),
    uiPhase,
    canManage: canCustomerManageOrder(order.status),
  };
}

async function loadActiveOrders(customerId: string, shopId: string, now: Date) {
  return prisma.order.findMany({
    where: {
      customerId,
      shopId,
      status: { in: ["PENDING", "CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY"] },
    },
    include: { items: true },
    orderBy: { requestedAt: "asc" },
  });
}

async function loadOrderHistory(customerId: string, shopId: string) {
  return prisma.order.findMany({
    where: { customerId, shopId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 4,
  });
}

export async function GET(request: Request) {
  const lang = parseLocale(new URL(request.url).searchParams.get("lang"));
  const intlLocale = localeTagForLang(lang);

  const session = await getManageSessionPayload();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const shop = await prisma.shop.findFirst({ where: { id: session.shopId } });
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 404 });
  }

  const now = new Date();
  const customer = await prisma.customer.findUnique({
    where: {
      shopId_phoneE164: { shopId: session.shopId, phoneE164: session.phoneE164 },
    },
  });

  const orderHistoryRows = customer
    ? await loadOrderHistory(customer.id, session.shopId)
    : [];
  const orderHistory = orderHistoryRows.map((o) =>
    serializeOrderSummary(o, now, shop.timezone, intlLocale),
  );

  if (!session.orderId) {
    const activeRows = customer ? await loadActiveOrders(customer.id, session.shopId, now) : [];
    const activeOrders = activeRows.map((o) =>
      serializeOrderSummary(o, now, shop.timezone, intlLocale),
    );
    return NextResponse.json({
      shopName: shop.name,
      shopTimezone: shop.timezone,
      customerName: customer?.name ?? null,
      customerPhone: session.phoneE164,
      order: null,
      uiPhase: "no_order" as const,
      canManage: false,
      activeOrders,
      orderHistory,
    });
  }

  const order = await prisma.order.findFirst({
    where: { id: session.orderId, shopId: session.shopId },
    include: { items: true, customer: true },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.customer.phoneE164 !== session.phoneE164) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const activeRows = await loadActiveOrders(order.customerId, session.shopId, now);
  const activeOrders = activeRows.map((o) =>
    serializeOrderSummary(o, now, shop.timezone, intlLocale),
  );

  return NextResponse.json({
    shopName: shop.name,
    shopTimezone: shop.timezone,
    customerName: order.customer.name,
    customerPhone: order.customer.phoneE164,
    order: serializeOrderSummary(order, now, shop.timezone, intlLocale),
    uiPhase: orderUiPhase(order, now),
    canManage: canCustomerManageOrder(order.status),
    activeOrders,
    orderHistory,
  });
}
