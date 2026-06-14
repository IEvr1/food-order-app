import { ensureShopSeed } from "@/lib/bootstrap";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { todayIsoInTimeZone } from "@/lib/timezone";
import { DashboardClosuresPanel } from "@/app/dashboard/dashboard-closures-panel";
import { isDashboardLinkAuthAvailable } from "@/lib/dashboard-auth";
import Link from "next/link";

export default async function ClosuresPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  await ensureShopSeed();
  const shop = await prisma.shop.findFirst();
  if (!shop) return <p>No shop</p>;

  const closures = await prisma.shopClosure.findMany({
    where: { shopId: shop.id },
    orderBy: { startDate: "desc" },
  });

  const t =
    lang === "el"
      ? {
          back: "Πίσω",
          title: "Κλειστές ημέρες",
          subtitle: "Δεν δέχονται παραγγελίες σε αυτές τις ημερομηνίες.",
          from: "Από",
          to: "Έως",
          note: "Σημείωση",
          add: "Προσθήκη",
          delete: "Διαγραφή",
          empty: "Δεν υπάρχουν κλειστές περίοδοι.",
          working: "Αποθήκευση...",
          listHeading: "Καταχωρημένες περίοδοι",
        }
      : {
          back: "Back",
          title: "Closed days",
          subtitle: "No orders accepted on these dates.",
          from: "From",
          to: "To",
          note: "Note",
          add: "Add",
          delete: "Delete",
          empty: "No closure periods.",
          working: "Saving...",
          listHeading: "Saved periods",
        };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/dashboard?lang=${lang}`} className="text-sm text-orange-600 underline">
        ← {t.back}
      </Link>
      <DashboardClosuresPanel
        lang={lang}
        closures={closures}
        mutationsAllowed={isDashboardLinkAuthAvailable()}
        labels={t}
      />
    </div>
  );
}
