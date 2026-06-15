import { parseLocale } from "@/lib/locale";
import { ChatPageClient } from "@/app/chat/chat-page-client";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const params = await searchParams;
  const initialLocale = parseLocale(params.lang);

  return <ChatPageClient initialLocale={initialLocale} />;
}
