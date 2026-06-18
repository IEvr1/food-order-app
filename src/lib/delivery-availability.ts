import { isDeliveryEnabled, type ShopDeliveryConfig } from "@/lib/delivery-zone";
import { validateRequestedAtTime } from "@/lib/order";
import { prisma } from "@/lib/prisma";

type ShopDeliveryContext = ShopDeliveryConfig & {
  id: string;
  timezone: string;
  prepMinutes: number;
  deliveryPrepMinutes: number;
};

export type CustomerDeliveryStatus = {
  /** Location + radius configured for zone checks */
  geoConfigured: boolean;
  /** At least one weekday has delivery hours */
  hasDeliveryHours: boolean;
  /** Geo + delivery hours — customer may choose delivery (incl. scheduled) */
  enabled: boolean;
  /** Current time is inside today's delivery hours */
  openNow: boolean;
};

export async function getCustomerDeliveryStatus(
  shop: ShopDeliveryContext,
  now: Date = new Date(),
): Promise<CustomerDeliveryStatus> {
  const geoConfigured = isDeliveryEnabled(shop);
  const deliveryHoursCount = await prisma.shopDeliveryHours.count({
    where: { shopId: shop.id },
  });
  const hasDeliveryHours = deliveryHoursCount > 0;
  const enabled = geoConfigured && hasDeliveryHours;

  if (!enabled) {
    return {
      geoConfigured,
      hasDeliveryHours,
      enabled: false,
      openNow: false,
    };
  }

  const openCheck = await validateRequestedAtTime({
    shop,
    requestedAt: now,
    fulfillmentType: "DELIVERY",
    isAsap: true,
    now,
  });

  return {
    geoConfigured,
    hasDeliveryHours,
    enabled: true,
    openNow: openCheck.ok,
  };
}
