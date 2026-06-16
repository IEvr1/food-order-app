import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { listOrderTimeSlots } from "@/lib/order";
import { prisma } from "@/lib/prisma";
import { todayIsoInTimeZone } from "@/lib/timezone";

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function GET(request: Request) {
  await ensureShopSeed();

  const url = new URL(request.url);
  const dateParam = url.searchParams.get("date");
  const parsed = schema.safeParse({ date: dateParam ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 500 });
  }

  const today = todayIsoInTimeZone(shop.timezone);
  const dateIso = parsed.data.date ?? today;

  const slots = parsed.data.date
    ? await listOrderTimeSlots({
        shop,
        dateIso,
      })
    : [];

  return NextResponse.json({
    date: dateIso,
    today,
    timezone: shop.timezone,
    slots,
  });
}
