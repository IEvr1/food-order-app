/**
 * Cyprus VAT rates for restaurant food & drink orders.
 *
 * Per Cyprus Tax Department Circular 11/2022 (effective 6/12/2022):
 * - 9%: Restaurant & catering services — businesses that prepare food with
 *   support services (kitchen, order-taking, preparation). Applies to all
 *   customers (pickup/delivery) including food and drinks.
 * - 5%: Takeaway food without catering support services (food only).
 * - 19%: Soft drinks & alcoholic beverages on takeaway outside catering scope.
 *
 * Menu prices in this app are VAT-inclusive (gross).
 */

/** VAT rates in basis points (1% = 100 bps). */
export const CYPRUS_VAT_RATE_BPS = {
  STANDARD: 1900,
  RESTAURANT_CATERING: 900,
  TAKEAWAY_FOOD: 500,
} as const;

/** Rate for prepared orders from establishments offering meals (Circular 11/2022 a). */
export const RESTAURANT_ORDER_VAT_RATE_BPS = CYPRUS_VAT_RATE_BPS.RESTAURANT_CATERING;

export type VatBreakdownGroup = {
  rateBps: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
};

export type OrderVatSummary = {
  grossCents: number;
  netCents: number;
  vatCents: number;
  groups: VatBreakdownGroup[];
};

/** Split a VAT-inclusive gross amount into net + VAT. */
export function splitGrossToNetAndVat(
  grossCents: number,
  rateBps: number,
): { netCents: number; vatCents: number } {
  const netCents = Math.round((grossCents * 10000) / (10000 + rateBps));
  const vatCents = grossCents - netCents;
  return { netCents, vatCents };
}

/** Summarise VAT for a cart where line prices include VAT. */
export function calculateRestaurantOrderVat(
  lines: { lineTotalCents: number }[],
): OrderVatSummary {
  const rateBps = RESTAURANT_ORDER_VAT_RATE_BPS;
  let grossCents = 0;
  let netCents = 0;
  let vatCents = 0;

  for (const line of lines) {
    grossCents += line.lineTotalCents;
    const split = splitGrossToNetAndVat(line.lineTotalCents, rateBps);
    netCents += split.netCents;
    vatCents += split.vatCents;
  }

  return {
    grossCents,
    netCents,
    vatCents,
    groups: [{ rateBps, grossCents, netCents, vatCents }],
  };
}

export function vatRatePercent(rateBps: number): number {
  return rateBps / 100;
}

export function formatVatLabel(rateBps: number, locale: "el" | "en"): string {
  const pct = vatRatePercent(rateBps);
  const formatted = Number.isInteger(pct) ? String(pct) : pct.toFixed(1);
  return locale === "el" ? `ΦΠΑ ${formatted}%` : `VAT ${formatted}%`;
}
