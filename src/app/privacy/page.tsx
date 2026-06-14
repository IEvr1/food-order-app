import Link from "next/link";
import { ensureShopSeed } from "@/lib/bootstrap";
import { parseLocale } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  await ensureShopSeed();
  const params = await searchParams;
  const lang = parseLocale(params.lang);
  const shop = await prisma.shop.findFirst({ select: { name: true } });
  const shopName = shop?.name ?? (lang === "el" ? "το κατάστημα" : "the shop");

  const t =
    lang === "el"
      ? {
          title: "Πολιτική απορρήτου",
          back: "← Επιστροφή στην παραγγελία",
          intro: (name: string) =>
            `Η ${name} συλλέγει τα ελάχιστα προσωπικά δεδομένα που χρειάζονται για online παραγγελίες φαγητού και σχετικά SMS.`,
          sections: [
            {
              heading: "Τι συλλέγουμε",
              body: "Όνομα, κινητό τηλέφωνο (κυπριακό), στοιχεία παραγγελίας, ώρα παραλαβής/παράδοσης και διεύθυνση delivery (με συντεταγμένες από Google Maps). Τα SMS περιέχουν σύνδεσμο διαχείρισης της παραγγελίας σας.",
            },
            {
              heading: "Γιατί τα χρησιμοποιούμε",
              body: "Για επιβεβαίωση, αλλαγή ή ακύρωση παραγγελίας και για τη λειτουργία του συστήματος παραγγελιών.",
            },
            {
              heading: "Πόσο τα κρατάμε",
              body: "Το όνομα και το τηλέφωνο διατηρούνται έως 12 μήνες μετά την τελευταία παραγγελία σας.",
            },
            {
              heading: "Με ποιον τα μοιραζόμαστε",
              body: "Πάροχοι φιλοξενίας, βάσης δεδομένων, SMS gateway/Twilio και Google Maps για επιβεβαίωση διεύθυνσης delivery.",
            },
            {
              heading: "Τα δικαιώματά σας",
              body: "Μπορείτε να ζητήσετε πρόσβαση, διόρθωση ή διαγραφή επικοινωνώντας με το κατάστημα. Καταγγελία: www.dataprotection.gov.cy",
            },
          ],
          updated: "Τελευταία ενημέρωση: Μάιος 2026",
        }
      : {
          title: "Privacy policy",
          back: "← Back to ordering",
          intro: (name: string) =>
            `${name} collects the minimum personal data needed for online food orders and related SMS.`,
          sections: [
            {
              heading: "What we collect",
              body: "Name, Cyprus mobile, order details, pickup/delivery time, and delivery address with Google Maps coordinates. SMS may include an order management link.",
            },
            {
              heading: "Why we use it",
              body: "To confirm, change, or cancel orders and operate the ordering system.",
            },
            {
              heading: "How long we keep it",
              body: "Name and phone are kept up to 12 months after your last order.",
            },
            {
              heading: "Who we share with",
              body: "Hosting, database, SMS gateway/Twilio, and Google Maps for delivery address confirmation.",
            },
            {
              heading: "Your rights",
              body: "Contact the shop for access, correction, or erasure. Complaints: www.dataprotection.gov.cy",
            },
          ],
          updated: "Last updated: May 2026",
        };

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link
          href={`/chat?lang=${lang}`}
          className="text-sm font-medium text-orange-700 hover:text-orange-900"
        >
          {t.back}
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">{t.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t.intro(shopName)}</p>
      </div>

      <div className="flex flex-col gap-5">
        {t.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="text-base font-semibold text-orange-900">{section.heading}</h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="text-xs text-zinc-500">{t.updated}</p>
    </main>
  );
}
