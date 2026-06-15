"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseLocale, type Locale } from "@/lib/locale";

export function DashboardLangSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = parseLocale(searchParams.get("lang"));

  const switchLang = (next: Locale) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-xs shadow-sm ring-1 ring-zinc-200 backdrop-blur"
      aria-label="Language"
    >
      <button
        type="button"
        onClick={() => switchLang("el")}
        className={current === "el" ? "font-bold text-orange-600" : "text-zinc-500 hover:text-zinc-800"}
      >
        EL
      </button>
      <span className="text-zinc-300">|</span>
      <button
        type="button"
        onClick={() => switchLang("en")}
        className={current === "en" ? "font-bold text-orange-600" : "text-zinc-500 hover:text-zinc-800"}
      >
        EN
      </button>
    </div>
  );
}
