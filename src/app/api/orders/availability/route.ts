import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { parseLocale } from "@/lib/locale";
import { listOrderTimeSlots } from "@/lib/order";
import { prisma } from "@/lib/prisma";
import { localeTagForLang, todayIsoInTimeZone } from "@/lib/timezone";

const schema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  fulfillmentType: z.enum(["PICKUP", "DELIVERY"]).optional(),
  lang: z.enum(["el", "en"]).optional(),
});

export async function GET(request: Request) {
  await ensureShopSeed();

  const url = new URL(request.url);
  const parsed = schema.safeParse({
    date: url.searchParams.get("date") ?? undefined,
    fulfillmentType: url.searchParams.get("fulfillmentType") ?? undefined,
    lang: url.searchParams.get("lang") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 500 });
  }

  const today = todayIsoInTimeZone(shop.timezone);
  const dateIso = parsed.data.date ?? today;

  const lang = parseLocale(parsed.data.lang);
  const slots = parsed.data.date
    ? await listOrderTimeSlots({
        shop,
        dateIso,
        fulfillmentType: parsed.data.fulfillmentType,
        locale: localeTagForLang(lang),
      })
    : [];

  return NextResponse.json({
    date: dateIso,
    today,
    timezone: shop.timezone,
    slots,
  });
}
