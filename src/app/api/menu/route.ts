import { NextResponse } from "next/server";
import { ensureShopSeed } from "@/lib/bootstrap";
import { getCustomerDeliveryStatus } from "@/lib/delivery-availability";
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

  const delivery = await getCustomerDeliveryStatus(shop);

  return NextResponse.json({
    shop: {
      id: shop.id,
      name: shop.name,
      timezone: shop.timezone,
      deliveryEnabled: delivery.enabled,
      deliveryOpenNow: delivery.openNow,
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
