import { NextResponse } from "next/server";
import { ensureShopSeed } from "@/lib/bootstrap";
import { isDeliveryEnabled } from "@/lib/delivery-zone";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await ensureShopSeed();

  const shop = await prisma.shop.findFirst({
    include: {
      categories: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        include: {
          items: {
            where: { active: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      hours: true,
    },
  });

  if (!shop) {
    return NextResponse.json({ error: "Shop not found" }, { status: 500 });
  }

  return NextResponse.json({
    shop: {
      id: shop.id,
      name: shop.name,
      timezone: shop.timezone,
      deliveryEnabled: isDeliveryEnabled(shop),
      latitude: shop.latitude,
      longitude: shop.longitude,
      deliveryRadiusMeters: shop.deliveryRadiusMeters,
      prepMinutes: shop.prepMinutes,
      deliveryPrepMinutes: shop.deliveryPrepMinutes,
    },
    categories: shop.categories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        priceCents: i.priceCents,
      })),
    })),
  });
}
