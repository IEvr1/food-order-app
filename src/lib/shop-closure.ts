import { prisma } from "@/lib/prisma";

/** `isoDate` and closure rows are shop-local calendar YYYY-MM-DD strings. */
export async function isShopClosedOnLocalDate(
  shopId: string,
  isoDate: string,
): Promise<boolean> {
  const row = await prisma.shopClosure.findFirst({
    where: {
      shopId,
      startDate: { lte: isoDate },
      endDate: { gte: isoDate },
    },
    select: { id: true },
  });
  return Boolean(row);
}
