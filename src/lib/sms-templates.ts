import type { FulfillmentType } from "@prisma/client";
import type { Locale } from "@/lib/locale";
import { parseLocale } from "@/lib/locale";
import { createDeepLinkToken } from "@/lib/deep-link-token";
import { getSmsLinkBaseUrl } from "@/lib/sms-link-base";
import {
  getManageLinkTtlSeconds,
  type ManageLinkOrder,
  type ManageLinkPurpose,
  type ShopPrepTimes,
} from "@/lib/order";
import { formatSalonSmsWhen, type SalonSmsWhen } from "@/lib/timezone";

export function resolveOrderLocale(locale?: string | null): Locale {
  return parseLocale(locale);
}

type OrderSmsBase = {
  shopName: string;
  orderNumber: number;
  manageUrl: string;
  lang: Locale;
};

type OrderConfirmedParams = OrderSmsBase & {
  when: SalonSmsWhen;
  fulfillmentType: FulfillmentType;
  deliveryAddress?: string | null;
};

export function buildOrderConfirmedSms(params: OrderConfirmedParams): string {
  const { shopName, orderNumber, when, manageUrl, lang, fulfillmentType, deliveryAddress } =
    params;
  const num = `#${orderNumber}`;
  if (lang === "el") {
    const fulfillment =
      fulfillmentType === "DELIVERY"
        ? `delivery στη ${deliveryAddress ?? "διεύθυνσή σας"}`
        : `παραλαβή ${when.day} ${when.date} στις ${when.time}`;
    return `${shopName}: Η παραγγελία σας, στο ${num} επιβεβαιώθηκε! ${fulfillment}.\nΔιαχείριση παραγγελίας: ${manageUrl}`;
  }
  const fulfillment =
    fulfillmentType === "DELIVERY"
      ? `delivery to ${deliveryAddress ?? "your address"}`
      : `pickup on ${when.day} ${when.date} at ${when.time}`;
  return `${shopName}: Order ${num} confirmed! ${fulfillment}.\nManage your order: ${manageUrl}`;
}

export function buildOrderReadySms(params: OrderSmsBase): string {
  const { shopName, orderNumber, manageUrl, lang } = params;
  const num = `#${orderNumber}`;
  if (lang === "el") {
    return `${shopName}: Η παραγγελία σας, στο ${num} είναι έτοιμη για παραλαβή!\n${manageUrl}`;
  }
  return `${shopName}: Order ${num} is ready for pickup!\n${manageUrl}`;
}

export function buildOrderOutForDeliverySms(
  params: OrderSmsBase & { etaMinutes?: number; arrivalTime?: string },
): string {
  const { shopName, orderNumber, manageUrl, lang, etaMinutes, arrivalTime } = params;
  const num = `#${orderNumber}`;
  const etaSuffix =
    etaMinutes != null && arrivalTime
      ? lang === "el"
        ? ` Εκτιμώμενη άφιξη σε ~${etaMinutes} λεπτά, στις ${arrivalTime}.`
        : ` Estimated arrival in ~${etaMinutes} min, by ${arrivalTime}.`
      : "";
  if (lang === "el") {
    return `${shopName}: Η παραγγελία σας, στο ${num} είναι στο δρόμο!${etaSuffix}\n${manageUrl}`;
  }
  return `${shopName}: Order ${num} is on its way!${etaSuffix}\n${manageUrl}`;
}

export function buildOrderCancelledSms(params: OrderSmsBase & { when?: SalonSmsWhen }): string {
  const { shopName, orderNumber, manageUrl, lang } = params;
  const num = `#${orderNumber}`;
  if (lang === "el") {
    return `${shopName}: Η παραγγελία σας, στο ${num} ακυρώθηκε.\nΝέα παραγγελία: ${manageUrl}`;
  }
  return `${shopName}: Order ${num} was cancelled.\nOrder again: ${manageUrl}`;
}

export function buildOrderModifiedSms(params: OrderSmsBase): string {
  const { shopName, orderNumber, manageUrl, lang } = params;
  const num = `#${orderNumber}`;
  if (lang === "el") {
    return `${shopName}: Η παραγγελία σας, στο ${num} ενημερώθηκε.\nΔείτε τις λεπτομέρειες: ${manageUrl}`;
  }
  return `${shopName}: Order ${num} was updated.\nView details: ${manageUrl}`;
}

export function smsWhenFromInstant(
  instant: Date,
  timeZone: string,
  lang: Locale,
): SalonSmsWhen {
  return formatSalonSmsWhen(instant, timeZone, lang);
}

export async function createSmsManageUrl(params: {
  shopId: string;
  phoneE164: string;
  orderId?: string;
  request?: Request;
  ttlSeconds?: number;
}): Promise<string> {
  const { shortCode } = await createDeepLinkToken(
    {
      shopId: params.shopId,
      phoneE164: params.phoneE164,
      orderId: params.orderId,
    },
    params.ttlSeconds ? { ttlSeconds: params.ttlSeconds } : undefined,
  );
  const base = getSmsLinkBaseUrl(params.request);
  return `${base}/l/${shortCode}`;
}

export async function createOrderManageUrl(params: {
  shopId: string;
  phoneE164: string;
  order: ManageLinkOrder;
  shop: ShopPrepTimes;
  orderId?: string;
  purpose?: ManageLinkPurpose;
  request?: Request;
}): Promise<string> {
  const ttlSeconds = getManageLinkTtlSeconds(
    params.order,
    params.shop,
    params.purpose ?? "confirm",
  );
  return createSmsManageUrl({
    shopId: params.shopId,
    phoneE164: params.phoneE164,
    orderId: params.orderId,
    request: params.request,
    ttlSeconds,
  });
}
