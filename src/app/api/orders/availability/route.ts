import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { listOrderTimeSlots } from "@/lib/order";
import { prisma } from "@/lib/prisma";
import { todayIsoInTimeZone } from "@/lib/timezone";

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function GET(request: Request) {
  await ensureShopSeed();

  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  const parsed = schema.safeParse({ date });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 500 });
  }

  const slots = await listOrderTimeSlots({
    shop,
    dateIso: parsed.data.date,
  });

  return NextResponse.json({
    date: parsed.data.date,
    today: todayIsoInTimeZone(shop.timezone),
    timezone: shop.timezone,
    slots,
  });
}
