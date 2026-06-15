import { NextResponse } from "next/server";
import { getManageSessionPayload } from "@/lib/manage-from-request";
import { canCustomerManageOrder } from "@/lib/order";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { buildOrderStatusSms } from "@/lib/order-messages";
import { sendBookingSms } from "@/lib/sms";
import { createSmsManageUrl, smsWhenFromInstant } from "@/lib/sms-templates";

export async function POST(request: Request) {
  const lang = parseLocale(new URL(request.url).searchParams.get("lang"));
  const session = await getManageSessionPayload();
  if (!session?.orderId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.order.findFirst({
    where: { id: session.orderId, shopId: session.shopId },
    include: { customer: true, shop: true },
  });

  if (!order || order.customer.phoneE164 !== session.phoneE164) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!canCustomerManageOrder(order, order.shop)) {
    return NextResponse.json(
      { error: lang === "el" ? "Η παραγγελία δεν μπορεί πλέον να ακυρωθεί." : "Order can no longer be cancelled." },
      { status: 409 },
    );
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });

  const manageUrl = await createSmsManageUrl({
    shopId: order.shopId,
    phoneE164: order.customer.phoneE164,
    request,
  });

  const when = smsWhenFromInstant(order.requestedAt, order.shop.timezone, lang);
  const message = buildOrderStatusSms("ORDER_CANCELLED", {
    shopName: order.shop.name,
    orderNumber: order.orderNumber,
    manageUrl,
    lang,
    when,
  });

  if (message) {
    try {
      await sendBookingSms({ phoneE164: order.customer.phoneE164, body: message });
    } catch (error) {
      console.error("Cancel SMS failed", error);
    }
  }

  return NextResponse.json({ ok: true });
}
