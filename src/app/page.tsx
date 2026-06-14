import { redirect } from "next/navigation";
import { parseLocale } from "@/lib/locale";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const lang = parseLocale(params.lang);

  redirect(`/chat?lang=${lang}`);
}
