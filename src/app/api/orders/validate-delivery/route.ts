import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureShopSeed } from "@/lib/bootstrap";
import { validateDeliveryLocation } from "@/lib/delivery-zone";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export async function POST(request: Request) {
  await ensureShopSeed();

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 500 });
  }

  const result = validateDeliveryLocation(shop, {
    lat: payload.lat,
    lng: payload.lng,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        maxRadiusMeters: shop.deliveryRadiusMeters,
      },
      { status: result.error === "OUT_OF_DELIVERY_ZONE" ? 422 : 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    distanceMeters: result.distanceMeters,
    maxRadiusMeters: shop.deliveryRadiusMeters,
  });
}
