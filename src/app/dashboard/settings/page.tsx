import { ensureShopSeed } from "@/lib/bootstrap";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { ShopSettingsPanel } from "@/app/dashboard/settings/shop-settings-panel";

export default async function DashboardSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) return <p>No shop</p>;

  return (
    <ShopSettingsPanel
      lang={lang}
      shop={{
        name: shop.name,
        latitude: shop.latitude,
        longitude: shop.longitude,
        deliveryRadiusMeters: shop.deliveryRadiusMeters,
        prepMinutes: shop.prepMinutes,
        deliveryPrepMinutes: shop.deliveryPrepMinutes,
      }}
    />
  );
}
