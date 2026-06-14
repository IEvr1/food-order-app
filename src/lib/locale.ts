export type Locale = "el" | "en";

export function parseLocale(value?: string | null): Locale {
  return value === "en" ? "en" : "el";
}
