"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { Locale } from "@/lib/locale";
import { isDashboardMutationAuthorized } from "@/lib/dashboard-auth";
import { prisma } from "@/lib/prisma";

function unauthorizedMessage(lang: Locale) {
  return lang === "el"
    ? "Η ενέργεια απαιτεί έγκυρο dashboard link."
    : "This action requires a valid dashboard link.";
}

export async function addShopClosureFromDashboard(
  startDate: string,
  endDate: string,
  label: string | undefined,
  lang: Locale,
) {
  const h = await headers();
  if (!(await isDashboardMutationAuthorized(h))) {
    return { ok: false as const, error: unauthorizedMessage(lang) };
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return { ok: false as const, error: "No shop" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false as const, error: lang === "el" ? "Μη έγκυρες ημερομηνίες." : "Invalid dates." };
  }

  await prisma.shopClosure.create({
    data: { shopId: shop.id, startDate, endDate, label: label?.trim() || null },
  });

  revalidatePath("/dashboard/closures");
  return { ok: true as const };
}

export async function deleteShopClosureFromDashboard(id: string, lang: Locale) {
  const h = await headers();
  if (!(await isDashboardMutationAuthorized(h))) {
    return { ok: false as const, error: unauthorizedMessage(lang) };
  }

  const shop = await prisma.shop.findFirst();
  if (!shop) {
    return { ok: false as const, error: "No shop" };
  }

  const deleted = await prisma.shopClosure.deleteMany({
    where: { id, shopId: shop.id },
  });

  if (deleted.count === 0) {
    return { ok: false as const, error: "Not found" };
  }

  revalidatePath("/dashboard/closures");
  return { ok: true as const };
}